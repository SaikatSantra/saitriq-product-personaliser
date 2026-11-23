import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState, useMemo } from "react";
import { authenticate } from "../shopify.server";
import {
  listCustomizedOrders,
  createCustomizedOrder,
  updateCustomizedOrderStatus,
  updateCustomizedOrderPreview,
} from "../models/order.server";
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

      return { success: true, printPdfUrl };
    } catch (err: any) {
      console.error("[Action] Render failed:", err);
      return { success: false, error: err?.message };
    }
  }

  return { success: false };
};

export default function CustomizedOrdersPage() {
  const { orders, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase().trim();
    return orders.filter(
      (o: any) =>
        (o.shopifyOrderId || "").toLowerCase().includes(q) ||
        (o.productTitle || "").toLowerCase().includes(q) ||
        Object.values(o.customerSelections || {}).some((v: any) =>
          String(v).toLowerCase().includes(q),
        ),
    );
  }, [orders, searchQuery]);

  const completedPrintsCount = orders.filter(
    (o) => o.printFileUrl || o.renderStatus === "completed",
  ).length;

  return (
    <s-page heading="Custom orders">
      {/* Top Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: "14px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Total custom orders
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
              {orders.length}
            </div>
          </div>
          <span style={{ fontSize: "24px" }}>📦</span>
        </div>

        <div
          style={{
            background: "#fff",
            padding: "14px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Print files ready
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, margin: "2px 0 0", color: "#008060" }}>
              {completedPrintsCount}
            </div>
          </div>
          <span style={{ fontSize: "24px" }}>🖨️</span>
        </div>

        <div
          style={{
            background: "#fff",
            padding: "14px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Connected store
            </div>
            <div style={{ fontSize: "13px", fontWeight: 700, margin: "4px 0 0", color: "#0f172a", wordBreak: "break-all" }}>
              {shop}
            </div>
          </div>
          <span style={{ fontSize: "24px" }}>🟢</span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
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
              fontSize: "14px",
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
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Card Header & Search */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                Customized Orders ({filteredOrders.length})
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                View customer front/back previews, upload sources, and generate production print files.
              </p>
            </div>

            <div style={{ position: "relative", minWidth: "260px" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by #order or product..."
                style={{
                  width: "100%",
                  padding: "7px 12px 7px 32px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "14px",
                  color: "#94a3b8",
                  pointerEvents: "none",
                }}
              >
                🔍
              </span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Customized Preview
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Order
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Product
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Customer Customizations
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Date
                  </th>
                  <th
                    style={{
                      padding: "12px 18px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      textAlign: "right",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o, idx) => (
                  <tr
                    key={o.orderGid + "_" + o.lineItemId + "_" + idx}
                    style={{ borderBottom: "1px solid #f1f2f3" }}
                  >
                    {/* 1. Preview Image Thumbnails (Front, Back, Raw) */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        {/* Front Preview */}
                        {(o.frontPreviewUrl || o.previewImageUrl) ? (
                          <div
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              width: "56px",
                              height: "56px",
                              borderRadius: "6px",
                              overflow: "hidden",
                              border: "1px solid #d4d6d8",
                              background: "#fafafa",
                            }}
                            onClick={() => setActiveModalImage(normalizePreviewUrl(o.frontPreviewUrl || o.previewImageUrl, shop))}
                            title="Click to view Front Design Preview"
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
                                bottom: "2px",
                                left: "2px",
                                background: "rgba(15, 23, 42, 0.75)",
                                color: "#fff",
                                fontSize: "8px",
                                padding: "1px 3px",
                                borderRadius: "2px",
                                fontWeight: 700,
                              }}
                            >
                              FRONT
                            </div>
                          </div>
                        ) : null}

                        {/* Back Preview */}
                        {o.backPreviewUrl ? (
                          <div
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              width: "56px",
                              height: "56px",
                              borderRadius: "6px",
                              overflow: "hidden",
                              border: "1px solid #d4d6d8",
                              background: "#fafafa",
                            }}
                            onClick={() => setActiveModalImage(normalizePreviewUrl(o.backPreviewUrl, shop))}
                            title="Click to view Back Design Preview"
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
                                bottom: "2px",
                                left: "2px",
                                background: "rgba(15, 23, 42, 0.75)",
                                color: "#fff",
                                fontSize: "8px",
                                padding: "1px 3px",
                                borderRadius: "2px",
                                fontWeight: 700,
                              }}
                            >
                              BACK
                            </div>
                          </div>
                        ) : null}

                        {/* Customer Raw Upload (Front / Main) */}
                        {(o.frontUploadedUrl || o.uploadedImageUrl) ? (
                          <div
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              width: "56px",
                              height: "56px",
                              borderRadius: "6px",
                              overflow: "hidden",
                              border: "2px solid #008060",
                              background: "#f0fdf4",
                            }}
                            onClick={() => setActiveModalImage(normalizePreviewUrl(o.frontUploadedUrl || o.uploadedImageUrl, shop))}
                            title="Click to view Customer's Original Uploaded Photo"
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
                                top: "2px",
                                left: "2px",
                                background: "#008060",
                                color: "#fff",
                                fontSize: "8px",
                                padding: "1px 3px",
                                borderRadius: "2px",
                                fontWeight: "bold",
                              }}
                            >
                              {o.backUploadedUrl ? "RAW F" : "RAW"}
                            </div>
                          </div>
                        ) : null}

                        {/* Customer Back Raw Upload (if uploaded separately on Back) */}
                        {o.backUploadedUrl && o.backUploadedUrl !== o.frontUploadedUrl ? (
                          <div
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              width: "56px",
                              height: "56px",
                              borderRadius: "6px",
                              overflow: "hidden",
                              border: "2px solid #008060",
                              background: "#f0fdf4",
                            }}
                            onClick={() => setActiveModalImage(normalizePreviewUrl(o.backUploadedUrl, shop))}
                            title="Click to view Customer's Back Uploaded Photo"
                          >
                            <img
                              src={normalizePreviewUrl(o.backUploadedUrl, shop)}
                              alt="Back Uploaded Logo / Photo"
                              onError={(e) => {
                                const img = e.currentTarget;
                                const match = o.backUploadedUrl?.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
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
                                top: "2px",
                                left: "2px",
                                background: "#008060",
                                color: "#fff",
                                fontSize: "8px",
                                padding: "1px 3px",
                                borderRadius: "2px",
                                fontWeight: "bold",
                              }}
                            >
                              RAW B
                            </div>
                          </div>
                        ) : null}

                        {!o.previewImageUrl && !o.frontPreviewUrl && !o.backPreviewUrl && !o.uploadedImageUrl && (
                          <div
                            style={{
                              width: "56px",
                              height: "56px",
                              background: "#f0f2f5",
                              borderRadius: "6px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              color: "#8c9196",
                            }}
                          >
                            No Image
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 2. Order Name & Admin Link */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <a
                        href={o.adminOrderUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "#0066cc",
                          textDecoration: "none",
                        }}
                      >
                        {o.shopifyOrderId}
                      </a>
                      <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "2px" }}>
                        ID: {o.numericOrderId}
                      </div>
                    </td>

                    {/* 3. Product Info */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <div style={{ fontWeight: 500, fontSize: "13px" }}>{o.productTitle}</div>
                      <div style={{ fontSize: "12px", color: "#6d7175" }}>Qty: {o.quantity}</div>
                    </td>

                    {/* 4. Customer Customizations */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {Object.entries(o.customerSelections).map(([key, val]) => {
                          if (key.startsWith("_") || key === "Custom Design Preview") return null;

                          const strVal = String(val || "");
                          const isImage =
                            key.toLowerCase().includes("upload") ||
                            key.toLowerCase().includes("photo") ||
                            key.toLowerCase().includes("image") ||
                            strVal.startsWith("http") ||
                            strVal.startsWith("data:image");

                          if (isImage) {
                            return (
                              <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: "#4a4f54",
                                    background: "#f0f2f5",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                  }}
                                >
                                  {key}:
                                </span>
                                <a
                                  href={normalizePreviewUrl(strVal, shop)}
                                  target="_blank"
                                  rel="noreferrer"
                                  download="customer_uploaded_image"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: "#008060",
                                    fontWeight: 600,
                                    fontSize: "12px",
                                    background: "#f0fdf4",
                                    border: "1px solid #bbf7d0",
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                  }}
                                >
                                  📥 View / Download Raw Image
                                </a>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={key}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: "#4a4f54",
                                  background: "#f0f2f5",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                }}
                              >
                                {key}:
                              </span>
                              <span style={{ color: "#202223", fontWeight: 500 }}>
                                {strVal}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* 5. Date */}
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#6d7175",
                        fontSize: "13px",
                        verticalAlign: "middle",
                      }}
                    >
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>

                    {/* 6. Action Buttons */}
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          flexDirection: "column",
                          gap: "6px",
                          alignItems: "flex-end",
                        }}
                      >
                        {o.previewImageUrl && (
                          <button
                            type="button"
                            onClick={() => setActiveModalImage(o.previewImageUrl)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "4px",
                              border: "1px solid #c9cccf",
                              background: "#fff",
                              cursor: "pointer",
                              fontSize: "12px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            👁️ View Design
                          </button>
                        )}

                        {o.printFileUrl ? (
                          <a
                            href={o.printFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "5px 10px",
                              borderRadius: "4px",
                              background: "#008060",
                              color: "#fff",
                              textDecoration: "none",
                              fontSize: "12px",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            📥 Print PDF
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGeneratePrint(o)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "4px",
                              border: "1px solid #008060",
                              background: "#f0fdf4",
                              color: "#008060",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            {fetcher.state !== "idle" ? "Rendering..." : "⚡ Generate 300 DPI"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            backgroundColor: "rgba(0, 0, 0, 0.75)",
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
              borderRadius: "12px",
              padding: "20px",
              maxWidth: "600px",
              width: "100%",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
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
              <h3 style={{ margin: 0, fontSize: "16px" }}>🎨 Customer Design Preview</h3>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#6d7175",
                }}
              >
                ✕
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
                border: "1px solid #e1e3e5",
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
                  border: "1px solid #c9cccf",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
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
