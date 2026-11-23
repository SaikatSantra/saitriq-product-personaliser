import { useState, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, Link } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
} from "../models/template.server";
import { getShopBillingInfo } from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const templates = await listTemplates(session.shop);
  const billingInfo = await getShopBillingInfo(session.shop, billing);
  return { templates, billingInfo };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const templateId = formData.get("templateId") as string;

  if (intent === "create") {
    const billingInfo = await getShopBillingInfo(session.shop, billing);
    if (!billingInfo.canCreateMore) {
      return {
        success: false,
        planLimitReached: true,
        message: `Plan limit reached: your store is on the ${billingInfo.activePlan} plan (${billingInfo.currentTemplateCount} of ${billingInfo.templateLimit} templates used). Please upgrade to create more templates.`,
      };
    }

    const title = (formData.get("title") as string)?.trim() || "New Personalization Template";
    const canvasWidth = parseInt(formData.get("canvasWidth") as string) || 1200;
    const canvasHeight = parseInt(formData.get("canvasHeight") as string) || 1200;
    const printDpi = parseInt(formData.get("printDpi") as string) || 300;

    const newTemplate = await createTemplate(session.shop, {
      title,
      canvasWidth,
      canvasHeight,
      printDpi,
      layersJson: JSON.stringify([]),
    });

    return { success: true, createdId: newTemplate.id, message: `Template "${title}" created successfully!` };
  }

  if (intent === "rename" && templateId) {
    const title = (formData.get("title") as string)?.trim();
    if (title) {
      await updateTemplate(templateId, session.shop, { title });
      return { success: true, message: `Template renamed to "${title}"` };
    }
  }

  if (intent === "duplicate" && templateId) {
    const billingInfo = await getShopBillingInfo(session.shop, billing);
    if (!billingInfo.canCreateMore) {
      return {
        success: false,
        planLimitReached: true,
        message: `Cannot duplicate template: plan limit reached (${billingInfo.currentTemplateCount} of ${billingInfo.templateLimit} templates used on ${billingInfo.activePlan} plan). Please upgrade your plan.`,
      };
    }

    await duplicateTemplate(templateId, session.shop);
    return { success: true, message: "Template duplicated successfully" };
  }

  if (intent === "delete" && templateId) {
    await deleteTemplate(templateId, session.shop);
    return { success: true, message: "Template deleted" };
  }

  return { success: false };
};

function getTemplateIcon(title: string) {
  const lower = (title || "").toLowerCase();
  if (lower.includes("mug") || lower.includes("cup") || lower.includes("drink")) {
    return (
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "8px",
          background: "#fef3c7",
          border: "1px solid #fde68a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          flexShrink: 0,
        }}
      >
        ☕
      </div>
    );
  }
  if (lower.includes("cap") || lower.includes("hat")) {
    return (
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "8px",
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          flexShrink: 0,
        }}
      >
        🧢
      </div>
    );
  }
  if (lower.includes("phone") || lower.includes("case")) {
    return (
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "8px",
          background: "#fdf4ff",
          border: "1px solid #f5d0fe",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          flexShrink: 0,
        }}
      >
        📱
      </div>
    );
  }
  if (lower.includes("canvas") || lower.includes("art") || lower.includes("poster") || lower.includes("print")) {
    return (
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "8px",
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          flexShrink: 0,
        }}
      >
        🖼️
      </div>
    );
  }
  // Default: apparel / t-shirt
  return (
    <div
      style={{
        width: "44px",
        height: "44px",
        borderRadius: "8px",
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "22px",
        flexShrink: 0,
      }}
    >
      👕
    </div>
  );
}

