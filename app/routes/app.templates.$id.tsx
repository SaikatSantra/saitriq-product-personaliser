import { useState, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getTemplate,
  updateTemplate,
  assignProductsToTemplate,
} from "../models/template.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const templateId = params.id as string;

  const template = await getTemplate(templateId, session.shop);
  if (!template) {
    throw new Response("Template not found", { status: 404 });
  }

  // Fetch shop products with images, variants, and handle for assignment & live preview
  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 60) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
              }
              images(first: 5) {
                edges {
                  node {
                    url
                  }
                }
              }
              variants(first: 20) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }`,
  );
  const productsJson = await response.json();
  const shopProducts = productsJson.data?.products?.edges?.map((e: any) => ({
    ...e.node,
    images: e.node.images?.edges?.map((imgEdge: any) => imgEdge.node) || [],
    variants: e.node.variants?.edges?.map((vEdge: any) => vEdge.node) || [],
  })) || [];

  return { template, shopProducts, shop: session.shop };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const templateId = params.id as string;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_template") {
    const title = (formData.get("title") as string)?.trim() || "Untitled Template";
    const canvasWidth = parseInt(formData.get("canvasWidth") as string) || 1200;
    const canvasHeight = parseInt(formData.get("canvasHeight") as string) || 1200;
    const printDpi = parseInt(formData.get("printDpi") as string) || 300;
    const layersJson = formData.get("layersJson") as string;
    const productIdsRaw = formData.get("assignedProductIds") as string;

    let assignedProductIds: string[] = [];
    try {
      assignedProductIds = JSON.parse(productIdsRaw || "[]");
    } catch {
      assignedProductIds = [];
    }

    await updateTemplate(templateId, session.shop, {
      title,
      canvasWidth,
      canvasHeight,
      printDpi,
      layersJson,
    });

    await assignProductsToTemplate(templateId, session.shop, assignedProductIds);

    return { success: true, message: "Template and product assignments saved successfully!" };
  }

  if (intent === "unassign_product") {
    const remainingRaw = formData.get("remainingProductIds") as string;
    let remainingProductIds: string[] = [];
    try {
      remainingProductIds = JSON.parse(remainingRaw || "[]");
    } catch {
      remainingProductIds = [];
    }

    await assignProductsToTemplate(templateId, session.shop, remainingProductIds);
    return { success: true, message: "Product unassigned from template successfully!" };
  }

  if (intent === "create_sample_products") {
    const { admin } = await authenticate.admin(request);
    const sampleProducts = [
      { title: "Custom Classic Unisex T-Shirt" },
      { title: "Personalized Ceramic Coffee Mug" },
      { title: "Custom Printed Canvas Wall Art" },
    ];

    const createdIds: string[] = [];

    for (const p of sampleProducts) {
      try {
        const res = await admin.graphql(
          `#graphql
          mutation createSampleProduct($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product {
                id
                title
              }
              userErrors {
                field
                message
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
        const json = await res.json();
        if (json.data?.productCreate?.product?.id) {
          createdIds.push(json.data.productCreate.product.id);
        }
      } catch (err) {
        console.error("Error creating sample product", err);
      }
    }

    if (createdIds.length > 0) {
      await assignProductsToTemplate(templateId, session.shop, createdIds);
    }

    return { success: true, message: "Sample customizable products created & assigned!" };
  }

  return { success: false };
};

