import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function AppGuide() {
  const { shop } = useLoaderData<typeof loader>();
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
        "In Shopify Admin, go to Online Store → Themes → Customize (or click the direct link below).",
        "Switch the page selector at the top to Products → Default product.",
        "Inside Product Information, click Add block → Apps → Product Personalizer.",
        "Position the button above or near Buy buttons, customize the accent color/button text if desired, and click Save.",
        "Shoppers can click 🎨 Customize This Product to personalize Front & Back, or use the normal Add to Cart button to buy the default product without customization.",
      ],
      actionLabel: "Open Shopify Theme Editor (Product Page) ↗",
      externalUrl: `https://${shop}/admin/themes/current/editor?template=product`,
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

  const workflowSteps = [
    {
      num: "1",
      title: "Canvas Setup",
      description: "Define print bounding dimensions, dual-side Front & Back layers, font pickers, and upload dropzones in the Template Studio.",
    },
    {
      num: "2",
      title: "Assign Products",
      description: "Link Shopify catalog products. Color swatches and product variants automatically sync to background mockups.",
    },
    {
      num: "3",
      title: "Shopper Customizes",
      description: "Shoppers click 'Customize This Product' on your storefront, type personalized text, upload photos, and preview live before checkout.",
    },
    {
      num: "4",
      title: "Shopify Files Fulfillment",
      description: "Upon checkout, 300 DPI high-res design snapshots and customer raw photo uploads automatically link to order line items for printing.",
    },
  ];

  return (
    <s-page heading="Setup guide">
      <s-button slot="primary-action" variant="primary" href="/app/templates">
        Create template
      </s-button>
      <s-button slot="secondary-actions" href="/app/orders">
        Custom orders
      </s-button>

      {/* Polaris Info Banner */}
      <div style={{ marginBottom: "20px" }}>
        <s-banner tone="info" heading="Complete Onboarding & Configuration Guide">
          This comprehensive guide contains all instructions for configuring 300 DPI templates, connecting Shopify catalog products, activating the theme app block, and fulfilling custom print orders.
        </s-banner>
      </div>

      {/* 4-Step Production Workflow Stepper */}
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
          <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>
            How the Personalization Studio Works
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
            From studio configuration to automated 300 DPI fulfillment in 4 seamless steps:
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {workflowSteps.map((ws) => (
            <div
              key={ws.num}
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                padding: "16px",
                border: "1px solid #f1f5f9",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    background: "#008060",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {ws.num}
                </span>
                <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>{ws.title}</span>
              </div>
              <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                {ws.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed 6-Step Implementation Roadmap */}
      <div style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 14px", color: "#0f172a" }}>
          Step-by-Step Setup Roadmap
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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

              {step.externalUrl && (
                <div style={{ marginTop: "16px", marginLeft: "44px" }}>
                  <a
                    href={step.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#008060",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "13px",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      textDecoration: "none",
                      boxShadow: "0 1px 3px rgba(0, 128, 96, 0.2)",
                    }}
                  >
                    {step.actionLabel}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Storefront Verification & Theme App Embed Checklist */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "24px",
          marginBottom: "32px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 14px", color: "#0f172a" }}>
          Storefront Verification &amp; Theme Checklist
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "20px" }}>🛍️</span>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>Test on Live Storefront</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Open any assigned product page on your online store to preview the live customizer modal, text inputs, and photo upload dropzone.
            </p>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "20px" }}>🧩</span>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>Theme App Embed &amp; Block</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Go to <strong>Online Store &gt; Themes &gt; Customize</strong>, open the default Product template, and ensure the <strong>Product Personalizer</strong> app block is added and saved.
            </p>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "20px" }}>🌐</span>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>Multi-Language Translations</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              Configure custom wording for English, Spanish, French, German, or Italian in <Link to="/app/settings" style={{ color: "#008060", fontWeight: 600 }}>App Settings</Link>.
            </p>
          </div>
        </div>
      </div>
    </s-page>
  );
}
