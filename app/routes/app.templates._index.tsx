import { useState } from "react";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const templates = await listTemplates(session.shop);
  return { templates };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const templateId = formData.get("templateId") as string;

  if (intent === "create") {
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
    await duplicateTemplate(templateId, session.shop);
    return { success: true, message: "Template duplicated successfully" };
  }

  if (intent === "delete" && templateId) {
    await deleteTemplate(templateId, session.shop);
    return { success: true, message: "Template deleted" };
  }

  return { success: false };
};

export default function TemplatesIndex() {
  const { templates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  // Modal States (replacing browser native prompt and confirm)
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
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 16px",
            borderRadius: "8px",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>✓</span>
          <span>{fetcher.data.message}</span>
        </div>
      )}

      {/* Overview Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Active Templates
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
              {templates.length}
            </div>
          </div>
          <span style={{ fontSize: "22px" }}>🎨</span>
        </div>

        <div
          style={{
            background: "#fff",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Linked Products
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, margin: "2px 0 0", color: "#008060" }}>
              {totalProducts}
            </div>
          </div>
          <span style={{ fontSize: "22px" }}>🛍️</span>
        </div>

        <div
          style={{
            background: "#fff",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Print Resolution
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
              300 DPI
            </div>
          </div>
          <span style={{ fontSize: "22px" }}>🖨️</span>
        </div>
      </div>

      {templates.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            textAlign: "center",
            padding: "64px 20px",
          }}
        >
          <div style={{ fontSize: "52px", marginBottom: "14px" }}>🎨</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
            No Templates Created Yet
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
            Create your first personalization template to assign products from your store, configure text &amp; photo options, and produce 300 DPI print-ready files automatically on checkout.
          </p>
          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              background: "#008060",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Create Your First Template
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
              All Templates ({templates.length})
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreateModal()}
              style={{
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + New Template
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    Template Name
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    Print Specs
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    Personalization
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    Assigned Products
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    Last Updated
                  </th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b", textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 18px", fontWeight: 700 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>🎨</span>
                        <Link
                          to={`/app/templates/${tpl.id}`}
                          style={{ color: "#008060", textDecoration: "none", fontSize: "14px" }}
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
                            padding: "2px 4px",
                            fontSize: "12px",
                            color: "#94a3b8",
                          }}
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px", color: "#64748b", fontSize: "12px" }}>
                      <span style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", fontWeight: 600 }}>
                        {tpl.canvasWidth} × {tpl.canvasHeight} px ({tpl.printDpi} DPI)
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "12px" }}>
                      <span
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        ✏️ Text + 📷 Photo
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "12px" }}>
                      <span
                        style={{
                          color: (tpl.products?.length || 0) > 0 ? "#059669" : "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {(tpl.products?.length || 0) > 0 ? "✓ " : "○ "}
                        {tpl.products?.length || 0} products
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", color: "#64748b", fontSize: "12px" }}>
                      {new Date(tpl.updatedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        <Link
                          to={`/app/templates/${tpl.id}`}
                          style={{
                            padding: "6px 12px",
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
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
