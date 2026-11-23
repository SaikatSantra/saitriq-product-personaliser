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
    const title = (formData.get("title") as string) || "New Personalization Template";
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

    return { success: true, createdId: newTemplate.id };
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

  // If a new template was created via action, navigate to its studio editor
  if (fetcher.data?.createdId) {
    navigate(`/app/templates/${fetcher.data.createdId}`);
  }

  const handleCreateNew = () => {
    const enteredName = prompt("Enter a name for the new template:", "New Customizer Template");
    if (enteredName === null) return;
    fetcher.submit(
      { intent: "create", title: enteredName.trim() || "New Customizer Template" },
      { method: "POST" },
    );
  };

  const handleRename = (id: string, currentTitle: string) => {
    const newName = prompt("Enter new template name:", currentTitle);
    if (newName && newName.trim() && newName.trim() !== currentTitle) {
      fetcher.submit(
        { intent: "rename", templateId: id, title: newName.trim() },
        { method: "POST" },
      );
    }
  };

  const handleDuplicate = (id: string) => {
    fetcher.submit({ intent: "duplicate", templateId: id }, { method: "POST" });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this personalization template?")) {
      fetcher.submit({ intent: "delete", templateId: id }, { method: "POST" });
    }
  };

  const totalProducts = templates.reduce((acc: number, t: any) => acc + (t.products?.length || 0), 0);

  return (
    <s-page heading="Personalization Templates">
      <div slot="primary-action" style={{ display: "flex", gap: "8px" }}>
        <s-button variant="primary" onClick={handleCreateNew}>
          + Create Template
        </s-button>
      </div>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* Overview Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Active Templates</div>
            <div style={{ fontSize: "28px", fontWeight: 800, margin: "4px 0 0", color: "#0f172a" }}>{templates.length}</div>
          </div>
          <span style={{ fontSize: "28px" }}>🎨</span>
        </div>

        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Linked Products</div>
            <div style={{ fontSize: "28px", fontWeight: 800, margin: "4px 0 0", color: "#0f172a" }}>{totalProducts}</div>
          </div>
          <span style={{ fontSize: "28px" }}>🛍️</span>
        </div>

        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Print Resolution</div>
            <div style={{ fontSize: "28px", fontWeight: 800, margin: "4px 0 0", color: "#0f172a" }}>300 DPI</div>
          </div>
          <span style={{ fontSize: "28px" }}>🖨️</span>
        </div>
      </div>

      {templates.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", textAlign: "center", padding: "64px 20px" }}>
          <div style={{ fontSize: "52px", marginBottom: "14px" }}>🎨</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
            No Templates Created Yet
          </h3>
          <p style={{ color: "#64748b", maxWidth: "480px", margin: "0 auto 24px", fontSize: "13px", lineHeight: 1.5 }}>
            Create your first canvas template to assign products, configure text &amp; photo print areas, and generate 300 DPI print-ready production files automatically upon checkout.
          </p>
          <s-button variant="primary" onClick={handleCreateNew}>
            + Create Your First Template
          </s-button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>All Templates ({templates.length})</h3>
            <button
              type="button"
              onClick={handleCreateNew}
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
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Template Name</th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Print Specs</th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Personalization</th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Assigned Products</th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Last Updated</th>
                  <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: 600, color: "#64748b", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => {
                  let layerCount = 0;
                  try {
                    const parsed = JSON.parse(tpl.layersJson || "[]");
                    if (parsed.sides) {
                      layerCount = (parsed.sides.front?.objects?.length || 0) + (parsed.sides.back?.objects?.length || 0);
                    } else {
                      layerCount = Array.isArray(parsed) ? parsed.length : (parsed.objects?.length || 0);
                    }
                  } catch {
                    layerCount = 0;
                  }

                  return (
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
                            onClick={() => handleRename(tpl.id, tpl.title)}
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
                        <span style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600 }}>
                          ✏️ Text + 📷 Photo
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: "12px" }}>
                        <span style={{ color: (tpl.products?.length || 0) > 0 ? "#059669" : "#94a3b8", fontWeight: 600 }}>
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
                            onClick={() => handleDelete(tpl.id)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </s-page>
  );
}
