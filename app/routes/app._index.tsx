import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link, useNavigate } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { listTemplates, createTemplate } from "../models/template.server";
import { listCustomizedOrders } from "../models/order.server";
import { getShopBillingInfo } from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const templates = await listTemplates(session.shop);
  const orders = await listCustomizedOrders(session.shop);
  const billingInfo = await getShopBillingInfo(session.shop, billing);

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

  if (intent === "create_category_template") {
    const billingInfo = await getShopBillingInfo(session.shop, billing);
    if (!billingInfo.canCreateMore) {
      return {
        success: false,
        planLimitReached: true,
        message: `Plan limit reached: your store has used ${billingInfo.currentTemplateCount} of ${billingInfo.templateLimit} templates on the ${billingInfo.activePlan} plan. Please upgrade your plan to create more templates.`,
      };
    }

    const category = (formData.get("category") as string) || "apparel";
    const templatesMap: Record<string, { title: string; width: number; height: number; dpi: number }> = {
      apparel: { title: "Custom Classic T-Shirt (Front & Back)", width: 1200, height: 1200, dpi: 300 },
      cap: { title: "Custom Embroidered Cap", width: 1200, height: 1200, dpi: 300 },
      mug: { title: "Custom Ceramic Coffee Mug", width: 1400, height: 800, dpi: 300 },
      canvas: { title: "Custom Canvas Wall Art", width: 1600, height: 1200, dpi: 300 },
    };
    const tpl = templatesMap[category] || templatesMap.apparel;
    const newTpl = await createTemplate(session.shop, {
      title: tpl.title,
      canvasWidth: tpl.width,
      canvasHeight: tpl.height,
      printDpi: tpl.dpi,
      layersJson: JSON.stringify([]),
    });
    return { success: true, message: `Created template "${tpl.title}"!`, createdId: newTpl.id };
  }

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

  useEffect(() => {
    if (fetcher.data?.createdId) {
      navigate(`/app/templates/${fetcher.data.createdId}`);
    }
  }, [fetcher.data, navigate]);

  return (
    <s-page heading="Product personalizer & print studio">
      <s-button slot="primary-action" variant="primary" href="/app/templates">
        Template studio
      </s-button>
      <s-button slot="secondary-actions" href="/app/pricing">
        Plans &amp; pricing
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone={fetcher.data?.success ? "success" : "critical"}>{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* Plan Limit Warning Banner */}
      {!billingInfo.canCreateMore && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "10px",
            padding: "14px 18px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, color: "#92400e", fontSize: "14px" }}>
                Template limit reached ({totalTemplates} of {billingInfo.templateLimit} templates used on {billingInfo.activePlan} plan)
              </div>
              <div style={{ color: "#b45309", fontSize: "12px" }}>
                Upgrade to Starter ($5/mo for 5 templates) or Unlimited ($20/mo) to unlock additional template slots.
              </div>
            </div>
          </div>
          <Link
            to="/app/pricing"
            style={{
              padding: "8px 16px",
              background: "#2563eb",
              color: "#ffffff",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Upgrade Plan →
          </Link>
        </div>
      )}

      {/* =========================================================================
          POLARIS HERO CARD (Clean light theme conforming to Shopify visual guidelines)
      ========================================================================= */}
      <div
        style={{
          background: "#ffffff",
          color: "#0f172a",
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: "24px",
            alignItems: "center",
          }}
        >
          {/* Left Column: Headlines & Feature Badges */}
          <div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
              <span
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                Storefront studio 2.0
              </span>
              <span
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  color: "#475569",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                Multi-language engine
              </span>
              <span
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1d4ed8",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                300 DPI print-ready
              </span>
              <Link
                to="/app/pricing"
                style={{
                  background:
                    billingInfo.activePlan === "Unlimited"
                      ? "#f3e8ff"
                      : billingInfo.activePlan === "Starter"
                        ? "#eff6ff"
                        : "#f8fafc",
                  border: `1px solid ${
                    billingInfo.activePlan === "Unlimited"
                      ? "#d8b4fe"
                      : billingInfo.activePlan === "Starter"
                        ? "#bfdbfe"
                        : "#cbd5e1"
                  }`,
                  color:
                    billingInfo.activePlan === "Unlimited"
                      ? "#7e22ce"
                      : billingInfo.activePlan === "Starter"
                        ? "#1d4ed8"
                        : "#334155",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>📦 Plan: {billingInfo.activePlan} ({billingInfo.currentTemplateCount}/{billingInfo.templateLimit === Infinity ? "∞" : billingInfo.templateLimit})</span>
                <span style={{ textDecoration: "underline" }}>Upgrade</span>
              </Link>
            </div>

            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a", lineHeight: 1.3 }}>
              Live product personalization &amp; automated print files
            </h1>

            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "13px", lineHeight: 1.5, maxWidth: "560px" }}>
              Enable customers to customize products live with multiline text, photo uploads, alignment tools, and front &amp; back previews. Produces 300 DPI high-resolution print files uploaded directly to your Shopify Files CDN upon checkout.
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link
                to="/app/templates"
                style={{
                  background: "#008060",
                  color: "#ffffff",
                  fontWeight: 600,
                  padding: "8px 16px",
                  borderRadius: "6px",
                  textDecoration: "none",
                  fontSize: "13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                Open template studio &rarr;
              </Link>

              <Link
                to="/app/guide"
                style={{
                  background: "#ffffff",
                  color: "#334155",
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: "6px",
                  textDecoration: "none",
                  fontSize: "13px",
                  border: "1px solid #cbd5e1",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                Setup guide
              </Link>
            </div>
          </div>

          {/* Right Column: Clean Vector Mockup Card */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                Studio Live Preview
              </span>
              <span style={{ fontSize: "11px", color: "#059669", fontWeight: 600 }}>
                ● Active on storefront
              </span>
            </div>

            <div
              style={{
                background: "#ffffff",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "130px",
                border: "1px dashed #cbd5e1",
                position: "relative",
              }}
            >
              {/* Product Vector Illustration */}
              <svg width="84" height="74" viewBox="0 0 100 90" fill="none">
                <ellipse cx="50" cy="62" rx="42" ry="14" fill="#cbd5e1" />
                <ellipse cx="50" cy="60" rx="40" ry="12" fill="#94a3b8" />
                <path d="M18 56 C20 20, 80 20, 82 56 Z" fill="#334155" stroke="#1e293b" strokeWidth="2" />
                <circle cx="50" cy="22" r="4" fill="#64748b" />
                <rect x="30" y="32" width="40" height="20" rx="3" fill="rgba(0, 128, 96, 0.1)" stroke="#008060" strokeWidth="1.5" strokeDasharray="3 3" />
                <text x="50" y="45" fill="#008060" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                  CUSTOM
                </text>
              </svg>

              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  left: "8px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "10px",
                }}
              >
                ✓ 300 DPI
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  right: "8px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1d4ed8",
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "10px",
                }}
              >
                👕 Front &amp; Back
              </div>
            </div>

            <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#64748b" }}>
              <span>Shopify Files CDN</span>
              <span style={{ color: "#059669", fontWeight: 600 }}>Direct Cloud Upload</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          GRAPHICAL STATS CARDS
      ========================================================================= */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        
        {/* Stat 1: Active Templates */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Active Templates
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, margin: "6px 0", color: "#0f172a" }}>
                {totalTemplates}
              </div>
            </div>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2563eb",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
          </div>
          <Link to="/app/templates" style={{ color: "#2563eb", fontSize: "12px", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            Manage in Studio &rarr;
          </Link>
        </div>

        {/* Stat 2: Linked Products */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Customized Products
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, margin: "6px 0", color: "#0f172a" }}>
                {totalProductsLinked}
              </div>
            </div>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#059669",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
          </div>
          {totalProductsLinked === 0 ? (
            <button
              type="button"
              onClick={() => fetcher.submit({ intent: "create_sample_products" }, { method: "POST" })}
              disabled={fetcher.state === "submitting"}
              style={{
                background: "none",
                border: "none",
                color: "#008060",
                fontSize: "12px",
                padding: 0,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {fetcher.state === "submitting" ? "Creating..." : "+ Add Sample Products"}
            </button>
          ) : (
            <span style={{ color: "#059669", fontSize: "12px", fontWeight: 600 }}>✓ Linked to catalog</span>
          )}
        </div>

        {/* Stat 3: Orders Placed */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Customized Orders
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, margin: "6px 0", color: "#0f172a" }}>
                {totalOrders}
              </div>
            </div>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7c3aed",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
          </div>
          <Link to="/app/orders" style={{ color: "#7c3aed", fontSize: "12px", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            View print orders &rarr;
          </Link>
        </div>

        {/* Stat 4: Print Output Guarantee */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Print Resolution
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, margin: "6px 0", color: "#0f172a" }}>
                300 DPI
              </div>
            </div>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#d97706",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </div>
          </div>
          <span style={{ color: "#64748b", fontSize: "12px" }}>Direct Shopify Files CDN</span>
        </div>
      </div>

      {/* =========================================================================
          RECENT TEMPLATES & RECENT CUSTOM ORDERS
      ========================================================================= */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        
        {/* Recent Templates Table */}
        <s-section heading="Personalization Templates">
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            {templates.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎨</div>
                <h4 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  No Templates Created Yet
                </h4>
                <p style={{ color: "#64748b", margin: "0 0 18px", fontSize: "13px" }}>
                  Get started by creating your first customizable canvas template.
                </p>
                <Link
                  to="/app/templates"
                  style={{
                    background: "#008060",
                    color: "#fff",
                    padding: "9px 18px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Create Your First Template
                </Link>
              </div>
            ) : (
              <div>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Template Title</th>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Size</th>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Products</th>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🎨</span>
                            <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.title}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b" }}>
                          <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                            {t.canvasWidth}×{t.canvasHeight}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: "12px" }}>
                          <span
                            style={{
                              color: (t.products?.length || 0) > 0 ? "#059669" : "#94a3b8",
                              fontWeight: 600,
                              fontSize: "12px",
                            }}
                          >
                            {(t.products?.length || 0) > 0 ? "✓ " : "○ "}
                            {t.products?.length || 0}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <Link
                            to={`/app/templates/${t.id}`}
                            style={{
                              color: "#008060",
                              fontSize: "12px",
                              fontWeight: 700,
                              textDecoration: "none",
                              background: "#ecfdf5",
                              padding: "4px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            Studio &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", textAlign: "right", background: "#fafafa" }}>
                  <Link to="/app/templates" style={{ fontSize: "12px", fontWeight: 600, color: "#008060", textDecoration: "none" }}>
                    Manage All Templates ({totalTemplates}) &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        </s-section>

        {/* Recent Custom Orders Table */}
        <s-section heading="Recent Custom Orders">
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            {orders.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", marginBottom: "10px" }}>📦</div>
                <h4 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  No Custom Orders Yet
                </h4>
                <p style={{ color: "#64748b", margin: "0 0 18px", fontSize: "13px" }}>
                  When customers customize items on your storefront, orders will appear here.
                </p>
                <Link
                  to="/app/orders"
                  style={{
                    background: "#008060",
                    color: "#fff",
                    padding: "9px 18px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  View Custom Orders
                </Link>
              </div>
            ) : (
              <div>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Order</th>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Product</th>
                      <th style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b", fontWeight: 600, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o: any, idx: number) => (
                      <tr key={(o.shopifyOrderId || idx) + "_" + idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: "12px", color: "#008060" }}>
                          <Link to="/app/orders" style={{ color: "#008060", textDecoration: "none", fontWeight: 700 }}>
                            {o.shopifyOrderId}
                          </Link>
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: "12px", color: "#0f172a", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {o.productTitle}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <Link
                            to="/app/orders"
                            style={{
                              color: "#2563eb",
                              fontSize: "12px",
                              fontWeight: 600,
                              textDecoration: "none",
                              background: "#eff6ff",
                              padding: "4px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            Details &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", textAlign: "right", background: "#fafafa" }}>
                  <Link to="/app/orders" style={{ fontSize: "12px", fontWeight: 600, color: "#008060", textDecoration: "none" }}>
                    View All Orders ({totalOrders}) &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        </s-section>
      </div>
    </s-page>
  );
}
