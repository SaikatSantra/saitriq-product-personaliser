import type { LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { ok: true };
};

export default function AppGuide() {
  const steps = [
    {
      num: "1",
      title: "Create a New Customization Template",
      badge: "Admin Studio",
      points: [
        "Open the Templates page from the top navigation bar and click Create Template.",
        "Enter a descriptive Template Name (e.g. Classic T-Shirt Front & Back).",
        "Verify Print Bounds (default 1200 × 1200 px) and Print Resolution (300 DPI recommended for apparel & merchandise printing).",
      ],
      actionLabel: "Go to Templates →",
      actionTo: "/app/templates",
    },
    {
      num: "2",
      title: "Design Front Side & Back Side Layers",
      badge: "Dual-Side Canvas",
      points: [
        "Use the 👕 Front Side and 🔄 Back Side switcher tabs directly above the workspace canvas.",
        "Upload Mockup Underlay: Optionally upload a Front mockup on the Front tab and a Back mockup on the Back tab (if left empty, the storefront automatically uses your Shopify product variant & gallery images).",
        "Click 🔤 Add Custom Text to add editable text zones. In the right Layer Inspector, set the default Font Family, Fill Color, Layer Name, and ensure Customer Editable on Storefront is checked with a clear Storefront Input Label.",
        "Click 🖼️ Add Photo Upload Area to place dashed dropzones where customers can upload their own logos or photos.",
      ],
    },
    {
      num: "3",
      title: "Link Shopify Products to the Template",
      badge: "Product Assignment",
      points: [
        "In the top-right bar of the Template Studio, click Assign Products.",
        "Select all Shopify products that should use this customizer studio.",
        "Click Save Template to persist both Front & Back side layers and storefront controls.",
      ],
    },
    {
      num: "4",
      title: "Prepare Product Variant & Back Images in Shopify (For Multi-Color Apparel)",
      badge: "Storefront Sync",
      points: [
        "In Shopify Admin → Products, assign each color variant's Front image as that variant's featured image (e.g. Black Front, Blue Front, White Front).",
        "To show matching color Back views when customers switch variants, add the color and 'back' to each back image's Alt Text (e.g., 'Blue Back', 'Black Back'), OR place each Back image directly after its corresponding Front image in the media gallery.",
        "When a customer switches from Black to Blue on the storefront, both Front and Back views update cleanly to Blue without mixing sides.",
      ],
    },
    {
      num: "5",
      title: "Add the Personalizer Block to Your Theme",
      badge: "Theme Editor",
      points: [
        "In Shopify Admin, go to Online Store → Themes → Customize.",
        "Switch the page selector at the top to Products → Default product.",
        "Inside Product Information, click Add block → Apps → Product Personalizer.",
        "Position the button above or near Buy buttons, customize the accent color/button text if desired, and click Save.",
        "Shoppers can click 🎨 Customize This Product to personalize Front & Back, or use the normal Add to Cart button to buy the default product without customization.",
      ],
    },
    {
      num: "6",
      title: "Fulfill Orders & Download Print Assets",
      badge: "Order Management",
      points: [
        "Open the Custom Orders page inside this app whenever customized orders arrive.",
        "Inspect side-by-side thumbnails for FRONT Preview, BACK Preview, and RAW customer-uploaded photos.",
        "Review exact customer parameters passed through the order: Front Text, Front Font, Front Color, Back Text, Back Font, Back Color, and uploaded image URLs.",
        "Click Generate 300 DPI Print File to create a high-resolution printable PDF asset for production.",
      ],
      actionLabel: "View Custom Orders →",
      actionTo: "/app/orders",
    },
  ];

  return (
    <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "20px 24px 60px" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            to="/app"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "8px",
              background: "#fff",
              border: "1px solid #cbd5e1",
              color: "#334155",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ← Dashboard
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
              Setup &amp; Store Integration Guide
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
              Step-by-step instructions to create templates, assign catalog products, and enable the live storefront customizer.
            </p>
          </div>
        </div>

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
            boxShadow: "0 2px 4px rgba(0, 128, 96, 0.2)",
          }}
        >
          🎨 Go to Templates
        </Link>
      </div>

      {/* Graphical Hero Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0b192c 0%, #1e3e62 60%, #008060 100%)",
          color: "#ffffff",
          borderRadius: "14px",
          padding: "24px 28px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ maxWidth: "700px", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            <span
              style={{
                background: "rgba(0, 128, 96, 0.3)",
                border: "1px solid rgba(0, 128, 96, 0.6)",
                color: "#6ee7b7",
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              🚀 QUICK ONBOARDING ROADMAP
            </span>
            <span
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#e2e8f0",
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              📖 6 EASY STEPS
            </span>
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 800, color: "#ffffff" }}>
            Get Your Store Customizer Ready in Minutes
          </h2>
          <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.6", color: "#cbd5e1" }}>
            Follow this 6-step roadmap to configure 300 DPI templates, connect products from your Shopify catalog, customize language translations, and handle order fulfillment.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
        {steps.map((step) => (
          <div
            key={step.num}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#008060",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "14px",
                    flexShrink: 0,
                    boxShadow: "0 2px 4px rgba(0, 128, 96, 0.2)",
                  }}
                >
                  {step.num}
                </span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  {step.title}
                </h3>
              </div>

              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                {step.badge}
              </span>
            </div>

            <ul
              style={{
                margin: "0 0 0 44px",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                color: "#334155",
                fontSize: "13.5px",
                lineHeight: "1.55",
              }}
            >
              {step.points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>

            {step.actionTo && (
              <div style={{ marginTop: "16px", marginLeft: "44px" }}>
                <Link
                  to={step.actionTo}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#008060",
                    fontWeight: 700,
                    fontSize: "13px",
                    textDecoration: "none",
                  }}
                >
                  {step.actionLabel}
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