export default function TemplateSetup() {
  const { template, shopProducts, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  // Parse existing template configuration from layersJson
  const initialConfig = useMemo(() => {
    let parsed: any = {};
    try {
      parsed = JSON.parse(template.layersJson || "{}");
    } catch {
      parsed = {};
    }

    const s = parsed.settings || {};
    return {
      enableText: s.enableText !== undefined ? Boolean(s.enableText) : true,
      defaultText: s.defaultText || "Your Custom Text",
      defaultFont: s.defaultFont || "Roboto",
      defaultColor: s.defaultColor || "#111111",
      maxCharacters: s.maxCharacters || 30,
      enableUpload: s.enableUpload !== undefined ? Boolean(s.enableUpload) : true,
      enableFront: s.enableFront !== undefined ? Boolean(s.enableFront) : true,
      enableBack: s.enableBack !== undefined ? Boolean(s.enableBack) : true,
      customFrontMockup: s.customFrontMockup || "",
      customBackMockup: s.customBackMockup || "",
    };
  }, [template.layersJson]);

  // Form states
  const [title, setTitle] = useState(template.title);
  const [canvasWidth, setCanvasWidth] = useState(template.canvasWidth || 1200);
  const [canvasHeight, setCanvasHeight] = useState(template.canvasHeight || 1200);
  const [printDpi, setPrintDpi] = useState(template.printDpi || 300);

  // Personalization settings
  const [enableText, setEnableText] = useState(initialConfig.enableText);
  const [defaultText, setDefaultText] = useState(initialConfig.defaultText);
  const [defaultFont, setDefaultFont] = useState(initialConfig.defaultFont);
  const [defaultColor, setDefaultColor] = useState(initialConfig.defaultColor);
  const [maxCharacters, setMaxCharacters] = useState(initialConfig.maxCharacters);

  const [enableUpload, setEnableUpload] = useState(initialConfig.enableUpload);
  const [enableFront, setEnableFront] = useState(initialConfig.enableFront);
  const [enableBack, setEnableBack] = useState(initialConfig.enableBack);
  const [customFrontMockup, setCustomFrontMockup] = useState(initialConfig.customFrontMockup);
  const [customBackMockup, setCustomBackMockup] = useState(initialConfig.customBackMockup);

  // Assigned product IDs
  const [assignedProductIds, setAssignedProductIds] = useState<string[]>(
    template.products.map((p: any) => p.shopifyProductId),
  );

  // Product Selection Modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(assignedProductIds);

  // Filtered assigned products list
  const assignedProductsList = useMemo(() => {
    return shopProducts.filter((p: any) => assignedProductIds.includes(p.id));
  }, [shopProducts, assignedProductIds]);

  // Filtered modal products
  const modalFilteredProducts = useMemo(() => {
    if (!productSearch.trim()) return shopProducts;
    const q = productSearch.toLowerCase().trim();
    return shopProducts.filter((p: any) => p.title.toLowerCase().includes(q));
  }, [shopProducts, productSearch]);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

  // Handle Save
  const handleSave = () => {
    // Generate clean template layers structure for storefront rendering
    const layersPayload = {
      settings: {
        enableText,
        defaultText,
        defaultFont,
        defaultColor,
        maxCharacters,
        enableUpload,
        enableFront,
        enableBack,
        customFrontMockup,
        customBackMockup,
      },
      sides: {
        front: {
          objects: [
            ...(customFrontMockup
              ? [
                  {
                    type: "Image",
                    src: customFrontMockup,
                    name: "Mockup Underlay",
                    customType: "background_mockup",
                  },
                ]
              : []),
            ...(enableText
              ? [
                  {
                    type: "IText",
                    text: defaultText || "Your Custom Text",
                    fontSize: 48,
                    fontFamily: defaultFont || "Roboto",
                    fill: defaultColor || "#111111",
                    left: Math.round(canvasWidth / 2),
                    top: Math.round(canvasHeight * 0.4),
                    originX: "center",
                    originY: "center",
                    optionLabel: "Front Custom Text",
                    maxCharacters: maxCharacters || 30,
                    isCustomerEditable: true,
                  },
                ]
              : []),
            ...(enableUpload
              ? [
                  {
                    type: "Rect",
                    customType: "image_upload",
                    name: "Photo Upload Zone",
                    optionLabel: "Upload Photo / Logo",
                    left: Math.round(canvasWidth / 2),
                    top: Math.round(canvasHeight * 0.65),
                    originX: "center",
                    originY: "center",
                    width: Math.round(canvasWidth * 0.35),
                    height: Math.round(canvasHeight * 0.25),
                    fill: "rgba(0, 128, 96, 0.08)",
                    stroke: "#008060",
                    strokeWidth: 2,
                    strokeDashArray: [6, 6],
                    isCustomerEditable: true,
                  },
                ]
              : []),
          ],
        },
        back: {
          objects: [
            ...(customBackMockup
              ? [
                  {
                    type: "Image",
                    src: customBackMockup,
                    name: "Mockup Underlay",
                    customType: "background_mockup",
                  },
                ]
              : []),
            ...(enableBack && enableText
              ? [
                  {
                    type: "IText",
                    text: defaultText || "Back Custom Text",
                    fontSize: 48,
                    fontFamily: defaultFont || "Roboto",
                    fill: defaultColor || "#111111",
                    left: Math.round(canvasWidth / 2),
                    top: Math.round(canvasHeight * 0.45),
                    originX: "center",
                    originY: "center",
                    optionLabel: "Back Custom Text",
                    maxCharacters: maxCharacters || 30,
                    isCustomerEditable: true,
                  },
                ]
              : []),
          ],
        },
      },
    };

    fetcher.submit(
      {
        intent: "save_template",
        title: title.trim() || "Personalization Template",
        canvasWidth: String(canvasWidth),
        canvasHeight: String(canvasHeight),
        printDpi: String(printDpi),
        layersJson: JSON.stringify(layersPayload),
        assignedProductIds: JSON.stringify(assignedProductIds),
      },
      { method: "POST" },
    );
  };

  const handleRemoveProduct = (productId: string) => {
    const updated = assignedProductIds.filter((id) => id !== productId);
    setAssignedProductIds(updated);
    fetcher.submit(
      {
        intent: "unassign_product",
        remainingProductIds: JSON.stringify(updated),
      },
      { method: "POST" },
    );
  };

  const handleOpenProductModal = () => {
    setTempSelectedIds([...assignedProductIds]);
    setProductSearch("");
    setShowProductModal(true);
  };

  const handleToggleProductInModal = (productId: string) => {
    setTempSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
  };

  const handleSelectAllModal = () => {
    const allIds = shopProducts.map((p: any) => p.id);
    setTempSelectedIds(allIds);
  };

  const handleDeselectAllModal = () => {
    setTempSelectedIds([]);
  };

  const handleConfirmProductModal = () => {
    setAssignedProductIds([...tempSelectedIds]);
    setShowProductModal(false);
    fetcher.submit(
      {
        intent: "unassign_product",
        remainingProductIds: JSON.stringify(tempSelectedIds),
      },
      { method: "POST" },
    );
  };

  const cleanShopDomain = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();

  return (
    <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "20px 24px 60px" }}>
      {/* Top Navigation & Action Header */}
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
            to="/app/templates"
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
            ← Back to Templates
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: assignedProductIds.length > 0 ? "#10b981" : "#f59e0b",
              }}
            />
            <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
              {assignedProductIds.length > 0
                ? `Active on ${assignedProductIds.length} Product${assignedProductIds.length > 1 ? "s" : ""}`
                : "No products linked yet"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {assignedProductsList.length > 0 && assignedProductsList[0].handle && (
            <a
              href={`https://${cleanShopDomain}/products/${assignedProductsList[0].handle}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "#f1f5f9",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              👁️ View Live on Store ↗
            </a>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 20px",
              borderRadius: "8px",
              background: "#008060",
              color: "#ffffff",
              border: "none",
              fontSize: "14px",
              fontWeight: 700,
              cursor: isSaving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 5px rgba(0, 128, 96, 0.25)",
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? "Saving Changes..." : "💾 Save Template"}
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {fetcher.data?.message && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 18px",
            borderRadius: "8px",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: "14px",
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

      {/* Main Grid: 2 Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN: Template Identity & Product Assignment */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Template Details Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#64748b",
                  marginBottom: "6px",
                  letterSpacing: "0.5px",
                }}
              >
                Template Name
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Custom Unisex T-Shirt Template"
                style={{
                  width: "100%",
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#0f172a",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
              <span
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#475569",
                }}
              >
                📐 Canvas: {canvasWidth} × {canvasHeight} px
              </span>
              <span
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#475569",
                }}
              >
                🖨️ Resolution: {printDpi} DPI Print-Ready
              </span>
              <span
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#1d4ed8",
                }}
              >
                🏷️ ID: {template.id.slice(0, 8)}...
              </span>
            </div>
          </div>

          {/* Assigned Products Card (THE MAIN FOCUS) */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    Assigned Products
                  </h3>
                  <span
                    style={{
                      background: assignedProductIds.length > 0 ? "#008060" : "#94a3b8",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                    }}
                  >
                    {assignedProductIds.length}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                  Products linked to this template will show the live personalizer on your storefront.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenProductModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "#008060",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Assign Products
              </button>
            </div>

            {/* List of Assigned Products */}
            {assignedProductsList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 16px",
                  background: "#f8fafc",
                  borderRadius: "10px",
                  border: "1px dashed #cbd5e1",
                }}
              >
                <div style={{ fontSize: "40px", marginBottom: "8px" }}>🛍️</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                  No Products Assigned Yet
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#64748b",
                    maxWidth: "380px",
                    margin: "0 auto 16px",
                    lineHeight: 1.4,
                  }}
                >
                  Assign one or more products from your Shopify store so customers can customize them live on the product page.
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={handleOpenProductModal}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      background: "#008060",
                      color: "#fff",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + Assign Existing Products
                  </button>
                  {shopProducts.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        fetcher.submit({ intent: "create_sample_products" }, { method: "POST" })
                      }
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
                      Create Sample Products
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {assignedProductsList.map((product: any) => {
                  const featImg = product.featuredImage?.url || product.images?.[0]?.url || "";
                  const variantCount = product.variants?.length || 0;

                  return (
                    <div
                      key={product.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "6px",
                            border: "1px solid #e2e8f0",
                            background: "#f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          {featImg ? (
                            <img
                              src={featImg}
                              alt={product.title}
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                          ) : (
                            <span style={{ fontSize: "20px" }}>👕</span>
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 700,
                              color: "#0f172a",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {product.title}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              fontSize: "12px",
                              color: "#64748b",
                              marginTop: "2px",
                            }}
                          >
                            <span>
                              {variantCount} variant{variantCount !== 1 ? "s" : ""}
                            </span>
                            <span>•</span>
                            <span style={{ color: "#008060", fontWeight: 600 }}>Active</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        {product.handle && (
                          <a
                            href={`https://${cleanShopDomain}/products/${product.handle}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Preview on online store"
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              background: "#f1f5f9",
                              color: "#334155",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                              fontWeight: 600,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            👁️ Test
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(product.id)}
                          title="Unassign this product"
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            background: "#fff",
                            color: "#ef4444",
                            border: "1px solid #fecaca",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* How It Works Diagram Card */}
          <div
            style={{
              background: "#f8fafc",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
              💡 How Frontend Personalization Works
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "12px", color: "#475569" }}>
              <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#008060" }}>1. Live Product Sync</strong>
                <p style={{ margin: "4px 0 0", lineHeight: 1.4 }}>
                  Assigned products automatically display the &quot;🎨 Customize This Product&quot; button. Variant colors and gallery photos sync seamlessly.
                </p>
              </div>
              <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#008060" }}>2. Frontend Drag &amp; Edit</strong>
                <p style={{ margin: "4px 0 0", lineHeight: 1.4 }}>
                  Shoppers edit text, choose fonts, upload photos, and drag/scale directly on the live storefront modal canvas.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Personalization Options & Rules */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Personalization Features Configuration */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Personalization Features
            </h3>

            {/* Custom Text Option */}
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: enableText ? "#f8fafc" : "#fff",
                marginBottom: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                  <input
                    type="checkbox"
                    checked={enableText}
                    onChange={(e) => setEnableText(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "#008060" }}
                  />
                  <span>✏️ Enable Custom Text</span>
                </label>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: enableText ? "#008060" : "#64748b",
                    background: enableText ? "#ecfdf5" : "#f1f5f9",
                    padding: "2px 8px",
                    borderRadius: "10px",
                  }}
                >
                  {enableText ? "Enabled" : "Disabled"}
                </span>
              </div>

              {enableText && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Default Text Placeholder
                    </label>
                    <input
                      type="text"
                      value={defaultText}
                      onChange={(e) => setDefaultText(e.target.value)}
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

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                        Default Font
                      </label>
                      <select
                        value={defaultFont}
                        onChange={(e) => setDefaultFont(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                          background: "#fff",
                        }}
                      >
                        <option value="Roboto">Roboto</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Pacifico">Pacifico</option>
                        <option value="Oswald">Oswald</option>
                        <option value="Bebas Neue">Bebas Neue</option>
                        <option value="Courier New">Courier New</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                        Max Characters
                      </label>
                      <input
                        type="number"
                        value={maxCharacters}
                        onChange={(e) => setMaxCharacters(parseInt(e.target.value) || 30)}
                        min={5}
                        max={100}
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

                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      Default Ink Color
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="color"
                        value={defaultColor}
                        onChange={(e) => setDefaultColor(e.target.value)}
                        style={{ width: "36px", height: "32px", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      />
                      <input
                        type="text"
                        value={defaultColor}
                        onChange={(e) => setDefaultColor(e.target.value)}
                        style={{
                          width: "100px",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Photo Upload Option */}
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: enableUpload ? "#f8fafc" : "#fff",
                marginBottom: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                  <input
                    type="checkbox"
                    checked={enableUpload}
                    onChange={(e) => setEnableUpload(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "#008060" }}
                  />
                  <span>📷 Customer Photo / Logo Upload</span>
                </label>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: enableUpload ? "#008060" : "#64748b",
                    background: enableUpload ? "#ecfdf5" : "#f1f5f9",
                    padding: "2px 8px",
                    borderRadius: "10px",
                  }}
                >
                  {enableUpload ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", paddingLeft: "24px" }}>
                Allows customers to upload high-res PNG, JPG, or WEBP photos/logos and drag or scale them on the product.
              </p>
            </div>

            {/* Sides & Views Supported */}
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "8px" }}>
                🔄 Sides Personalization
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "6px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={enableFront}
                    onChange={(e) => setEnableFront(e.target.checked)}
                    style={{ accentColor: "#008060" }}
                  />
                  <span>👕 Front Side</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={enableBack}
                    onChange={(e) => setEnableBack(e.target.checked)}
                    style={{ accentColor: "#008060" }}
                  />
                  <span>🔄 Back Side</span>
                </label>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#64748b", lineHeight: 1.4 }}>
                Product images from your Shopify catalog will be automatically detected and used as Front and Back mockups.
              </p>
            </div>
          </div>

          {/* Production Print Settings */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              🖨️ Production &amp; Print Output
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#64748b" }}>
              High-resolution print files generated at checkout are rendered to these exact specifications.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                  Width (px)
                </label>
                <input
                  type="number"
                  value={canvasWidth}
                  onChange={(e) => setCanvasWidth(parseInt(e.target.value) || 1200)}
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
                  Height (px)
                </label>
                <input
                  type="number"
                  value={canvasHeight}
                  onChange={(e) => setCanvasHeight(parseInt(e.target.value) || 1200)}
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

            <div style={{ marginTop: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                Target Print DPI
              </label>
              <select
                value={printDpi}
                onChange={(e) => setPrintDpi(parseInt(e.target.value) || 300)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  background: "#fff",
                }}
              >
                <option value={300}>300 DPI (Commercial Print Ready - Recommended)</option>
                <option value={150}>150 DPI (Standard Web / Draft)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Product Selection Modal */}
      {showProductModal && (
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
          onClick={() => setShowProductModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "580px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  Assign Products to Template
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Selected products will use this template on your storefront.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
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

            {/* Modal Search & Quick Actions */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
              <input
                type="text"
                placeholder="🔍 Search products by name..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                <span>{tempSelectedIds.length} product(s) selected</span>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={handleSelectAllModal}
                    style={{ border: "none", background: "none", color: "#008060", cursor: "pointer", fontWeight: 600 }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllModal}
                    style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            {/* Products List Body */}
            <div style={{ overflowY: "auto", padding: "10px 20px", flex: 1, maxHeight: "380px" }}>
              {modalFilteredProducts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 10px", color: "#94a3b8", fontSize: "13px" }}>
                  No products matched your search.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {modalFilteredProducts.map((p: any) => {
                    const isSelected = tempSelectedIds.includes(p.id);
                    const featImg = p.featuredImage?.url || p.images?.[0]?.url || "";
                    const variantCount = p.variants?.length || 0;

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleToggleProductInModal(p.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: `1px solid ${isSelected ? "#008060" : "#e2e8f0"}`,
                          background: isSelected ? "#f0fdf4" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.1s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent onClick
                            style={{ width: "16px", height: "16px", accentColor: "#008060", cursor: "pointer" }}
                          />
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "4px",
                              background: "#f1f5f9",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                              flexShrink: 0,
                            }}
                          >
                            {featImg ? (
                              <img src={featImg} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            ) : (
                              <span style={{ fontSize: "16px" }}>👕</span>
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "#0f172a",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {p.title}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
                              {variantCount} variant{variantCount !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <span style={{ color: "#008060", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                            ✓ Selected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
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
                onClick={handleConfirmProductModal}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  background: "#008060",
                  color: "#fff",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Apply Selection ({tempSelectedIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
