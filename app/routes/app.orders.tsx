import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  listCustomizedOrders,
  createCustomizedOrder,
  updateCustomizedOrderStatus,
} from "../models/order.server";
import { renderHighResPrintFile } from "../services/renderer.server";

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
          attrMap["Custom Design Preview"] ||
          attrMap["Custom Design"] ||
          attrMap["_template_id"];

        if (isCustomized) {
          const preview =
            attrMap["Custom Design Preview"] ||
            attrMap["_customization_preview"] ||
            item.image?.url ||
            "";

          const uploadedImage =
            attrMap["_uploaded_image"] ||
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
            previewImageUrl: preview,
            uploadedImageUrl: uploadedImage,
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

  // Merge live orders with DB records (auto-registering into DB if missing)
  const combinedOrders = await Promise.all(
    shopifyCustomizedOrders.map(async (so) => {
      const dbKey = `${so.numericOrderId}_${so.lineItemId}`;
      let record = dbMap.get(dbKey) || dbMap.get(`${so.shopifyOrderId}_${so.lineItemId}`);

      if (!record && so.previewImageUrl) {
        try {
          record = await createCustomizedOrder(shop, {
            shopifyOrderId: so.numericOrderId,
            shopifyLineItemId: so.lineItemId,
            customerSelections: JSON.stringify(so.customerSelections),
            previewImageUrl: so.previewImageUrl,
          });
        } catch (createErr) {
          // ignore duplicate
        }
      }

      return {
        ...so,
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

      const uploadedImage =
        selections["_uploaded_image"] ||
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
        previewImageUrl: dbo.previewImageUrl,
        uploadedImageUrl: uploadedImage,
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

  return (
    <s-page heading="Customized Orders & Print Files">
      {/* Top Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e1e3e5",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#6d7175" }}>Total Custom Orders</span>
          <h2 style={{ fontSize: "24px", margin: "4px 0 0" }}>{orders.length}</h2>
        </div>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e1e3e5",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#6d7175" }}>Completed Print Files</span>
          <h2 style={{ fontSize: "24px", margin: "4px 0 0", color: "#108043" }}>
            {orders.filter((o) => o.printFileUrl || o.renderStatus === "completed").length}
          </h2>
        </div>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e1e3e5",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#6d7175" }}>Target Store</span>
          <h2 style={{ fontSize: "15px", margin: "8px 0 0", color: "#202223" }}>{shop}</h2>
        </div>
      </div>

      {orders.length === 0 ? (
        <s-section>
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "#fff",
              borderRadius: "8px",
              border: "1px solid #e1e3e5",
            }}
          >
            <div style={{ fontSize: "42px", marginBottom: "12px" }}>📦</div>
            <h3 style={{ fontSize: "18px", margin: "0 0 8px" }}>No customized orders found yet</h3>
            <p
              style={{
                color: "#6d7175",
                maxWidth: "480px",
                margin: "0 auto 16px auto",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              When customers personalize items on your store and place an order, their visual design
              snapshots and high-resolution print assets will appear right here.
            </p>
          </div>
        </s-section>
      ) : (
        <s-section heading="Orders with Custom Products">
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              border: "1px solid #e1e3e5",
              overflowX: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#fafbfb", borderBottom: "1px solid #e1e3e5" }}>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>
                    Customized Preview
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>
                    Order
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>
                    Product
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>
                    Customer Customizations
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>
                    Date
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontSize: "13px",
                      color: "#6d7175",
                      textAlign: "right",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr
                    key={o.orderGid + "_" + o.lineItemId + "_" + idx}
                    style={{ borderBottom: "1px solid #f1f2f3" }}
                  >
                    {/* 1. Preview Image Thumbnail */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {o.previewImageUrl ? (
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
                            onClick={() => setActiveModalImage(o.previewImageUrl)}
                            title="Click to view Mockup Preview"
                          >
                            <img
                              src={o.previewImageUrl}
                              alt="Mockup Preview"
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
                                right: "2px",
                                background: "rgba(0,0,0,0.6)",
                                color: "#fff",
                                fontSize: "9px",
                                padding: "1px 3px",
                                borderRadius: "2px",
                              }}
                            >
                              🔍
                            </div>
                          </div>
                        ) : null}

                        {o.uploadedImageUrl ? (
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
                            onClick={() => setActiveModalImage(o.uploadedImageUrl)}
                            title="Click to view Customer's Original Uploaded Photo"
                          >
                            <img
                              src={o.uploadedImageUrl}
                              alt="Uploaded Logo / Photo"
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
                              RAW
                            </div>
                          </div>
                        ) : null}

                        {!o.previewImageUrl && !o.uploadedImageUrl && (
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
                                  href={strVal}
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
        </s-section>
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
              src={activeModalImage}
              alt="High-Res Design"
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
                href={activeModalImage}
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
