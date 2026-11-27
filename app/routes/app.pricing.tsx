import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import {
  PLANS,
  PLAN_FREE,
  PLAN_STARTER,
  PLAN_UNLIMITED,
} from "../models/billing.types";
import {
  getShopBillingInfo,
  getManagedPricingUrl,
} from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const [billingInfo, managedPricingUrl] = await Promise.all([
    getShopBillingInfo(session.shop, billing, admin),
    getManagedPricingUrl(session.shop, admin),
  ]);

  return {
    shop: session.shop,
    billingInfo,
    plans: Object.values(PLANS),
    managedPricingUrl,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const managedPricingUrl = await getManagedPricingUrl(session.shop, admin);
  return redirect(managedPricingUrl, { target: "_top" });
};

export default function PricingPage() {
  const { billingInfo, plans, managedPricingUrl } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const isUpgraded = searchParams.get("upgraded") === "true";

  const activePlanId = billingInfo.activePlan;

  const templateLimitText =
    billingInfo.templateLimit === Infinity
      ? "Unlimited"
      : `${billingInfo.templateLimit}`;

  return (
    <s-page heading="Plans & Pricing">
      {/* Upgraded Success Banner */}
      {isUpgraded && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 2px 6px rgba(16, 185, 129, 0.08)",
          }}
        >
          <span style={{ fontSize: "24px" }}>🎉</span>
          <div>
            <div style={{ fontWeight: 700, color: "#166534", fontSize: "15px" }}>
              Plan Upgraded Successfully!
            </div>
            <div style={{ color: "#15803d", fontSize: "13px" }}>
              Your store is now on the <strong>{activePlanId}</strong> plan. You can create up to{" "}
              <strong>{templateLimitText} templates</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Intro Header & Billing Info Note */}
      <div style={{ marginBottom: "24px" }}>
        <p style={{ margin: "0 0 6px", fontSize: "15px", color: "#475569" }}>
          Choose the ideal plan for your personalization studio. All paid plans are billed on a{" "}
          <strong style={{ color: "#0f172a" }}>monthly recurring basis (every 30 days)</strong> directly through your Shopify bill.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "12px", color: "#64748b" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span> Official Shopify Billing
          </span>
          <span>•</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span> Cancel or upgrade anytime
          </span>
          <span>•</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span> Instant template quota activation
          </span>
        </div>
      </div>

      {/* Current Plan & Usage Summary Bar */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          padding: "20px 24px",
          marginBottom: "28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
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
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "#ecfdf5",
              color: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            📊
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
                Current Active Plan
              </span>
              <span
                style={{
                  background: activePlanId === PLAN_UNLIMITED ? "#f3e8ff" : activePlanId === PLAN_STARTER ? "#eff6ff" : "#f1f5f9",
                  color: activePlanId === PLAN_UNLIMITED ? "#7e22ce" : activePlanId === PLAN_STARTER ? "#1d4ed8" : "#475569",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {activePlanId} Plan
              </span>
            </div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
              {billingInfo.currentTemplateCount} of {templateLimitText} templates used
            </div>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div style={{ minWidth: "240px", flex: "1", maxWidth: "340px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
            <span>Template Quota Usage</span>
            <span>
              {billingInfo.templateLimit === Infinity
                ? "Unlimited Templates"
                : `${Math.round((billingInfo.currentTemplateCount / billingInfo.templateLimit) * 100)}% Used`}
            </span>
          </div>
          <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width:
                  billingInfo.templateLimit === Infinity
                    ? "25%"
                    : `${Math.min(100, (billingInfo.currentTemplateCount / billingInfo.templateLimit) * 100)}%`,
                background:
                  !billingInfo.canCreateMore && billingInfo.templateLimit !== Infinity
                    ? "#ef4444"
                    : "#10b981",
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <Link
            to="/app/templates"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              color: "#334155",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Manage Templates →
          </Link>
        </div>
      </div>

      {/* 3-Column Plan Pricing Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "24px",
          marginBottom: "36px",
        }}
      >
        {plans.map((p) => {
          const isCurrent = activePlanId.toLowerCase() === p.id.toLowerCase();
          const isStarter = p.id === PLAN_STARTER;
          const isUnlimited = p.id === PLAN_UNLIMITED;

          return (
            <div
              key={p.id}
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                border: isCurrent
                  ? "2px solid #10b981"
                  : isStarter
                    ? "2px solid #2563eb"
                    : "1px solid #e2e8f0",
                boxShadow: isStarter
                  ? "0 10px 25px -5px rgba(37, 99, 235, 0.12), 0 8px 10px -6px rgba(37, 99, 235, 0.08)"
                  : "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
                transition: "transform 0.15s ease",
              }}
            >
              {/* Top Banner Tag */}
              {p.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    right: "14px",
                    background: isStarter ? "#dbeafe" : "#f3e8ff",
                    color: isStarter ? "#1d4ed8" : "#7e22ce",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {p.badge}
                </div>
              )}

              {/* Card Header */}
              <div style={{ padding: "26px 26px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                  {p.name} Plan
                </h3>
                <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b", minHeight: "36px", lineHeight: 1.4 }}>
                  {p.description}
                </p>

                {/* Price Display */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span style={{ fontSize: "36px", fontWeight: 800, color: "#0f172a", letterSpacing: "-1px" }}>
                    ${p.price}
                  </span>
                  <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 500 }}>
                    USD / month
                  </span>
                </div>

                <div style={{ fontSize: "12px", color: p.price > 0 ? "#2563eb" : "#10b981", fontWeight: 600, marginTop: "4px" }}>
                  {p.intervalText}
                </div>

                <div
                  style={{
                    marginTop: "14px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: isCurrent ? "#ecfdf5" : isStarter ? "#eff6ff" : isUnlimited ? "#f5f3ff" : "#f8fafc",
                    border: `1px solid ${isCurrent ? "#a7f3d0" : isStarter ? "#bfdbfe" : isUnlimited ? "#ddd6fe" : "#e2e8f0"}`,
                    fontSize: "13px",
                    fontWeight: 700,
                    color: isCurrent ? "#065f46" : isStarter ? "#1e40af" : isUnlimited ? "#5b21b6" : "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>📦</span>
                  <span>
                    {p.templateLimit === Infinity
                      ? "Unlimited Personalization Templates"
                      : `${p.templateLimit} Personalization Templates Included`}
                  </span>
                </div>
              </div>

              {/* Highlights Pill Tags */}
              {p.highlights && (
                <div style={{ padding: "12px 26px 0", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {p.highlights.map((h, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        background: "#f1f5f9",
                        color: "#475569",
                        padding: "2px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )}

              {/* Features List */}
              <div style={{ padding: "20px 26px", flex: "1", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Plan Capabilities:
                </div>
                {p.features.map((feat, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "#334155", lineHeight: 1.4 }}>
                    <span style={{ color: "#10b981", fontWeight: 800, lineHeight: 1 }}>✓</span>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              {/* Action Button */}
              <div style={{ padding: "0 26px 26px" }}>
                {isCurrent ? (
                  <div>
                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        padding: "12px 18px",
                        borderRadius: "10px",
                        background: "#f1f5f9",
                        border: "1px solid #cbd5e1",
                        color: "#475569",
                        fontWeight: 700,
                        fontSize: "14px",
                        cursor: "default",
                      }}
                    >
                      ✓ Current Active Plan
                    </button>

                    {(isStarter || isUnlimited) && (
                      <div style={{ marginTop: "10px", textAlign: "center" }}>
                        <a
                          href={managedPricingUrl}
                          target="_top"
                          rel="noopener noreferrer"
                          style={{
                            color: "#475569",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "underline",
                          }}
                        >
                          Manage or cancel plan on Shopify ↗
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <a
                    href={managedPricingUrl}
                    target="_top"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      textAlign: "center",
                      textDecoration: "none",
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "12px 18px",
                      borderRadius: "10px",
                      background: isStarter ? "#2563eb" : isUnlimited ? "#0f172a" : "#ffffff",
                      border: isStarter || isUnlimited ? "none" : "1px solid #cbd5e1",
                      color: isStarter || isUnlimited ? "#ffffff" : "#1e293b",
                      fontWeight: 700,
                      fontSize: "14px",
                      cursor: "pointer",
                      boxShadow: isStarter
                        ? "0 4px 12px rgba(37, 99, 235, 0.25)"
                        : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {p.id === PLAN_FREE
                      ? "Switch to Free on Shopify ↗"
                      : `Choose ${p.name} on Shopify ($${p.price}/mo) ↗`}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          padding: "24px",
          marginBottom: "32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
          Plan Comparison & Features
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#475569" }}>Feature</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a", width: "22%" }}>Free ($0)</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#2563eb", width: "22%" }}>Starter ($5/mo)</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, color: "#7e22ce", width: "22%" }}>Unlimited ($20/mo)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>Template Quota</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>2 Templates</td>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2563eb" }}>5 Templates</td>
                <td style={{ padding: "12px 16px", fontWeight: 700, color: "#7e22ce" }}>Unlimited (No limits)</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>Billing Frequency</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Free forever</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Recurring every 30 days</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Recurring every 30 days</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>Linked Products & Variants</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Included</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Unlimited</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Unlimited</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>Multi-Side Customization (Front & Back)</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>300 DPI Print Output Files (PNG)</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>300 DPI Production PDF Export</td>
                <td style={{ padding: "12px 16px", color: "#94a3b8" }}>—</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>Multi-language Storefront Customization</td>
                <td style={{ padding: "12px 16px", color: "#94a3b8" }}>—</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
                <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>✓</td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>Merchant Support</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Standard Docs</td>
                <td style={{ padding: "12px 16px", color: "#475569" }}>Priority Email</td>
                <td style={{ padding: "12px 16px", fontWeight: 700, color: "#7e22ce" }}>24/7 VIP Priority</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          padding: "24px",
          marginBottom: "32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
          Frequently Asked Questions
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          <div>
            <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "14px", marginBottom: "4px" }}>
              How does the recurring monthly billing work?
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
              Paid plans are billed every 30 days directly through your regular Shopify monthly invoice. You will see a single consolidated charge from Shopify with zero hidden fees.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "14px", marginBottom: "4px" }}>
              What happens if I need more than 5 templates?
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
              You can upgrade to the Unlimited plan ($20/month) at any time. The upgrade takes effect immediately so you can create unlimited custom product templates.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "14px", marginBottom: "4px" }}>
              Can I cancel or downgrade anytime?
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
              Yes. You can cancel your paid subscription at any time with a single click. Your store will automatically return to the Free plan (up to 2 templates) without losing existing order data.
            </div>
          </div>
        </div>
      </div>

      {/* Trust & Guarantee Banner */}
      <div
        style={{
          background: "#f8fafc",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "28px" }}>🛡️</span>
        <div style={{ flex: 1, minWidth: "260px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "2px" }}>
            Official Shopify App Pricing Integration
          </div>
          <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.4 }}>
            All subscriptions are securely hosted and managed through Shopify App Pricing. Charges are recurring every 30 days, prorated automatically, and protected by Shopify's merchant guarantees.
          </div>
        </div>
      </div>
    </s-page>
  );
}
