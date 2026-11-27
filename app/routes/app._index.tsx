import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link, useNavigate } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { listTemplates, createTemplate } from "../models/template.server";
import { listCustomizedOrders } from "../models/order.server";
import { getShopBillingInfo } from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const templates = await listTemplates(session.shop);
  const orders = await listCustomizedOrders(session.shop);
  const billingInfo = await getShopBillingInfo(session.shop, billing, admin);

  const totalProductsLinked = templates.reduce(
    (acc: number, t: any) => acc + (t.products?.length || 0),
    0,
  );

  return {
    shop: session.shop,
    templates: templates.slice(0, 6),
    totalTemplates: templates.length,
    totalProductsLinked,
    orders: orders.slice(0, 5),
    totalOrders: orders.length,
    billingInfo,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
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
    billingInfo,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const isUnlimited = billingInfo.templateLimit === Infinity;
  const quotaPercent = isUnlimited
    ? 25
    : Math.min(100, Math.round((billingInfo.currentTemplateCount / billingInfo.templateLimit) * 100));

  return (
    <s-page heading="Dashboard">
      <s-button slot="primary-action" variant="primary" href="/app/templates">
        Manage templates
      </s-button>
      <s-button slot="secondary-actions" href="/app/orders">
        Custom orders
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone={fetcher.data?.success ? "success" : "critical"}>{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* Plan Limit Warning Banner (Polaris Banner) */}
      {!billingInfo.canCreateMore && (
        <div style={{ marginBottom: "20px" }}>
          <s-banner tone="warning" heading={`Template limit reached on ${billingInfo.activePlan} plan`}>
            Your store has used {totalTemplates} of {billingInfo.templateLimit} templates.{" "}
            <Link to="/app/pricing" style={{ fontWeight: 700, color: "inherit", textDecoration: "underline" }}>
              Upgrade to Starter ($5/mo) or Unlimited ($20/mo)
            </Link>{" "}
            to unlock more template slots.
          </s-banner>
        </div>
      )}

      {/* =========================================================================
          POLARIS STUDIO STATUS & QUICK ACTION BAR
      ========================================================================= */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e1e3e5",
          padding: "18px 22px",
          marginBottom: "20px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "#e4f8e9",
              color: "#008060",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              flexShrink: 0,
            }}
          >
            🎨
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: "16px", color: "#202223" }}>
                Product Personalizer &amp; Print Studio
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "#e4f8e9",
                  color: "#008060",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#008060" }} />
                Active on storefront
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "3px" }}>
              Connected to <strong>{shop}</strong> • 300 DPI automated print fulfillment engine
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Link
            to="/app/templates"
            style={{
              padding: "7px 14px",
              background: "#008060",
              color: "#ffffff",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            + New Template
          </Link>
          <Link
            to="/app/pricing"
            style={{
              padding: "7px 14px",
              background: "#f6f6f7",
              color: "#202223",
              border: "1px solid #c9cccf",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Plans &amp; Pricing
          </Link>
          <Link
            to="/app/guide"
            style={{
              padding: "7px 12px",
              background: "#ffffff",
              color: "#5c5f62",
              border: "1px solid #c9cccf",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Setup Guide
          </Link>
        </div>
      </div>

      {/* =========================================================================
          POLARIS 4-COLUMN METRIC CARDS (CLEAN VISUAL KPIS)
      ========================================================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Metric 1: Active Templates */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e1e3e5",
            padding: "18px 20px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Active Templates
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: billingInfo.activePlan === "Unlimited" ? "#f3e8ff" : "#f1f2f3",
                color: billingInfo.activePlan === "Unlimited" ? "#7e22ce" : "#5c5f62",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              {billingInfo.activePlan} Plan
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "28px", fontWeight: 700, color: "#202223" }}>
              {totalTemplates}
            </span>
            <span style={{ fontSize: "13px", color: "#6d7175" }}>
              / {isUnlimited ? "Unlimited" : `${billingInfo.templateLimit} max`}
            </span>
          </div>

          {/* Mini Quota Bar */}
          <div style={{ marginTop: "12px" }}>
            <div style={{ width: "100%", height: "6px", background: "#f1f2f3", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${quotaPercent}%`,
                  height: "100%",
                  background: !billingInfo.canCreateMore && !isUnlimited ? "#d82c0d" : "#008060",
                  borderRadius: "3px",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6d7175", marginTop: "4px" }}>
              <span>{isUnlimited ? "Unlimited Quota" : `${quotaPercent}% used`}</span>
              <Link to="/app/pricing" style={{ color: "#008060", fontWeight: 600, textDecoration: "none" }}>
                Upgrade
              </Link>
            </div>
          </div>
        </div>

        {/* Metric 2: Customized Products */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e1e3e5",
            padding: "18px 20px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Linked Products
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: totalProductsLinked > 0 ? "#e4f8e9" : "#fff5ea",
                color: totalProductsLinked > 0 ? "#008060" : "#b25e00",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              {totalProductsLinked > 0 ? "✓ Connected" : "Not linked"}
            </span>
          </div>

          <div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#202223" }}>
              {totalProductsLinked}
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "2px" }}>
              Catalog items with customizer
            </div>
          </div>

          <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #f6f6f7" }}>
            <Link to="/app/templates" style={{ color: "#008060", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
              Assign more products &rarr;
            </Link>
          </div>
        </div>

        {/* Metric 3: Custom Orders */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e1e3e5",
            padding: "18px 20px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Custom Orders
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: totalOrders > 0 ? "#e0f0fe" : "#f1f2f3",
                color: totalOrders > 0 ? "#006399" : "#5c5f62",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              {totalOrders} Placed
            </span>
          </div>

          <div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#202223" }}>
              {totalOrders}
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "2px" }}>
              Customized store checkouts
            </div>
          </div>

          <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #f6f6f7" }}>
            <Link to="/app/orders" style={{ color: "#008060", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
              View all orders &rarr;
            </Link>
          </div>
        </div>

        {/* Metric 4: Print Resolution Guarantee */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e1e3e5",
            padding: "18px 20px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Print Engine
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: "#e4f8e9",
                color: "#008060",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              High-Res
            </span>
          </div>

          <div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#202223" }}>
              300 DPI
            </div>
            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "2px" }}>
              Direct Shopify Files CDN
            </div>
          </div>

          <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #f6f6f7" }}>
            <Link to="/app/settings" style={{ color: "#008060", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
              Studio settings &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TWO-COLUMN OPERATIONAL SURFACE: TEMPLATES & RECENT ORDERS
      ========================================================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "20px",
          marginBottom: "28px",
        }}
      >
        {/* Left Column: Active Personalization Templates */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Section Header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #f1f2f3",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#202223" }}>
                Personalization Templates
              </div>
              <div style={{ fontSize: "12px", color: "#6d7175" }}>
                {totalTemplates} template{totalTemplates !== 1 ? "s" : ""} configured
              </div>
            </div>
            <Link
              to="/app/templates"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#008060",
                textDecoration: "none",
              }}
            >
              Browse all ({totalTemplates}) &rarr;
            </Link>
          </div>

          {/* Section Content */}
          <div style={{ flex: 1 }}>
            {templates.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🎨</div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                  No Templates Created Yet
                </div>
                <p style={{ color: "#6d7175", fontSize: "12px", margin: "0 0 16px" }}>
                  Create your first canvas to start offering customized products on your store.
                </p>
                <Link
                  to="/app/templates"
                  style={{
                    background: "#008060",
                    color: "#ffffff",
                    padding: "7px 14px",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "inline-block",
                  }}
                >
                  Create First Template
                </Link>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f2f3" }}>
                    <th style={{ padding: "10px 18px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase" }}>
                      Template
                    </th>
                    <th style={{ padding: "10px 14px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase" }}>
                      Print Bounds
                    </th>
                    <th style={{ padding: "10px 14px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase" }}>
                      Products
                    </th>
                    <th style={{ padding: "10px 18px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase", textAlign: "right" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f6f6f7" }}>
                      <td style={{ padding: "12px 18px", fontWeight: 600, color: "#202223" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>🎨</span>
                          <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.title}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", color: "#6d7175" }}>
                        <span style={{ background: "#f1f2f3", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>
                          {t.canvasWidth}×{t.canvasHeight} px
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            background: (t.products?.length || 0) > 0 ? "#e4f8e9" : "#f1f2f3",
                            color: (t.products?.length || 0) > 0 ? "#008060" : "#6d7175",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          {(t.products?.length || 0) > 0 ? "✓ " : ""}{t.products?.length || 0} linked
                        </span>
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        <Link
                          to={`/app/templates/${t.id}`}
                          style={{
                            color: "#008060",
                            fontWeight: 700,
                            fontSize: "12px",
                            textDecoration: "none",
                            background: "#e4f8e9",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            display: "inline-block",
                          }}
                        >
                          Studio &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f2f3", textAlign: "right", background: "#fbfcfd" }}>
            <Link to="/app/templates" style={{ fontSize: "12px", fontWeight: 600, color: "#008060", textDecoration: "none" }}>
              Manage all templates &rarr;
            </Link>
          </div>
        </div>

        {/* Right Column: Recent Customized Orders */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Section Header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #f1f2f3",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#202223" }}>
                Recent Customized Orders
              </div>
              <div style={{ fontSize: "12px", color: "#6d7175" }}>
                {totalOrders} order{totalOrders !== 1 ? "s" : ""} received
              </div>
            </div>
            <Link
              to="/app/orders"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#008060",
                textDecoration: "none",
              }}
            >
              Browse all ({totalOrders}) &rarr;
            </Link>
          </div>

          {/* Section Content */}
          <div style={{ flex: 1 }}>
            {orders.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>📦</div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                  No Custom Orders Received Yet
                </div>
                <p style={{ color: "#6d7175", fontSize: "12px", margin: "0 0 16px" }}>
                  When shoppers personalize items and checkout, their print files will appear here automatically.
                </p>
                <Link
                  to="/app/templates"
                  style={{
                    background: "#008060",
                    color: "#ffffff",
                    padding: "7px 14px",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "inline-block",
                  }}
                >
                  Link Products to Templates
                </Link>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f2f3" }}>
                    <th style={{ padding: "10px 18px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase" }}>
                      Order #
                    </th>
                    <th style={{ padding: "10px 14px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase" }}>
                      Item
                    </th>
                    <th style={{ padding: "10px 14px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase" }}>
                      Print Status
                    </th>
                    <th style={{ padding: "10px 18px", fontSize: "11px", color: "#6d7175", fontWeight: 700, textTransform: "uppercase", textAlign: "right" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any, idx: number) => {
                    const isReady = Boolean(o.printFileUrl || o.renderStatus === "completed");
                    return (
                      <tr key={(o.shopifyOrderId || idx) + "_" + idx} style={{ borderBottom: "1px solid #f6f6f7" }}>
                        <td style={{ padding: "12px 18px", fontWeight: 700, color: "#008060" }}>
                          <Link to="/app/orders" style={{ color: "#008060", textDecoration: "none" }}>
                            {o.shopifyOrderId}
                          </Link>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#202223" }}>
                          <div style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.productTitle}
                          </div>
                          <div style={{ fontSize: "11px", color: "#6d7175" }}>
                            {new Date(o.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              background: isReady ? "#e4f8e9" : "#fff5ea",
                              color: isReady ? "#008060" : "#b25e00",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            {isReady ? "✓ Ready" : "Pending"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 18px", textAlign: "right" }}>
                          <Link
                            to="/app/orders"
                            style={{
                              color: "#2563eb",
                              fontWeight: 600,
                              fontSize: "12px",
                              textDecoration: "none",
                              background: "#eff6ff",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              display: "inline-block",
                            }}
                          >
                            View &rarr;
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f2f3", textAlign: "right", background: "#fbfcfd" }}>
            <Link to="/app/orders" style={{ fontSize: "12px", fontWeight: 600, color: "#008060", textDecoration: "none" }}>
              Fulfill custom orders &rarr;
            </Link>
          </div>
        </div>
      </div>
    </s-page>
  );
}
