import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { listTemplates } from "../models/template.server";
import { listCustomizedOrders } from "../models/order.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const templates = await listTemplates(session.shop);
  const orders = await listCustomizedOrders(session.shop);

  const totalProductsLinked = templates.reduce(
    (acc: number, t: any) => acc + (t.products?.length || 0),
    0,
  );

  return {
    shop: session.shop,
    templates: templates.slice(0, 5),
    totalTemplates: templates.length,
    totalProductsLinked,
    orders: orders.slice(0, 5),
    totalOrders: orders.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_sample_products") {
    const sampleProducts = [
      { title: "Custom Classic T-Shirt" },
      { title: "Custom Ceramic Coffee Mug" },
      { title: "Custom Canvas Wall Art" },
    ];

    for (const p of sampleProducts) {
      try {
        await admin.graphql(
          `#graphql
          mutation createProduct($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product {
                id
                title
              }
            }
          }`,
          {
            variables: {
              product: {
                title: p.title,
                status: "ACTIVE",
              },
            },
          },
        );
      } catch (e) {
        console.error("Error creating sample product", e);
      }
    }

    return { success: true, message: "Sample customizable products created on your store!" };
  }

  return { success: false };
};

export default function PersonalizerDashboard() {
  const {
    shop,
    templates,
    totalTemplates,
    totalProductsLinked,
    orders,
    totalOrders,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return (
    <s-page heading="Product Personalizer & Print Studio">
      <s-button slot="primary-action" variant="primary" href="/app/templates">
        Manage Templates
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
          color: "#fff",
          padding: "24px",
          borderRadius: "10px",
          marginBottom: "24px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <span style={{ background: "rgba(255,255,255,0.2)", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, letterSpacing: "0.5px" }}>
              ONLINE STORE 2.0 READY
            </span>
            <h1 style={{ fontSize: "22px", margin: "10px 0 6px", color: "#fff" }}>
              Welcome to Saitriq Personalizer on {shop}
            </h1>
            <p style={{ margin: 0, opacity: 0.85, fontSize: "14px", maxWidth: "600px" }}>
              Empower your customers to personalize products in real-time with custom text, photo uploads, and clipart. Generates 300 DPI print-ready files automatically upon checkout.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <Link
              to="/app/templates"
              style={{
                background: "#fff",
                color: "#1e3c72",
                fontWeight: 600,
                padding: "10px 18px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "13px",
              }}
            >
              Open Template Studio
            </Link>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "18px" }}>
          <div style={{ color: "#6d7175", fontSize: "13px", fontWeight: 500 }}>Active Templates</div>
          <div style={{ fontSize: "26px", fontWeight: 700, margin: "6px 0", color: "#202223" }}>{totalTemplates}</div>
          <Link to="/app/templates" style={{ color: "#005bd3", fontSize: "12px", textDecoration: "none" }}>
            View all templates &rarr;
          </Link>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "18px" }}>
          <div style={{ color: "#6d7175", fontSize: "13px", fontWeight: 500 }}>Customized Products</div>
          <div style={{ fontSize: "26px", fontWeight: 700, margin: "6px 0", color: "#202223" }}>{totalProductsLinked}</div>
          {totalProductsLinked === 0 ? (
            <button
              type="button"
              onClick={() => fetcher.submit({ intent: "create_sample_products" }, { method: "POST" })}
              disabled={fetcher.state === "submitting"}
              style={{
                marginTop: "4px",
                background: "none",
                border: "none",
                color: "#005bd3",
                fontSize: "12px",
                padding: 0,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {fetcher.state === "submitting" ? "Creating..." : "+ Add Sample Products"}
            </button>
          ) : (
            <span style={{ color: "#108043", fontSize: "12px" }}>Linked to store products</span>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "18px" }}>
          <div style={{ color: "#6d7175", fontSize: "13px", fontWeight: 500 }}>Customized Orders</div>
          <div style={{ fontSize: "26px", fontWeight: 700, margin: "6px 0", color: "#202223" }}>{totalOrders}</div>
          <Link to="/app/orders" style={{ color: "#005bd3", fontSize: "12px", textDecoration: "none" }}>
            View print queue &rarr;
          </Link>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "18px" }}>
          <div style={{ color: "#6d7175", fontSize: "13px", fontWeight: 500 }}>Print File Quality</div>
          <div style={{ fontSize: "26px", fontWeight: 700, margin: "6px 0", color: "#202223" }}>300 DPI</div>
          <span style={{ color: "#6d7175", fontSize: "12px" }}>Vector PDF / High-Res PNG</span>
        </div>
      </div>

      {/* Main Grid: Recent Templates & Quick Guide */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
        
        {/* Recent Templates */}
        <s-section heading="Personalization Templates">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
            {templates.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <p style={{ color: "#6d7175", margin: "0 0 16px", fontSize: "14px" }}>
                  No templates created yet. Set up your first canvas template.
                </p>
                <Link
                  to="/app/templates"
                  style={{
                    background: "#008060",
                    color: "#fff",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Create Template
                </Link>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#fafbfb", borderBottom: "1px solid #e1e3e5" }}>
                    <th style={{ padding: "10px 14px", fontSize: "12px", color: "#6d7175" }}>Title</th>
                    <th style={{ padding: "10px 14px", fontSize: "12px", color: "#6d7175" }}>Canvas</th>
                    <th style={{ padding: "10px 14px", fontSize: "12px", color: "#6d7175" }}>Products</th>
                    <th style={{ padding: "10px 14px", fontSize: "12px", color: "#6d7175", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: "13px" }}>{t.title}</td>
                      <td style={{ padding: "12px 14px", fontSize: "12px", color: "#6d7175" }}>
                        {t.canvasWidth}×{t.canvasHeight} px ({t.printDpi} DPI)
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: "12px" }}>
                        <span style={{ color: (t.products?.length || 0) > 0 ? "#108043" : "#6d7175" }}>
                          {t.products?.length || 0} linked
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <Link
                          to={`/app/templates/${t.id}`}
                          style={{
                            color: "#005bd3",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          Open Studio &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </s-section>

        {/* Setup & Integration Guide */}
        <s-section heading="Quick Setup Guide">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                  1
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>Design Canvas Template</div>
                  <div style={{ color: "#6d7175", fontSize: "12px", marginTop: "2px" }}>
                    Configure print bounds, add text layers, upload areas, and mockups in Template Studio.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                  2
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>Assign Shopify Products</div>
                  <div style={{ color: "#6d7175", fontSize: "12px", marginTop: "2px" }}>
                    Link which catalog products should load this customization experience.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                  3
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>Add Theme App Block</div>
                  <div style={{ color: "#6d7175", fontSize: "12px", marginTop: "2px" }}>
                    In Shopify Theme Editor (Online Store 2.0), add the "Product Personalizer" app block to your product page template.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                  4
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>Automatic 300 DPI Output</div>
                  <div style={{ color: "#6d7175", fontSize: "12px", marginTop: "2px" }}>
                    When a shopper completes checkout, the 300 DPI print file renders automatically in your Orders Queue.
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #e1e3e5", paddingTop: "12px", marginTop: "4px" }}>
                <Link
                  to="/app/guide"
                  style={{
                    color: "#008060",
                    fontSize: "13px",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Open Full Setup &amp; Front/Back Guide &rarr;
                </Link>
              </div>
            </div>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}