export default function TemplatesIndex() {
  const { templates, billingInfo } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "assigned" | "unassigned">("all");

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("Custom T-Shirt Template");
  const [newWidth, setNewWidth] = useState(1200);
  const [newHeight, setNewHeight] = useState(1200);
  const [newDpi, setNewDpi] = useState(300);

  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  // If a new template was created via action, navigate to its setup page
  if (fetcher.data?.createdId) {
    navigate(`/app/templates/${fetcher.data.createdId}`);
  }

  const handleOpenCreateModal = (preset?: { name: string; w: number; h: number }) => {
    if (!billingInfo.canCreateMore) {
      navigate("/app/pricing");
      return;
    }
    if (preset) {
      setNewTitle(preset.name);
      setNewWidth(preset.w);
      setNewHeight(preset.h);
    } else {
      setNewTitle("Custom T-Shirt Template");
      setNewWidth(1200);
      setNewHeight(1200);
    }
    setNewDpi(300);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetcher.submit(
      {
        intent: "create",
        title: newTitle.trim() || "New Personalization Template",
        canvasWidth: String(newWidth),
        canvasHeight: String(newHeight),
        printDpi: String(newDpi),
      },
      { method: "POST" },
    );
    setShowCreateModal(false);
  };

  const handleOpenRename = (id: string, currentTitle: string) => {
    setRenameTarget({ id, title: currentTitle });
    setRenameTitle(currentTitle);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameTarget && renameTitle.trim() && renameTitle.trim() !== renameTarget.title) {
      fetcher.submit(
        { intent: "rename", templateId: renameTarget.id, title: renameTitle.trim() },
        { method: "POST" },
      );
    }
    setRenameTarget(null);
  };

  const handleDuplicate = (id: string) => {
    fetcher.submit({ intent: "duplicate", templateId: id }, { method: "POST" });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      fetcher.submit({ intent: "delete", templateId: deleteTarget.id }, { method: "POST" });
    }
    setDeleteTarget(null);
  };

  const totalProducts = templates.reduce((acc: number, t: any) => acc + (t.products?.length || 0), 0);
  const assignedCount = templates.filter((t: any) => (t.products?.length || 0) > 0).length;
  const unassignedCount = templates.filter((t: any) => (t.products?.length || 0) === 0).length;

  const filteredTemplates = useMemo(() => {
    return templates.filter((t: any) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchDims = `${t.canvasWidth}x${t.canvasHeight}`.includes(q);
        if (!matchTitle && !matchDims) return false;
      }
      const count = t.products?.length || 0;
      if (filterTab === "assigned" && count === 0) return false;
      if (filterTab === "unassigned" && count > 0) return false;
      return true;
    });
  }, [templates, searchQuery, filterTab]);

  return (
    <s-page heading="Personalization templates">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => handleOpenCreateModal()}
      >
        Create template
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone={fetcher.data?.success ? "success" : "critical"}>{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* Plan Limit Alert Banner */}
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
                Template limit reached ({templates.length} of {billingInfo.templateLimit} templates used on {billingInfo.activePlan} plan)
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
          GRAPHICAL OVERVIEW BANNER (Clean, cohesive, high-contrast Polaris bar)
      ========================================================================= */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "16px 22px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
              border: "1px solid #a7f3d0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              flexShrink: 0,
            }}
          >
            🎨
          </div>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Personalization Templates &amp; Product Assignment
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>
              Design print parameters, assign templates to products, and auto-generate 300 DPI print files upon checkout.
            </p>
          </div>
        </div>

        {/* Polaris Metric Pills */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 14px",
              minWidth: "90px",
            }}
          >
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Active Templates
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: !billingInfo.canCreateMore && billingInfo.templateLimit !== Infinity ? "#dc2626" : "#0f172a", marginTop: "1px" }}>
              {templates.length} / {billingInfo.templateLimit === Infinity ? "∞" : billingInfo.templateLimit}
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 14px",
              minWidth: "90px",
            }}
          >
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Linked Products
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#008060", marginTop: "1px" }}>
              {totalProducts}
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 14px",
              minWidth: "110px",
            }}
          >
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              App Plan
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color:
                    billingInfo.activePlan === "Unlimited"
                      ? "#7e22ce"
                      : billingInfo.activePlan === "Starter"
                        ? "#1d4ed8"
                        : "#0f172a",
                }}
              >
                {billingInfo.activePlan}
              </span>
              <Link
                to="/app/pricing"
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#2563eb",
                  textDecoration: "underline",
                }}
              >
                {billingInfo.activePlan === "Unlimited" ? "View" : "Upgrade"}
              </Link>
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 14px",
            }}
          >
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Print Output
            </div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#2563eb", marginTop: "2px" }}>
              ✓ 300 DPI High-Res
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          POLARIS TEMPLATES RESOURCE TABLE CARD
      ========================================================================= */}
      {templates.length === 0 ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            textAlign: "center",
            padding: "56px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "52px", marginBottom: "12px" }}>🎨</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
            No personalization templates yet
          </h3>
          <p
            style={{
              color: "#64748b",
              maxWidth: "480px",
              margin: "0 auto 24px",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            Create templates with calibrated dimensions, assign them to products in your Shopify catalog, and provide your shoppers with a live customizer experience.
          </p>

          {/* Quick presets */}
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
            {[
              { label: "👕 T-Shirt / Apparel", name: "Custom T-Shirt Template", w: 1200, h: 1200 },
              { label: "☕ Ceramic Mug", name: "Custom Ceramic Mug Template", w: 1000, h: 1000 },
              { label: "📱 Phone Case", name: "Custom Phone Case Template", w: 1000, h: 1800 },
              { label: "🖼️ Canvas Wall Art", name: "Custom Canvas Wall Art Template", w: 1600, h: 1200 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleOpenCreateModal(p)}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                + {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            style={{
              padding: "10px 22px",
              borderRadius: "8px",
              background: "#008060",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create Custom Template
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          {/* Controls Bar: Filter Tabs & Live Search Input */}
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              background: "#ffffff",
            }}
          >
            {/* Tabs */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: filterTab === "all" ? "1px solid #008060" : "1px solid #cbd5e1",
                  background: filterTab === "all" ? "#f0fdf4" : "#ffffff",
                  color: filterTab === "all" ? "#008060" : "#475569",
                  cursor: "pointer",
                }}
              >
                All ({templates.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("assigned")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: filterTab === "assigned" ? "1px solid #008060" : "1px solid #cbd5e1",
                  background: filterTab === "assigned" ? "#f0fdf4" : "#ffffff",
                  color: filterTab === "assigned" ? "#008060" : "#475569",
                  cursor: "pointer",
                }}
              >
                Assigned ({assignedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("unassigned")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: filterTab === "unassigned" ? "1px solid #008060" : "1px solid #cbd5e1",
                  background: filterTab === "unassigned" ? "#f0fdf4" : "#ffffff",
                  color: filterTab === "unassigned" ? "#008060" : "#475569",
                  cursor: "pointer",
                }}
              >
                Unassigned ({unassignedCount})
              </button>
            </div>

            {/* Search Input */}
            <div style={{ position: "relative", minWidth: "260px" }}>
              <span
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "13px",
                  color: "#94a3b8",
                  pointerEvents: "none",
                }}
              >
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
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
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "#94a3b8",
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {filteredTemplates.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b" }}>
              <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
                No templates found matching <strong>&ldquo;{searchQuery}&rdquo;</strong>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterTab("all");
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#0f172a",
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                      Template
                    </th>
                    <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                      Print Dimensions
                    </th>
                    <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                      Capabilities
                    </th>
                    <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                      Assigned Products
                    </th>
                    <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                      Updated
                    </th>
                    <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b", textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((tpl: any) => {
                    const isAssigned = (tpl.products?.length || 0) > 0;
                    return (
                      <tr key={tpl.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        {/* Template Details & Thumbnail */}
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            {getTemplateIcon(tpl.title)}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Link
                                  to={`/app/templates/${tpl.id}`}
                                  style={{
                                    color: "#0f172a",
                                    textDecoration: "none",
                                    fontSize: "14px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {tpl.title}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRename(tpl.id, tpl.title)}
                                  title="Rename template"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: "2px",
                                    fontSize: "12px",
                                    color: "#94a3b8",
                                  }}
                                >
                                  ✏️
                                </button>
                              </div>
                              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                ID: {tpl.id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Print Dimensions */}
                        <td style={{ padding: "14px 18px", color: "#64748b", fontSize: "12px" }}>
                          <span
                            style={{
                              background: "#f1f5f9",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontWeight: 600,
                              color: "#334155",
                              display: "inline-block",
                            }}
                          >
                            {tpl.canvasWidth} × {tpl.canvasHeight} px ({tpl.printDpi} DPI)
                          </span>
                        </td>

                        {/* Capabilities */}
                        <td style={{ padding: "14px 18px", fontSize: "12px" }}>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <span
                              style={{
                                background: "#eff6ff",
                                border: "1px solid #bfdbfe",
                                color: "#1d4ed8",
                                padding: "2px 7px",
                                borderRadius: "10px",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              ✏️ Text
                            </span>
                            <span
                              style={{
                                background: "#fdf4ff",
                                border: "1px solid #f5d0fe",
                                color: "#9333ea",
                                padding: "2px 7px",
                                borderRadius: "10px",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              📷 Photo
                            </span>
                          </div>
                        </td>

                        {/* Assigned Products Status */}
                        <td style={{ padding: "14px 18px", fontSize: "12px" }}>
                          {isAssigned ? (
                            <Link
                              to={`/app/templates/${tpl.id}`}
                              style={{
                                textDecoration: "none",
                                background: "#ecfdf5",
                                border: "1px solid #a7f3d0",
                                color: "#065f46",
                                padding: "4px 10px",
                                borderRadius: "14px",
                                fontWeight: 700,
                                fontSize: "12px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                              {tpl.products.length} product{tpl.products.length > 1 ? "s" : ""} linked
                            </Link>
                          ) : (
                            <span
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                color: "#94a3b8",
                                padding: "4px 10px",
                                borderRadius: "14px",
                                fontSize: "12px",
                                fontWeight: 500,
                              }}
                            >
                              ○ No products linked
                            </span>
                          )}
                        </td>

                        {/* Updated Date */}
                        <td style={{ padding: "14px 18px", color: "#64748b", fontSize: "12px" }}>
                          {new Date(tpl.updatedAt).toLocaleDateString()}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            <Link
                              to={`/app/templates/${tpl.id}`}
                              style={{
                                padding: "7px 14px",
                                borderRadius: "6px",
                                background: "#008060",
                                color: "#fff",
                                textDecoration: "none",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              Assign &amp; Setup &rarr;
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(tpl.id)}
                              title="Duplicate template"
                              style={{
                                padding: "6px 10px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                cursor: "pointer",
                                fontSize: "12px",
                                color: "#475569",
                                fontWeight: 600,
                              }}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ id: tpl.id, title: tpl.title })}
                              title="Delete template"
                              style={{
                                padding: "6px 10px",
                                borderRadius: "6px",
                                border: "1px solid #fecaca",
                                background: "#fff5f5",
                                cursor: "pointer",
                                fontSize: "12px",
                                color: "#dc2626",
                                fontWeight: 600,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CREATE TEMPLATE MODAL */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleCreateSubmit}>
              <div
                style={{
                  padding: "18px 22px",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    Create Personalization Template
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                    Choose a product preset or set custom print dimensions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontSize: "20px",
                    cursor: "pointer",
                    color: "#94a3b8",
                  }}
                >
                  &times;
                </button>
              </div>

              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Presets */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>
                    Quick Presets
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { label: "👕 T-Shirt / Apparel", name: "Custom T-Shirt Template", w: 1200, h: 1200 },
                      { label: "☕ Mug / Drinkware", name: "Personalized Mug Template", w: 1000, h: 1000 },
                      { label: "📱 Phone Case", name: "Custom Phone Case Template", w: 1000, h: 1800 },
                      { label: "🖼️ Canvas Wall Art", name: "Canvas Wall Art Template", w: 1600, h: 1200 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setNewTitle(preset.name);
                          setNewWidth(preset.w);
                          setNewHeight(preset.h);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: newTitle === preset.name ? "1px solid #008060" : "1px solid #cbd5e1",
                          background: newTitle === preset.name ? "#f0fdf4" : "#f8fafc",
                          color: newTitle === preset.name ? "#008060" : "#334155",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>
                    Template Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g., Custom Unisex T-Shirt Template"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Canvas Width (px)
                    </label>
                    <input
                      type="number"
                      value={newWidth}
                      onChange={(e) => setNewWidth(parseInt(e.target.value) || 1200)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Canvas Height (px)
                    </label>
                    <input
                      type="number"
                      value={newHeight}
                      onChange={(e) => setNewHeight(parseInt(e.target.value) || 1200)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "14px 22px",
                  borderTop: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 18px",
                    borderRadius: "6px",
                    background: "#008060",
                    color: "#fff",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Create Template &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {renameTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setRenameTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleRenameSubmit}>
              <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Rename Template
                </h3>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                  Template Name
                </label>
                <input
                  type="text"
                  required
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
              <div
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "6px",
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "7px 16px",
                    borderRadius: "6px",
                    background: "#008060",
                    color: "#fff",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <span style={{ fontSize: "28px" }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Delete Personalization Template?
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>&quot;{deleteTarget.title}&quot;</strong>? Any products currently linked to this template will no longer display the customizer on your storefront.
              </p>
            </div>
            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Yes, Delete Template
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}
