import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link, useNavigate } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { listTemplates, createTemplate } from "../models/template.server";
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
    templates: templates.slice(0, 6),
    totalTemplates: templates.length,
    totalProductsLinked,
    orders: orders.slice(0, 5),
    totalOrders: orders.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_category_template") {
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
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  useEffect(() => {
    if (fetcher.data?.createdId) {
      navigate(`/app/templates/${fetcher.data.createdId}`);
    }
  }, [fetcher.data, navigate]);

  const handleCreateCategory = (category: string) => {
    fetcher.submit({ intent: "create_category_template", category }, { method: "POST" });
  };

  return (
    <s-page heading="Product Personalizer & Print Studio">
      <div slot="primary-action" style={{ display: "flex", gap: "8px" }}>
        <s-button variant="secondary" href="/app/settings">
          ⚙️ App Settings
        </s-button>
        <s-button variant="primary" href="/app/templates">
          🎨 Template Studio
        </s-button>
      </div>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "20px" }}>
          <s-banner tone="success">{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* =========================================================================
          HERO BANNER WITH GRAPHICAL CANVAS MOCKUP
      ========================================================================= */}
      <div
        style={{
          background: "linear-gradient(135deg, #0b192c 0%, #1e3e62 50%, #000000 100%)",
          color: "#fff",
          borderRadius: "14px",
          padding: "20px 24px",
          marginBottom: "18px",
          boxShadow: "0 8px 24px rgba(11, 25, 44, 0.2)",
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.12)",
        }}
      >
        {/* Subtle background glow effect */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "320px",
            height: "320px",
            background: "radial-gradient(circle, rgba(0, 128, 96, 0.35) 0%, rgba(0,0,0,0) 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-60px",
            left: "20%",
            width: "260px",
            height: "260px",
            background: "radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, rgba(0,0,0,0) 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: "28px",
            alignItems: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Left Column: Headlines & CTAs */}
          <div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
              <span
                style={{
                  background: "rgba(0, 128, 96, 0.25)",
                  border: "1px solid rgba(0, 128, 96, 0.5)",
                  color: "#6ee7b7",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981" }} />
                STOREFRONT STUDIO 2.0
              </span>
              <span
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#e2e8f0",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                🌐 MULTI-LANGUAGE ENGINE
              </span>
            </div>

            <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 10px", color: "#ffffff", lineHeight: 1.25 }}>
              Custom Product Personalizer &amp; Live Studio
            </h1>

            <p style={{ margin: "0 0 24px", color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6, maxWidth: "560px" }}>
              Empower customers to personalize products live with custom multiline text, photo uploads, alignment tools, and side-by-side front &amp; back previews. Produces 300 DPI high-res print files uploaded directly to Shopify Files upon checkout.
            </p>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link
                to="/app/templates"
                style={{
                  background: "linear-gradient(135deg, #008060 0%, #00a876 100%)",
                  color: "#ffffff",
                  fontWeight: 700,
                  padding: "11px 22px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontSize: "13px",
                  boxShadow: "0 4px 14px rgba(0, 128, 96, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Launch Template Studio
              </Link>

              <Link
                to="/app/settings"
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  color: "#ffffff",
                  fontWeight: 600,
                  padding: "11px 18px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontSize: "13px",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backdropFilter: "blur(6px)",
                }}
              >
                🌐 Multi-Language &amp; Settings
              </Link>
            </div>
          </div>

          {/* Right Column: Graphical Studio Canvas Mockup */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "14px",
              padding: "18px",
              boxShadow: "0 16px 32px rgba(0,0,0,0.4)",
              backdropFilter: "blur(12px)",
              position: "relative",
            }}
          >
            {/* Header bar of graphic card */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "10px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ef4444" }} />
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10b981" }} />
              </div>
              <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, letterSpacing: "0.5px" }}>
                LIVE STUDIO PREVIEW
              </span>
            </div>

            {/* Graphic Illustration */}
            <div
              style={{
                background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
                borderRadius: "10px",
                padding: "20px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "170px",
                border: "1px dashed rgba(255,255,255,0.2)",
              }}
            >
              {/* Product Vector Illustration (Custom Cap / Shirt) */}
              <svg width="100" height="90" viewBox="0 0 100 90" fill="none" style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.5))" }}>
                {/* Cap Visor */}
                <ellipse cx="50" cy="62" rx="42" ry="14" fill="#334155" />
                <ellipse cx="50" cy="60" rx="40" ry="12" fill="#1e293b" />
                {/* Cap Crown */}
                <path d="M18 56 C20 20, 80 20, 82 56 Z" fill="#0f172a" stroke="#475569" stroke-width="2" />
                {/* Button top */}
                <circle cx="50" cy="22" r="4" fill="#64748b" />
                {/* Customizer Dashed Print Area */}
                <rect x="30" y="32" width="40" height="20" rx="3" fill="rgba(0, 128, 96, 0.2)" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3 3" />
                {/* Print text */}
                <text x="50" y="45" fill="#6ee7b7" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                  CUSTOM
                </text>
              </svg>

              {/* Floating feature pills */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  background: "rgba(16, 185, 129, 0.9)",
                  color: "#022c22",
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                }}
              >
                ✓ 300 DPI READY
              </div>

              <div
                style={{
                  position: "absolute",
                  bottom: "12px",
                  right: "12px",
                  background: "rgba(37, 99, 235, 0.9)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                }}
              >
                👕 FRONT &amp; BACK
              </div>
            </div>

            {/* Bottom status of card */}
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#94a3b8" }}>
              <span>Shopify Files Cloud Sync</span>
              <span style={{ color: "#34d399", fontWeight: 600 }}>● Active &amp; Ready</span>
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
          PRODUCT CATEGORY QUICK LAUNCH SHOWCASE (GRAPHICAL TILES)
      ========================================================================= */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Quick-Start Template Presets
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
              Launch pre-configured templates with calibrated canvas sizes and print bounds:
            </p>
          </div>
          <Link to="/app/templates" style={{ fontSize: "13px", color: "#008060", fontWeight: 600, textDecoration: "none" }}>
            Browse All ({totalTemplates}) &rarr;
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px" }}>
          
          {/* Preset 1: Apparel / T-Shirts */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#eff6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  marginBottom: "12px",
                }}
              >
                👕
              </div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>
                Apparel &amp; T-Shirts
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5, marginBottom: "14px" }}>
                Front &amp; Back chest print area, color variants, and sizing options.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCreateCategory("apparel")}
              disabled={fetcher.state === "submitting"}
              style={{
                width: "100%",
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Create T-Shirt Template
            </button>
          </div>

          {/* Preset 2: Headwear / Caps */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#ecfdf5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  marginBottom: "12px",
                }}
              >
                🧢
              </div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>
                Caps &amp; Headwear
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5, marginBottom: "14px" }}>
                Front crown laser patch, text embroidery, and high-contrast colorways.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCreateCategory("cap")}
              disabled={fetcher.state === "submitting"}
              style={{
                width: "100%",
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Create Cap Template
            </button>
          </div>

          {/* Preset 3: Drinkware / Mugs */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#fef3c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  marginBottom: "12px",
                }}
              >
                ☕
              </div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>
                Mugs &amp; Drinkware
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5, marginBottom: "14px" }}>
                Panoramic wrap-around canvas, dishwasher safe ceramic print guides.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCreateCategory("mug")}
              disabled={fetcher.state === "submitting"}
              style={{
                width: "100%",
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Create Mug Template
            </button>
          </div>

          {/* Preset 4: Wall Art & Canvas */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#fdf2f8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  marginBottom: "12px",
                }}
              >
                🖼️
              </div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>
                Canvas Wall Art
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5, marginBottom: "14px" }}>
                High-resolution gallery wrap frames with full bleed photo placement.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCreateCategory("canvas")}
              disabled={fetcher.state === "submitting"}
              style={{
                width: "100%",
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Create Wall Art Template
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRODUCTION WORKFLOW PIPELINE (GRAPHICAL STEPPER)
      ========================================================================= */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "24px",
          marginBottom: "28px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ marginBottom: "18px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>
            How the Personalization Studio Works
          </h3>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
            From studio configuration to automated 300 DPI fulfillment in 4 seamless steps:
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          
          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                1
              </span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Canvas Setup</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Define print areas, multi-side Front &amp; Back layers, font pickers, and upload dropzones in Template Studio.
            </p>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                2
              </span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Assign Products</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Link Shopify catalog products. Color swatches and product variants sync automatically to underlay mockups.
            </p>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                3
              </span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Shopper Customizes</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Customers click "Customize This Product", type multiline text, upload photos, and preview live before adding to cart.
            </p>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#008060", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                4
              </span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Shopify Files Sync</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Upon checkout, high-res design snapshots and customer raw photos upload directly to Shopify Files for fulfillment.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          RECENT TEMPLATES TABLE & SETUP GUIDE
      ========================================================================= */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "20px" }}>
        
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
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Template Title</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Canvas Size</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Linked Products</th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", color: "#64748b", fontWeight: 600, textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>🎨</span>
                          <span>{t.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "12px", color: "#64748b" }}>
                        <span style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: "4px", fontWeight: 500 }}>
                          {t.canvasWidth}×{t.canvasHeight} px ({t.printDpi} DPI)
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "12px" }}>
                        <span
                          style={{
                            color: (t.products?.length || 0) > 0 ? "#059669" : "#94a3b8",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {(t.products?.length || 0) > 0 ? "✓ " : "○ "}
                          {t.products?.length || 0} products linked
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <Link
                          to={`/app/templates/${t.id}`}
                          style={{
                            color: "#008060",
                            fontSize: "12px",
                            fontWeight: 700,
                            textDecoration: "none",
                            background: "#ecfdf5",
                            padding: "6px 12px",
                            borderRadius: "6px",
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

        {/* Quick App Guide & Storefront Test */}
        <s-section heading="Storefront Test Drive">
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#eff6ff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
                  🛍️
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Test on Live Storefront</div>
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px", lineHeight: 1.5 }}>
                    Open any customized product page on your online store to preview the live personalizer modal and button.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
                  🧩
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Theme App Embed</div>
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px", lineHeight: 1.5 }}>
                    Verify that "Product Personalizer" is toggled ON under <strong>Theme Settings &gt; App embeds</strong>.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#ecfdf5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
                  🌐
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>In-App Translations</div>
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px", lineHeight: 1.5 }}>
                    Manage translations for English, Spanish, French, German, etc. directly in App Settings without touching code.
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", marginTop: "4px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <Link
                  to="/app/guide"
                  style={{
                    color: "#008060",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  📖 View Full Visual Setup Guide &rarr;
                </Link>
                <Link
                  to="/app/orders"
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  📦 Manage Customized Orders &rarr;
                </Link>
              </div>
            </div>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}
