import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, Link } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listTemplates,
  createTemplate,
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

  if (intent === "duplicate" && templateId) {
    await duplicateTemplate(templateId, session.shop);
    return { success: true };
  }

  if (intent === "delete" && templateId) {
    await deleteTemplate(templateId, session.shop);
    return { success: true };
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
    fetcher.submit(
      { intent: "create", title: "New Customizer Template" },
      { method: "POST" },
    );
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
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleCreateNew}
      >
        Create Template
      </s-button>

      {/* Overview Stats */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
          <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <span style={{ fontSize: "13px", color: "#6d7175", fontWeight: 500 }}>Active Templates</span>
            <h2 style={{ fontSize: "24px", margin: "4px 0 0", color: "#202223" }}>{templates.length}</h2>
          </div>
          <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <span style={{ fontSize: "13px", color: "#6d7175", fontWeight: 500 }}>Customized Products</span>
            <h2 style={{ fontSize: "24px", margin: "4px 0 0", color: "#202223" }}>{totalProducts}</h2>
          </div>
          <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <span style={{ fontSize: "13px", color: "#6d7175", fontWeight: 500 }}>Default Print Quality</span>
            <h2 style={{ fontSize: "24px", margin: "4px 0 0", color: "#202223" }}>300 DPI</h2>
          </div>
        </div>
      </s-section>

      {templates.length === 0 ? (
        <s-section>
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎨</div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px" }}>
              No templates created yet
            </h3>
            <p style={{ color: "#6d7175", maxWidth: "460px", margin: "0 auto 24px", fontSize: "14px" }}>
              Create your first canvas template to let customers personalize products with custom text, images, cliparts, and live 300 DPI print files.
            </p>
            <s-button variant="primary" onClick={handleCreateNew}>
              Create Your First Template
            </s-button>
          </div>
        </s-section>
      ) : (
        <s-section heading="All Templates">
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e1e3e5", background: "#fafbfb" }}>
                  <th style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6d7175" }}>Template Name</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6d7175" }}>Print Dimensions</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6d7175" }}>Layers</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6d7175" }}>Products Linked</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6d7175" }}>Last Updated</th>
                  <th style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6d7175", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => {
                  let layerCount = 0;
                  try {
                    const parsed = JSON.parse(tpl.layersJson || "[]");
                    layerCount = Array.isArray(parsed) ? parsed.length : (parsed.objects?.length || 0);
                  } catch {
                    layerCount = 0;
                  }

                  return (
                    <tr key={tpl.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        <Link
                          to={`/app/templates/${tpl.id}`}
                          style={{ color: "#005bd3", textDecoration: "none" }}
                        >
                          {tpl.title}
                        </Link>
                      </td>
                      <td style={{ padding: "16px", color: "#6d7175", fontSize: "13px" }}>
                        {tpl.canvasWidth} × {tpl.canvasHeight} px ({tpl.printDpi} DPI)
                      </td>
                      <td style={{ padding: "16px", fontSize: "13px" }}>
                        <span style={{ background: "#f0f2f5", padding: "4px 8px", borderRadius: "12px", fontSize: "12px" }}>
                          {layerCount} layers
                        </span>
                      </td>
                      <td style={{ padding: "16px", fontSize: "13px" }}>
                        <span style={{ color: ttplHasProducts(tpl) ? "#108043" : "#6d7175" }}>
                          {tpl.products?.length || 0} products
                        </span>
                      </td>
                      <td style={{ padding: "16px", color: "#6d7175", fontSize: "13px" }}>
                        {new Date(tpl.updatedAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                          <Link
                            to={`/app/templates/${tpl.id}`}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #c9cccf",
                              background: "#fff",
                              color: "#202223",
                              fontSize: "13px",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            Edit Studio
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(tpl.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #c9cccf",
                              background: "#fff",
                              color: "#202223",
                              fontSize: "13px",
                              cursor: "pointer",
                            }}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tpl.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #fed3d1",
                              background: "#fff0f0",
                              color: "#d72c0d",
                              fontSize: "13px",
                              cursor: "pointer",
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
        </s-section>
      )}
    </s-page>
  );
}

function ttplHasProducts(tpl: any) {
  return (tpl.products?.length || 0) > 0;
}
