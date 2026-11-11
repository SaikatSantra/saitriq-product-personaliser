import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listCustomizedOrders,
  updateCustomizedOrderStatus,
} from "../models/order.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const orders = await listCustomizedOrders(session.shop);
  return { orders };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const orderId = formData.get("orderId") as string;

  if (intent === "rerender" && orderId) {
    // In Phase 5, this pushes a render job to BullMQ / Worker cluster
    await updateCustomizedOrderStatus(orderId, session.shop, "processing");
    return { success: true, message: "Re-rendering queued" };
  }

  return { success: false };
};

export default function CustomizedOrdersPage() {
  const { orders } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const handleRerender = (orderId: string) => {
    fetcher.submit({ intent: "rerender", orderId }, { method: "POST" });
  };

  return (
    <s-page heading="Customized Orders & Print Files">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div style={{ background: "#fff", border: "1px solid #e1e3e5", padding: "16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "13px", color: "#6d7175" }}>Total Custom Orders</span>
          <h2 style={{ fontSize: "24px", margin: "4px 0 0" }}>{orders.length}</h2>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e1e3e5", padding: "16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "13px", color: "#6d7175" }}>Completed Print Files</span>
          <h2 style={{ fontSize: "24px", margin: "4px 0 0", color: "#108043" }}>
            {orders.filter((o) => o.fulfillmentStatus === "completed").length}
          </h2>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e1e3e5", padding: "16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "13px", color: "#6d7175" }}>Pending Render Queue</span>
          <h2 style={{ fontSize: "24px", margin: "4px 0 0", color: "#b98900" }}>
            {orders.filter((o) => o.fulfillmentStatus === "pending" || o.fulfillmentStatus === "processing").length}
          </h2>
        </div>
      </div>

      {orders.length === 0 ? (
        <s-section>
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <div style={{ fontSize: "42px", marginBottom: "12px" }}>📦</div>
            <h3 style={{ fontSize: "18px", margin: "0 0 8px" }}>No customized orders yet</h3>
            <p style={{ color: "#6d7175", maxWidth: "460px", margin: "0 auto", fontSize: "14px" }}>
              When shoppers personalize products on your storefront and complete checkout, their custom choices and 300 DPI print files will appear here automatically.
            </p>
          </div>
        </s-section>
      ) : (
        <s-section heading="Order Audit Log">
          <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e1e3e5", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#fafbfb", borderBottom: "1px solid #e1e3e5" }}>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>Preview</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>Shopify Order ID</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>Custom Selections</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>Date</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175" }}>Render Status</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", color: "#6d7175", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                    <td style={{ padding: "12px 16px" }}>
                      {o.previewImageUrl ? (
                        <img
                          src={o.previewImageUrl}
                          alt="Snapshot"
                          style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                        />
                      ) : (
                        <div style={{ width: "48px", height: "48px", background: "#f0f2f5", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#8c9196" }}>
                          No image
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: "13px" }}>
                      #{o.shopifyOrderId}
                      <div style={{ fontSize: "11px", color: "#6d7175", fontWeight: 400 }}>Item: {o.shopifyLineItemId}</div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "12px", maxWidth: "260px" }}>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f6f6f7", padding: "6px", borderRadius: "4px", maxHeight: "60px", overflowY: "auto" }}>
                        {o.customerSelections}
                      </pre>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6d7175", fontSize: "13px" }}>
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          background:
                            o.fulfillmentStatus === "completed"
                              ? "#e3f1df"
                              : o.fulfillmentStatus === "failed"
                              ? "#fed3d1"
                              : "#fff5ea",
                          color:
                            o.fulfillmentStatus === "completed"
                              ? "#108043"
                              : o.fulfillmentStatus === "failed"
                              ? "#d72c0d"
                              : "#b98900",
                        }}
                      >
                        {o.fulfillmentStatus.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "8px" }}>
                        {o.printFileUrl ? (
                          <a
                            href={o.printFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              background: "#008060",
                              color: "#fff",
                              textDecoration: "none",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            Download 300 DPI
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRerender(o.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #c9cccf",
                              background: "#fff",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            Re-render
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
    </s-page>
  );
}
