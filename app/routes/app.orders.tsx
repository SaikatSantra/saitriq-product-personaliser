import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState, useMemo } from "react";
import { authenticate } from "../shopify.server";
import {
  listCustomizedOrders,
  createCustomizedOrder,
  updateCustomizedOrderStatus,
  updateCustomizedOrderPreview,
  deleteCustomizedOrder,
} from "../models/order.server";
import { getShop } from "../models/shop.server";
import { renderHighResPrintFile } from "../services/renderer.server";
import { uploadToShopifyFiles } from "../services/shopifyFiles.server";

export function normalizePreviewUrl(rawUrl?: string, shop?: string): string {
  if (!rawUrl) return "";
  const s = String(rawUrl).trim();
  if (!s) return "";
  if (s.startsWith("https://cdn.shopify.com") || s.startsWith("//cdn.shopify.com")) {
    return s.startsWith("//") ? `https:${s}` : s;
  }
  if (s.startsWith("data:image")) return s;
  const match = s.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
  if (match && match[1]) {
    return `/api/preview/${match[1]}`;
  }
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return shop ? `https://${shop}${s.startsWith("/") ? "" : "/"}${s}` : s;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Load shop settings to filter out deleted/hidden orders
  const shopRecord = await getShop(shop);
  let shopSettings: any = {};
  try {
    shopSettings = JSON.parse(shopRecord?.settings || "{}");
  } catch {}
  const hiddenKeys = new Set<string>(shopSettings.hiddenOrderKeys || []);

  // 1. Fetch live orders from Shopify Admin GraphQL API
  let shopifyCustomizedOrders: any[] = [];
  try {
    const response = await admin.graphql(
      `#graphql
      query getRecentOrders {
        orders(first: 35, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            lineItems(first: 20) {
              nodes {
                id
                title
                quantity
                image {
                  url
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }`,
    );

    const json = await response.json();
    const rawOrders = json.data?.orders?.nodes || [];

    for (const order of rawOrders) {
      const orderNumericId = order.id.replace(/^gid:\/\/shopify\/Order\//, "");
      const items = order.lineItems?.nodes || [];

      for (const item of items) {
        const itemNumericId = item.id.replace(/^gid:\/\/shopify\/LineItem\//, "");

        // Skip if order item was deleted by merchant
        if (
          hiddenKeys.has(orderNumericId) ||
          hiddenKeys.has(order.name) ||
          hiddenKeys.has(`${orderNumericId}_${itemNumericId}`) ||
          hiddenKeys.has(`${order.name}_${itemNumericId}`)
        ) {
          continue;
        }

        const attributes: Array<{ key: string; value: string }> = item.customAttributes || [];
        const attrMap: Record<string, string> = {};
        attributes.forEach((a) => {
          attrMap[a.key] = a.value;
        });

        // Check if item has personalizer attributes
        const isCustomized =
          attrMap["_customization_id"] ||
          attrMap["_customization_preview"] ||
          attrMap["Front Preview"] ||
          attrMap["Preview"] ||
          attrMap["Custom Design Preview"] ||
          attrMap["Front Design Preview"] ||
          attrMap["Custom Design"] ||
          attrMap["_template_id"];

        if (isCustomized) {
          const frontPreview =
            attrMap["Front Preview"] ||
            attrMap["Preview"] ||
            attrMap["Front Design Preview"] ||
            attrMap["_customization_preview_front"] ||
            attrMap["Custom Design Preview"] ||
            attrMap["_customization_preview"] ||
            item.image?.url ||
            "";

          const backPreview =
            attrMap["Back Preview"] ||
            attrMap["Back Design Preview"] ||
            attrMap["_customization_preview_back"] ||
            "";

          const frontUploadedImage =
            attrMap["_uploaded_image_front"] ||
            attrMap["Front Uploaded Photo"] ||
            attrMap["Front Uploaded Image"] ||
            "";

          const backUploadedImage =
            attrMap["_uploaded_image_back"] ||
            attrMap["Back Uploaded Photo"] ||
            attrMap["Back Uploaded Image"] ||
            "";

          const uploadedImage =
            frontUploadedImage ||
            backUploadedImage ||
            attrMap["_uploaded_image"] ||
            attrMap["Uploaded Photo"] ||
            attrMap["Uploaded Image"] ||
            attrMap["Custom Photo"] ||
            "";

          shopifyCustomizedOrders.push({
            orderGid: order.id,
            shopifyOrderId: order.name,
            numericOrderId: orderNumericId,
            lineItemId: itemNumericId,
            productTitle: item.title,
            quantity: item.quantity,
            previewImageUrl: frontPreview,
            frontPreviewUrl: frontPreview,
            backPreviewUrl: backPreview,
            uploadedImageUrl: uploadedImage,
            frontUploadedUrl: frontUploadedImage || uploadedImage,
            backUploadedUrl: backUploadedImage,
            customerSelections: attrMap,
            createdAt: order.createdAt,
            financialStatus: order.displayFinancialStatus,
            fulfillmentStatus: order.displayFulfillmentStatus,
            adminOrderUrl: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/orders/${orderNumericId}`,
          });
        }
      }
    }
  } catch (apiErr: any) {
    const errorDetails = apiErr?.graphQLErrors || apiErr?.message || apiErr;
    console.error("[Orders Loader] Error querying Shopify Admin orders:", JSON.stringify(errorDetails, null, 2));
  }

  // 2. Fetch existing DB records
  const dbOrders = await listCustomizedOrders(shop);
  const dbMap = new Map();
  dbOrders.forEach((o) => {
    dbMap.set(`${o.shopifyOrderId}_${o.shopifyLineItemId}`, o);
  });

  // Merge live orders with DB records (auto-registering and syncing with Shopify Files)
  const combinedOrders = await Promise.all(
    shopifyCustomizedOrders.map(async (so) => {
      const dbKey = `${so.numericOrderId}_${so.lineItemId}`;
      let record = dbMap.get(dbKey) || dbMap.get(`${so.shopifyOrderId}_${so.lineItemId}`);

      let resolvedPreview = record?.previewImageUrl || so.previewImageUrl;

      // If not yet saved in Shopify Files, upload now and update DB
      if (admin && resolvedPreview && !resolvedPreview.includes("cdn.shopify.com") && !resolvedPreview.startsWith("data:")) {
        try {
          const cdnUrl = await uploadToShopifyFiles(admin, {
            imageSource: resolvedPreview,
            filename: `order_${so.numericOrderId}_${so.lineItemId}_front.jpg`,
            alt: `Order #${so.numericOrderId} Front Preview`,
          });
          if (cdnUrl) {
            resolvedPreview = cdnUrl;
            if (record) {
              await updateCustomizedOrderPreview(record.id, shop, cdnUrl);
            }
          }
        } catch (uploadErr) {
          console.warn("[Orders Loader] Notice uploading to Shopify Files:", uploadErr);
        }
      }

      if (!record && resolvedPreview) {
        try {
          record = await createCustomizedOrder(shop, {
            shopifyOrderId: so.numericOrderId,
            shopifyLineItemId: so.lineItemId,
            customerSelections: JSON.stringify(so.customerSelections),
            previewImageUrl: resolvedPreview,
          });
        } catch (createErr) {
          // ignore duplicate
        }
      }

      return {
        ...so,
        previewImageUrl: resolvedPreview,
        frontPreviewUrl: resolvedPreview,
        dbId: record?.id || null,
        printFileUrl: record?.printFileUrl || null,
        renderStatus: record?.fulfillmentStatus || "pending",
      };
    }),
  );

  // Add any DB orders that were not returned by Shopify GraphQL
  const processedKeys = new Set(shopifyCustomizedOrders.map((so) => `${so.numericOrderId}_${so.lineItemId}`));
  for (const dbo of dbOrders) {
    const key = `${dbo.shopifyOrderId}_${dbo.shopifyLineItemId}`;
    if (
      hiddenKeys.has(dbo.id) ||
      hiddenKeys.has(dbo.shopifyOrderId) ||
      hiddenKeys.has(key)
    ) {
      continue;
    }

    if (!processedKeys.has(key)) {
      let selections: Record<string, string> = {};
      try {
        selections = JSON.parse(dbo.customerSelections || "{}");
      } catch (e) {}

      const frontPreview =
        dbo.previewImageUrl ||
        selections["Front Preview"] ||
        selections["Preview"] ||
        selections["Front Design Preview"] ||
        selections["_customization_preview_front"] ||
        selections["_customization_preview"] ||
        "";

      const backPreview =
        selections["Back Preview"] ||
        selections["Back Design Preview"] ||
        selections["_customization_preview_back"] ||
        "";

      const frontUploadedImage =
        selections["_uploaded_image_front"] ||
        selections["Front Uploaded Photo"] ||
        selections["Front Uploaded Image"] ||
        "";

      const backUploadedImage =
        selections["_uploaded_image_back"] ||
        selections["Back Uploaded Photo"] ||
        selections["Back Uploaded Image"] ||
        "";

      const uploadedImage =
        frontUploadedImage ||
        backUploadedImage ||
        selections["_uploaded_image"] ||
        selections["Uploaded Photo"] ||
        selections["Uploaded Image"] ||
        selections["Custom Photo"] ||
        "";

      combinedOrders.push({
        orderGid: `gid://shopify/Order/${dbo.shopifyOrderId}`,
        shopifyOrderId: `#${dbo.shopifyOrderId}`,
        numericOrderId: dbo.shopifyOrderId,
        lineItemId: dbo.shopifyLineItemId,
        productTitle: selections["_product_title"] || "Personalized Product",
        quantity: 1,
        previewImageUrl: frontPreview,
        frontPreviewUrl: frontPreview,
        backPreviewUrl: backPreview,
        uploadedImageUrl: uploadedImage,
        frontUploadedUrl: frontUploadedImage || uploadedImage,
        backUploadedUrl: backUploadedImage,
        customerSelections: selections,
        createdAt: dbo.createdAt.toISOString(),
        financialStatus: "PAID",
        fulfillmentStatus: dbo.fulfillmentStatus,
        adminOrderUrl: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/orders/${dbo.shopifyOrderId}`,
        dbId: dbo.id,
        printFileUrl: dbo.printFileUrl || null,
        renderStatus: dbo.fulfillmentStatus,
      });
    }
  }

  return { orders: combinedOrders, shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const orderId = formData.get("orderId") as string;
  const lineItemId = formData.get("lineItemId") as string;
  const previewUrl = formData.get("previewUrl") as string;
  const selectionsRaw = formData.get("selections") as string;
  const dbId = formData.get("dbId") as string;

  if (intent === "generate_print" && orderId && lineItemId) {
    try {
      let selections = {};
      try {
        selections = JSON.parse(selectionsRaw || "{}");
      } catch {}

      const printPdfUrl = await renderHighResPrintFile({
        orderId,
        lineItemId,
        canvasWidth: 1200,
        canvasHeight: 1200,
        printDpi: 300,
        customerSelections: selections,
        previewBase64: previewUrl,
      });

      if (dbId) {
        await updateCustomizedOrderStatus(dbId, session.shop, "completed", printPdfUrl);
      }

      return { success: true, printPdfUrl, message: `Print PDF generated for Order ${orderId}` };
    } catch (err: any) {
      console.error("[Action] Render failed:", err);
      return { success: false, error: err?.message };
    }
  }

  if (intent === "delete_order") {
    await deleteCustomizedOrder(session.shop, {
      id: dbId || undefined,
      shopifyOrderId: orderId || undefined,
      lineItemId: lineItemId || undefined,
    });

    return { success: true, message: `Order ${orderId ? `#${orderId.replace(/\D/g, "")}` : ""} deleted from custom orders list.` };
  }

  return { success: false };
};

export default function CustomizedOrdersPage() {
  const { orders, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "ready" | "pending">("all");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const handleGeneratePrint = (order: any) => {
    fetcher.submit(
      {
        intent: "generate_print",
        orderId: order.numericOrderId,
        lineItemId: order.lineItemId,
        previewUrl: order.previewImageUrl,
        selections: JSON.stringify(order.customerSelections),
        dbId: order.dbId || "",
      },
      { method: "POST" },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    fetcher.submit(
      {
        intent: "delete_order",
        orderId: deleteTarget.numericOrderId || deleteTarget.shopifyOrderId,
        lineItemId: deleteTarget.lineItemId || "",
        dbId: deleteTarget.dbId || "",
      },
      { method: "POST" },
    );
    setDeleteTarget(null);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o: any) => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchOrder = (o.shopifyOrderId || "").toLowerCase().includes(q);
        const matchTitle = (o.productTitle || "").toLowerCase().includes(q);
        const matchSelections = Object.values(o.customerSelections || {}).some((v: any) =>
          String(v).toLowerCase().includes(q),
        );
        if (!matchOrder && !matchTitle && !matchSelections) return false;
      }

      // 2. Tab filter
      const isReady = Boolean(o.printFileUrl || o.renderStatus === "completed");
      if (filterTab === "ready" && !isReady) return false;
      if (filterTab === "pending" && isReady) return false;

      return true;
    });
  }, [orders, searchQuery, filterTab]);

  const completedPrintsCount = orders.filter(
    (o: any) => o.printFileUrl || o.renderStatus === "completed",
  ).length;
  const pendingPrintsCount = orders.length - completedPrintsCount;

  return (
    <s-page heading="Custom orders">
      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">{fetcher.data.message}</s-banner>
        </div>
      )}

      {fetcher.data?.error && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="critical">{fetcher.data.error}</s-banner>
        </div>
      )}

      {/* =========================================================================
          POLARIS COMPACT GRAPHICAL OVERVIEW BANNER
      ========================================================================= */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "10px 16px",
          marginBottom: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
              border: "1px solid #bbf7d0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              flexShrink: 0,
            }}
          >
            📦
          </div>
          <div>
            <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Customized Production Orders &amp; Print Snapshots
            </h2>
            <p style={{ margin: "1px 0 0", fontSize: "11px", color: "#64748b" }}>
              Inspect customer personalization designs, front &amp; back previews, and download 300 DPI production print files.
            </p>
          </div>
        </div>

        {/* Compact Polaris Metric Pills */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              padding: "4px 10px",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Orders:{" "}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
              {orders.length}
            </span>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              padding: "4px 10px",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Ready:{" "}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "#008060" }}>
              {completedPrintsCount}
            </span>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              padding: "4px 10px",
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Print:{" "}
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb" }}>
              ✓ 300 DPI High-Res
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ORDERS LIST & TABLE CARD
      ========================================================================= */}
      {orders.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "56px 24px",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📦</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
            No customized orders received yet
          </h3>
          <p
            style={{
              color: "#64748b",
              maxWidth: "480px",
              margin: "0 auto 20px auto",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            When customers personalize items on your store and checkout, their visual design snapshots, front/back thumbnails, and 300 DPI print files will automatically populate here.
          </p>
          <Link
            to="/app/templates"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 18px",
              borderRadius: "8px",
              background: "#008060",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Assign Products to Templates →
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Card Controls Bar: Compact Tabs & Search Input */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid #f1f5f9",
              background: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: filterTab === "all" ? "1px solid #008060" : "1px solid #cbd5e1",
                  background: filterTab === "all" ? "#f0fdf4" : "#ffffff",
                  color: filterTab === "all" ? "#008060" : "#475569",
                  cursor: "pointer",
                }}
              >
                All ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("ready")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: filterTab === "ready" ? "1px solid #008060" : "1px solid #cbd5e1",
                  background: filterTab === "ready" ? "#f0fdf4" : "#ffffff",
                  color: filterTab === "ready" ? "#008060" : "#475569",
                  cursor: "pointer",
                }}
              >
                Print Ready ({completedPrintsCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("pending")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: filterTab === "pending" ? "1px solid #008060" : "1px solid #cbd5e1",
                  background: filterTab === "pending" ? "#f0fdf4" : "#ffffff",
                  color: filterTab === "pending" ? "#008060" : "#475569",
                  cursor: "pointer",
                }}
              >
                Pending ({pendingPrintsCount})
              </button>
            </div>

            {/* Live Search */}
            <div style={{ position: "relative", minWidth: "220px" }}>
              <span
                style={{
                  position: "absolute",
                  left: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "11px",
                  color: "#94a3b8",
                  pointerEvents: "none",
                }}
              >
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by order #, item, text..."
                style={{
                  width: "100%",
                  padding: "5px 10px 5px 26px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  fontSize: "11px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#94a3b8",
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
              <p style={{ margin: "0 0 10px", fontSize: "13px" }}>
                No custom orders found matching <strong>&ldquo;{searchQuery}&rdquo;</strong>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterTab("all");
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#0f172a",
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", width: "135px" }}>
                      Preview
                    </th>
                    <th style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", minWidth: "220px" }}>
                      Order &amp; Product Details
                    </th>
                    <th style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                      Customer Customizations
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        textAlign: "right",
                        width: "180px",
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o: any, idx: number) => {
                    const isReady = Boolean(o.printFileUrl || o.renderStatus === "completed");
                    return (
                      <tr
                        key={o.orderGid + "_" + o.lineItemId + "_" + idx}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        {/* 1. LEFT SIDE: Image Group (Front, Back, Customer Upload) */}
                        <td style={{ padding: "8px 12px", verticalAlign: "middle", width: "135px" }}>
                          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
                            {/* Front Preview */}
                            {(o.frontPreviewUrl || o.previewImageUrl) ? (
                              <div
                                style={{
                                  position: "relative",
                                  cursor: "pointer",
                                  width: "38px",
                                  height: "38px",
                                  borderRadius: "5px",
                                  overflow: "hidden",
                                  border: "1px solid #cbd5e1",
                                  background: "#f8fafc",
                                  flexShrink: 0,
                                }}
                                onClick={() => setActiveModalImage(normalizePreviewUrl(o.frontPreviewUrl || o.previewImageUrl, shop))}
                                title="Click to zoom Front Design Preview"
                              >
                                <img
                                  src={normalizePreviewUrl(o.frontPreviewUrl || o.previewImageUrl, shop)}
                                  alt="Front Preview"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    const raw = o.frontPreviewUrl || o.previewImageUrl;
                                    const match = raw?.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
                                    if (match && match[1] && !img.src.includes(`/api/preview/${match[1]}`)) {
                                      img.src = `/api/preview/${match[1]}`;
                                    }
                                  }}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: "1px",
                                    left: "1px",
                                    background: "rgba(15, 23, 42, 0.8)",
                                    color: "#fff",
                                    fontSize: "7px",
                                    padding: "0 2px",
                                    borderRadius: "2px",
                                    fontWeight: 700,
                                    lineHeight: "10px",
                                  }}
                                >
                                  F
                                </div>
                              </div>
                            ) : null}

                            {/* Back Preview */}
                            {o.backPreviewUrl ? (
                              <div
                                style={{
                                  position: "relative",
                                  cursor: "pointer",
                                  width: "38px",
                                  height: "38px",
                                  borderRadius: "5px",
                                  overflow: "hidden",
                                  border: "1px solid #cbd5e1",
                                  background: "#f8fafc",
                                  flexShrink: 0,
                                }}
                                onClick={() => setActiveModalImage(normalizePreviewUrl(o.backPreviewUrl, shop))}
                                title="Click to zoom Back Design Preview"
                              >
                                <img
                                  src={normalizePreviewUrl(o.backPreviewUrl, shop)}
                                  alt="Back Preview"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    const match = o.backPreviewUrl?.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
                                    if (match && match[1] && !img.src.includes(`/api/preview/${match[1]}`)) {
                                      img.src = `/api/preview/${match[1]}`;
                                    }
                                  }}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: "1px",
                                    left: "1px",
                                    background: "rgba(15, 23, 42, 0.8)",
                                    color: "#fff",
                                    fontSize: "7px",
                                    padding: "0 2px",
                                    borderRadius: "2px",
                                    fontWeight: 700,
                                    lineHeight: "10px",
                                  }}
                                >
                                  B
                                </div>
                              </div>
                            ) : null}

                            {/* Raw Customer Uploaded Image */}
                            {(o.frontUploadedUrl || o.uploadedImageUrl) ? (
                              <div
                                style={{
                                  position: "relative",
                                  cursor: "pointer",
                                  width: "38px",
                                  height: "38px",
                                  borderRadius: "5px",
                                  overflow: "hidden",
                                  border: "1.5px solid #008060",
                                  background: "#f0fdf4",
                                  flexShrink: 0,
                                }}
                                onClick={() => setActiveModalImage(normalizePreviewUrl(o.frontUploadedUrl || o.uploadedImageUrl, shop))}
                                title="Click to zoom Customer's Original Uploaded Photo"
                              >
                                <img
                                  src={normalizePreviewUrl(o.frontUploadedUrl || o.uploadedImageUrl, shop)}
                                  alt="Uploaded Logo / Photo"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    const raw = o.frontUploadedUrl || o.uploadedImageUrl;
                                    const match = raw?.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
                                    if (match && match[1] && !img.src.includes(`/api/preview/${match[1]}`)) {
                                      img.src = `/api/preview/${match[1]}`;
                                    }
                                  }}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "1px",
                                    left: "1px",
                                    background: "#008060",
                                    color: "#fff",
                                    fontSize: "7px",
                                    padding: "0 2px",
                                    borderRadius: "2px",
                                    fontWeight: "bold",
                                    lineHeight: "10px",
                                  }}
                                >
                                  RAW
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </td>

                        {/* 2. ORDER DETAILS: Order ID & Product Details */}
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          {/* Order ID & Financial Status & Date */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <a
                              href={o.adminOrderUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontWeight: 700,
                                fontSize: "13px",
                                color: "#008060",
                                textDecoration: "none",
                              }}
                            >
                              {o.shopifyOrderId} ↗
                            </a>
                            {o.financialStatus && (
                              <span
                                style={{
                                  background: "#f1f5f9",
                                  color: "#475569",
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                }}
                              >
                                {o.financialStatus}
                              </span>
                            )}
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                              • {new Date(o.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Product Title */}
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "12px",
                              color: "#0f172a",
                              marginTop: "2px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "280px",
                            }}
                            title={o.productTitle}
                          >
                            {o.productTitle}
                          </div>

                          {/* Line Item & Quantity */}
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
                            <span>Qty: {o.quantity}</span>
                            <span style={{ margin: "0 4px", color: "#cbd5e1" }}>|</span>
                            <span>Line: {o.lineItemId}</span>
                          </div>
                        </td>

                        {/* 3. CUSTOMER CUSTOMISATIONS: Compact Inline Chips */}
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          {(() => {
                            const rawEntries = Object.entries(o.customerSelections || {});
                            const textEntries = rawEntries.filter(([key, val]) => {
                              if (key.startsWith("_") || key === "Custom Design Preview") return false;
                              const strVal = String(val || "").trim();
                              if (!strVal) return false;
                              const lowerKey = key.toLowerCase();
                              if (
                                lowerKey.includes("preview") ||
                                lowerKey.includes("upload") ||
                                lowerKey.includes("photo") ||
                                lowerKey.includes("image") ||
                                strVal.startsWith("http://") ||
                                strVal.startsWith("https://") ||
                                strVal.startsWith("data:")
                              ) {
                                return false;
                              }
                              return true;
                            });

                            const uploadEntries = rawEntries.filter(([key, val]) => {
                              if (key.startsWith("_")) return false;
                              const strVal = String(val || "").trim();
                              const lowerKey = key.toLowerCase();
                              return (
                                (lowerKey.includes("upload") || lowerKey.includes("photo") || lowerKey.includes("image")) &&
                                (strVal.startsWith("http") || strVal.startsWith("data:") || strVal.includes("/api/"))
                              );
                            });

                            return (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", alignItems: "center" }}>
                                {textEntries.map(([key, val]) => {
                                  const strVal = String(val || "");
                                  const isColor = strVal.startsWith("#") && (strVal.length === 4 || strVal.length === 7);
                                  return (
                                    <span
                                      key={key}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "3px",
                                        background: "#f1f5f9",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "4px",
                                        padding: "1px 6px",
                                        fontSize: "11px",
                                        lineHeight: "18px",
                                        color: "#334155",
                                      }}
                                    >
                                      <span style={{ color: "#64748b", fontWeight: 500 }}>{key}:</span>
                                      <strong style={{ color: "#0f172a" }}>{strVal}</strong>
                                      {isColor && (
                                        <span
                                          style={{
                                            display: "inline-block",
                                            width: "10px",
                                            height: "10px",
                                            borderRadius: "2px",
                                            background: strVal,
                                            border: "1px solid rgba(0,0,0,0.2)",
                                          }}
                                        />
                                      )}
                                    </span>
                                  );
                                })}

                                {uploadEntries.map(([key, val]) => (
                                  <a
                                    key={key}
                                    href={normalizePreviewUrl(String(val), shop)}
                                    target="_blank"
                                    rel="noreferrer"
                                    download="customer_upload"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                      color: "#008060",
                                      fontWeight: 600,
                                      fontSize: "10px",
                                      background: "#ecfdf5",
                                      border: "1px solid #a7f3d0",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      textDecoration: "none",
                                      lineHeight: "18px",
                                    }}
                                    title={`Download customer's original upload: ${key}`}
                                  >
                                    📎 Upload [Raw]
                                  </a>
                                ))}

                                {textEntries.length === 0 && uploadEntries.length === 0 && (
                                  <span style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
                                    Standard design
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* 4. ACTIONS */}
                        <td
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            verticalAlign: "middle",
                            whiteSpace: "nowrap",
                            width: "180px",
                          }}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              gap: "4px",
                              alignItems: "center",
                              justifyContent: "flex-end",
                            }}
                          >
                            {isReady && o.printFileUrl ? (
                              <a
                                href={o.printFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  background: "#008060",
                                  color: "#fff",
                                  textDecoration: "none",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                📥 PDF
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleGeneratePrint(o)}
                                disabled={fetcher.state !== "idle"}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid #cbd5e1",
                                  background: "#ffffff",
                                  color: "#008060",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                }}
                              >
                                {fetcher.state !== "idle" ? "Rendering..." : "⚡ PDF"}
                              </button>
                            )}

                            {o.previewImageUrl && (
                              <button
                                type="button"
                                onClick={() => setActiveModalImage(o.previewImageUrl)}
                                title="View customer design snapshot"
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid #cbd5e1",
                                  background: "#fff",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  color: "#334155",
                                  fontWeight: 600,
                                }}
                              >
                                👁️ View
                              </button>
                            )}

                            {/* DELETE BUTTON */}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(o)}
                              title="Delete customized order"
                              style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                border: "1px solid #fecaca",
                                background: "#fff5f5",
                                cursor: "pointer",
                                fontSize: "11px",
                                color: "#dc2626",
                                fontWeight: 600,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "#fee2e2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    flexShrink: 0,
                  }}
                >
                  ⚠️
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    Delete Customized Order?
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Order: {deleteTarget.shopifyOrderId} • {deleteTarget.productTitle}
                  </div>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
                Are you sure you want to remove this customized order snapshot from the production list?
                This action cannot be undone.
              </p>
            </div>

            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Delete Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Preview Image */}
      {activeModalImage && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setActiveModalImage(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "20px",
              maxWidth: "600px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                🎨 Customer Design Preview
              </h3>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#94a3b8",
                }}
              >
                &times;
              </button>
            </div>
            <img
              src={normalizePreviewUrl(activeModalImage, shop)}
              alt="High-Res Design"
              onError={(e) => {
                const img = e.currentTarget;
                const match = activeModalImage?.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
                if (match && match[1] && !img.src.includes(`/api/preview/${match[1]}`)) {
                  img.src = `/api/preview/${match[1]}`;
                }
              }}
              style={{
                maxWidth: "100%",
                maxHeight: "500px",
                objectFit: "contain",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
              }}
            />
            <div
              style={{
                marginTop: "16px",
                width: "100%",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <a
                href={normalizePreviewUrl(activeModalImage, shop)}
                target="_blank"
                rel="noreferrer"
                download="custom-design-preview.jpg"
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "#008060",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Open Full Size Image
              </a>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "#334155",
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}
