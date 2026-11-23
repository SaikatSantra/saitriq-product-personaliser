import { useState, useEffect, useRef } from "react";
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

  // Fetch shop products with images and variants for assignment & mockup sync
  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
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
              variants(first: 10) {
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

  return { template, shopProducts };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const templateId = params.id as string;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_template") {
    const title = formData.get("title") as string;
    const canvasWidth = parseInt(formData.get("canvasWidth") as string) || 1200;
    const canvasHeight = parseInt(formData.get("canvasHeight") as string) || 1200;
    const printDpi = parseInt(formData.get("printDpi") as string) || 300;
    const layersJson = formData.get("layersJson") as string;
    const optionGroupsRaw = formData.get("optionGroups") as string;
    const productIdsRaw = formData.get("assignedProductIds") as string;

    let optionGroups = [];
    try {
      optionGroups = JSON.parse(optionGroupsRaw || "[]");
    } catch {
      optionGroups = [];
    }

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
      optionGroups,
    });

    await assignProductsToTemplate(templateId, session.shop, assignedProductIds);

    return { success: true, message: "Template saved successfully!" };
  }

  if (intent === "create_sample_products") {
    const { admin } = await authenticate.admin(request);
    const sampleProducts = [
      { title: "Custom Classic T-Shirt" },
      { title: "Custom Ceramic Coffee Mug" },
      { title: "Custom Canvas Wall Art" },
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

    return { success: true, message: "Sample customizable products created & linked!" };
  }

  return { success: false };
};

export default function TemplateStudio() {
  const { template, shopProducts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  // Template state
  const [title, setTitle] = useState(template.title);
  const [canvasWidth, setCanvasWidth] = useState(template.canvasWidth || 1200);
  const [canvasHeight, setCanvasHeight] = useState(template.canvasHeight || 1200);
  const [printDpi, setPrintDpi] = useState(template.printDpi || 300);
  const [assignedProductIds, setAssignedProductIds] = useState<string[]>(
    template.products.map((p: any) => p.shopifyProductId),
  );

  // Layers & Canvas state
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const sidesDataRef = useRef<{ front: any; back: any }>({
    front: null,
    back: null,
  });
  const [activeLayer, setActiveLayer] = useState<any>(null);
  const [layersList, setLayersList] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [zoomLevel, setZoomLevel] = useState(0.45);

  // Matched assigned products
  const assignedProductsList = shopProducts.filter((p: any) => assignedProductIds.includes(p.id));

  // Initialize Fabric Canvas on Client
  useEffect(() => {
    let isMounted = true;

    async function initFabric() {
      if (typeof window === "undefined" || !canvasRef.current) return;

      const fabricModule = await import("fabric");
      const { Canvas } = fabricModule;

      if (!isMounted) return;

      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }

      const canvas = new Canvas(canvasRef.current, {
        width: canvasWidth * zoomLevel,
        height: canvasHeight * zoomLevel,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });

      // Scale context according to zoom
      canvas.setZoom(zoomLevel);

      // Parse sides data if not already cached in ref
      if (!sidesDataRef.current.front && !sidesDataRef.current.back) {
        if (template.layersJson && template.layersJson !== "[]") {
          try {
            const parsed = JSON.parse(template.layersJson);
            if (parsed.sides) {
              sidesDataRef.current = {
                front: parsed.sides.front || { objects: [] },
                back: parsed.sides.back || { objects: [] },
              };
            } else {
              sidesDataRef.current = {
                front: parsed.objects ? parsed : { objects: Array.isArray(parsed) ? parsed : [] },
                back: { objects: [] },
              };
            }
          } catch (e) {
            console.error("Failed to parse layers JSON", e);
            sidesDataRef.current = { front: { objects: [] }, back: { objects: [] } };
          }
        } else {
          sidesDataRef.current = { front: { objects: [] }, back: { objects: [] } };
        }
      }

      // Load active side layers if present
      const currentSideLayers = sidesDataRef.current[activeSide] || { objects: [] };
      if (currentSideLayers.objects && currentSideLayers.objects.length > 0) {
        canvas.loadFromJSON(currentSideLayers, () => {
          canvas.renderAll();
          updateLayersState(canvas);
        });
      }

      canvas.on("selection:created", (e: any) => {
        if (e.selected && e.selected[0]) {
          setActiveLayer(e.selected[0]);
        }
      });

      canvas.on("selection:updated", (e: any) => {
        if (e.selected && e.selected[0]) {
          setActiveLayer(e.selected[0]);
        }
      });

      canvas.on("selection:cleared", () => {
        setActiveLayer(null);
      });

      canvas.on("object:modified", () => {
        updateLayersState(canvas);
      });

      canvas.on("object:added", () => {
        updateLayersState(canvas);
      });

      canvas.on("object:removed", () => {
        updateLayersState(canvas);
      });

      fabricCanvasRef.current = canvas;
      updateLayersState(canvas);
    }

    initFabric();

    return () => {
      isMounted = false;
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, [canvasWidth, canvasHeight, zoomLevel]);

  const updateLayersState = (canvas: any) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    setLayersList([...objects]);
  };

  const handleSwitchSide = (targetSide: "front" | "back") => {
    if (targetSide === activeSide || !fabricCanvasRef.current) return;

    // 1. Serialize current canvas to sidesDataRef
    sidesDataRef.current[activeSide] = fabricCanvasRef.current.toObject([
      "name",
      "customType",
      "isCustomerEditable",
      "optionLabel",
      "maxCharacters",
      "enableAiBackgroundRemoval",
    ]);

    setActiveSide(targetSide);
    setActiveLayer(null);

    // 2. Load target side JSON
    const targetLayers = sidesDataRef.current[targetSide] || { objects: [] };
    fabricCanvasRef.current.loadFromJSON(targetLayers, () => {
      fabricCanvasRef.current.renderAll();
      updateLayersState(fabricCanvasRef.current);
    });
  };

  // Add Layer actions
  const addTextLayer = async () => {
    if (!fabricCanvasRef.current) return;
    const { IText } = await import("fabric");

    const text = new IText("Enter Custom Text", {
      left: 100,
      top: 100,
      fontFamily: "Roboto",
      fontSize: 48,
      fill: "#111111",
      name: `Text Layer ${layersList.length + 1}`,
      customType: "text",
      isCustomerEditable: true,
      maxCharacters: 25,
      optionLabel: "Your Text",
    });

    fabricCanvasRef.current.add(text);
    fabricCanvasRef.current.setActiveObject(text);
    fabricCanvasRef.current.renderAll();
    setActiveLayer(text);
  };

  const addPhotoUploadArea = async () => {
    if (!fabricCanvasRef.current) return;
    const { Rect } = await import("fabric");

    const uploadArea = new Rect({
      left: 150,
      top: 150,
      width: 400,
      height: 400,
      fill: "rgba(0, 128, 96, 0.12)",
      stroke: "#008060",
      strokeDashArray: [10, 10],
      strokeWidth: 4,
      name: `Photo Upload ${layersList.length + 1}`,
      customType: "image_upload",
      isCustomerEditable: true,
      optionLabel: "Upload Photo or Logo",
      enableAiBackgroundRemoval: true,
    });

    fabricCanvasRef.current.add(uploadArea);
    fabricCanvasRef.current.setActiveObject(uploadArea);
    fabricCanvasRef.current.renderAll();
    setActiveLayer(uploadArea);
  };

  const addMockupBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvasRef.current) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const { FabricImage } = await import("fabric");

      const imgElement = new Image();
      imgElement.src = dataUrl;
      imgElement.onload = () => {
        // Remove old mockup underlay if present
        const existing = fabricCanvasRef.current.getObjects().filter((o: any) => o.name === "Mockup Underlay" || o.customType === "background_mockup");
        existing.forEach((o: any) => fabricCanvasRef.current.remove(o));

        const fabricImg = new FabricImage(imgElement, {
          left: 0,
          top: 0,
          scaleX: (canvasWidth / imgElement.width),
          scaleY: (canvasHeight / imgElement.height),
          selectable: false,
          evented: false,
          name: "Mockup Underlay",
          customType: "background_mockup",
        });

        fabricCanvasRef.current.add(fabricImg);
        fabricCanvasRef.current.sendObjectToBack(fabricImg);
        fabricCanvasRef.current.renderAll();
        updateLayersState(fabricCanvasRef.current);
      };
    };
    reader.readAsDataURL(file);
  };

  // Sync Mockup image automatically from assigned product
  const syncMockupFromProduct = async () => {
    if (!assignedProductIds || assignedProductIds.length === 0) {
      alert("Please assign a product to this template first.");
      return;
    }
    const matched = shopProducts.find((p: any) => assignedProductIds.includes(p.id));
    if (!matched) {
      alert("Could not find product data to sync.");
      return;
    }

    // Front uses featured image; Back uses second image if present
    const targetUrl = (activeSide === "back" && matched.images && matched.images.length > 1)
      ? matched.images[1].url
      : matched.featuredImage?.url;

    if (!targetUrl) {
      alert(`No image found on ${matched.title} for the ${activeSide} side.`);
      return;
    }

    if (!fabricCanvasRef.current) return;
    const { FabricImage } = await import("fabric");
    const imgElement = new Image();
    imgElement.crossOrigin = "anonymous";
    imgElement.src = targetUrl;
    imgElement.onload = () => {
      const existing = fabricCanvasRef.current.getObjects().filter((o: any) => o.name === "Mockup Underlay" || o.customType === "background_mockup");
      existing.forEach((o: any) => fabricCanvasRef.current.remove(o));

      const fabricImg = new FabricImage(imgElement, {
        left: 0,
        top: 0,
        scaleX: (canvasWidth / imgElement.width),
        scaleY: (canvasHeight / imgElement.height),
        selectable: false,
        evented: false,
        name: "Mockup Underlay",
        customType: "background_mockup",
      });

      fabricCanvasRef.current.add(fabricImg);
      fabricCanvasRef.current.sendObjectToBack(fabricImg);
      fabricCanvasRef.current.renderAll();
      updateLayersState(fabricCanvasRef.current);
    };
  };

  const removeSelectedLayer = () => {
    if (!fabricCanvasRef.current || !activeLayer) return;
    fabricCanvasRef.current.remove(activeLayer);
    fabricCanvasRef.current.renderAll();
    setActiveLayer(null);
  };

  const bringLayerForward = () => {
    if (!fabricCanvasRef.current || !activeLayer) return;
    fabricCanvasRef.current.bringObjectForward(activeLayer);
    fabricCanvasRef.current.renderAll();
    updateLayersState(fabricCanvasRef.current);
  };

  const sendLayerBackward = () => {
    if (!fabricCanvasRef.current || !activeLayer) return;
    fabricCanvasRef.current.sendObjectBackwards(activeLayer);
    fabricCanvasRef.current.renderAll();
    updateLayersState(fabricCanvasRef.current);
  };

  const handleSave = () => {
    if (!fabricCanvasRef.current) return;

    // Serialize current active side to cache
    sidesDataRef.current[activeSide] = fabricCanvasRef.current.toObject([
      "name",
      "customType",
      "isCustomerEditable",
      "optionLabel",
      "maxCharacters",
      "enableAiBackgroundRemoval",
    ]);

    const fullLayers = {
      sides: {
        front: sidesDataRef.current.front || { objects: [] },
        back: sidesDataRef.current.back || { objects: [] },
      },
      objects: sidesDataRef.current.front?.objects || [],
    };

    const canvasJson = JSON.stringify(fullLayers);

    // Generate option groups automatically from customer-editable layers across BOTH sides
    const frontEditable = (sidesDataRef.current.front?.objects || [])
      .filter((obj: any) => obj.isCustomerEditable)
      .map((obj: any, idx: number) => ({
        name: `Front: ${obj.optionLabel || `Option ${idx + 1}`}`,
        displayType: obj.customType === "image_upload" ? "image_upload" : "text_input",
        position: idx,
        conditionalRules: "{}",
        options: [
          {
            label: `Front: ${obj.optionLabel || `Option ${idx + 1}`}`,
            priceExtra: 0.0,
            metadata: JSON.stringify({
              side: "front",
              layerName: obj.name,
              maxCharacters: obj.maxCharacters || 50,
            }),
          },
        ],
      }));

    const backEditable = (sidesDataRef.current.back?.objects || [])
      .filter((obj: any) => obj.isCustomerEditable)
      .map((obj: any, idx: number) => ({
        name: `Back: ${obj.optionLabel || `Option ${idx + 1}`}`,
        displayType: obj.customType === "image_upload" ? "image_upload" : "text_input",
        position: frontEditable.length + idx,
        conditionalRules: "{}",
        options: [
          {
            label: `Back: ${obj.optionLabel || `Option ${idx + 1}`}`,
            priceExtra: 0.0,
            metadata: JSON.stringify({
              side: "back",
              layerName: obj.name,
              maxCharacters: obj.maxCharacters || 50,
            }),
          },
        ],
      }));

    const generatedOptionGroups = [...frontEditable, ...backEditable];

    fetcher.submit(
      {
        intent: "save_template",
        title,
        canvasWidth: canvasWidth.toString(),
        canvasHeight: canvasHeight.toString(),
        printDpi: printDpi.toString(),
        layersJson: canvasJson,
        optionGroups: JSON.stringify(generatedOptionGroups),
        assignedProductIds: JSON.stringify(assignedProductIds),
      },
      { method: "POST" },
    );
  };

  const handleOpenNativePicker = async () => {
    try {
      if (shopify && (shopify as any).resourcePicker) {
        const selected = await (shopify as any).resourcePicker({
          type: "product",
          multiple: true,
          selectionIds: assignedProductIds.map((id) => ({ id })),
        });
        if (selected && Array.isArray(selected)) {
          setAssignedProductIds(selected.map((p: any) => p.id));
          return;
        }
      }
    } catch (e) {
      console.warn("Native picker fallback", e);
    }
    setShowProductModal(true);
  };

  const toggleProductAssignment = (id: string) => {
    setAssignedProductIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id],
    );
  };

  const isSaving = fetcher.state === "submitting";

  return (
    <s-page heading="Template Studio">
      {/* Primary Action in Page Header */}
      <div slot="primary-action" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <Link
          to="/app/templates"
          style={{
            color: "#6d7175",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            padding: "8px 12px",
          }}
        >
          &larr; Back to Templates
        </Link>
        <s-button
          variant="primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Template"}
        </s-button>
      </div>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">
            {fetcher.data.message}
          </s-banner>
        </div>
      )}

      {/* Top Header Bar: Editable Template Title & Linked Products Status */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e1e3e5",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "320px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
            🎨
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Template Title
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Custom Cap Front Studio, T-Shirt Print Template..."
              style={{
                width: "100%",
                maxWidth: "520px",
                border: "none",
                borderBottom: "2px solid #008060",
                fontSize: "16px",
                fontWeight: 700,
                color: "#1a1a1a",
                padding: "4px 0",
                outline: "none",
                background: "transparent",
              }}
            />
          </div>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              background: assignedProductIds.length > 0 ? "#ecfdf5" : "#fef3c7",
              color: assignedProductIds.length > 0 ? "#059669" : "#d97706",
              padding: "5px 12px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>{assignedProductIds.length > 0 ? "✓" : "!"}</span>
            <span>{assignedProductIds.length} Products Assigned</span>
          </span>

          <span style={{ fontSize: "12px", color: "#6d7175", background: "#f1f5f9", padding: "5px 10px", borderRadius: "6px", fontWeight: 600 }}>
            {canvasWidth} × {canvasHeight} px @ {printDpi} DPI
          </span>

          <button
            type="button"
            onClick={handleOpenNativePicker}
            style={{
              background: "#008060",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "7px 14px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>🛍️</span> Assign Products
          </button>
        </div>
      </div>

      {/* =========================================================================
          2-COLUMN PROFESSIONAL STUDIO LAYOUT
      ========================================================================= */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "20px", alignItems: "start" }}>
        
        {/* =====================================================================
            LEFT COLUMN: SETUP, PRODUCTS & LAYERS CONFIGURATION
        ===================================================================== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* 1. Assigned Product Card */}
          <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#202223" }}>
                🛍️ Assigned Products ({assignedProductIds.length})
              </div>
              <button
                type="button"
                onClick={handleOpenNativePicker}
                style={{ background: "none", border: "none", color: "#008060", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Change
              </button>
            </div>

            {assignedProductsList.length === 0 ? (
              <div style={{ background: "#f9fafb", border: "1px dashed #c9cccf", borderRadius: "8px", padding: "20px", textAlign: "center" }}>
                <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#6d7175" }}>
                  No product assigned yet. Connect a product so the customizer button appears on its page.
                </p>
                <button
                  type="button"
                  onClick={handleOpenNativePicker}
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
                  + Assign Product
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {assignedProductsList.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "10px 12px",
                    }}
                  >
                    <img
                      src={p.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                      alt={p.title}
                      style={{ width: "42px", height: "42px", borderRadius: "6px", objectFit: "cover", border: "1px solid #e2e8f0" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        {p.variants?.length || 1} variants detected
                      </div>
                    </div>
                  </div>
                ))}

                {/* 1-Click Sync Mockup Underlay Button */}
                <button
                  type="button"
                  onClick={syncMockupFromProduct}
                  title="Loads product photo directly onto canvas as the base mockup underlay"
                  style={{
                    marginTop: "6px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#15803d",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <span>🖼️</span> Sync Product Photo to Canvas Underlay
                </button>
              </div>
            )}
          </div>

          {/* 2. Studio Layer Controls */}
          <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#202223", marginBottom: "12px" }}>
              ⚡ Add Personalization Tools
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              <button
                type="button"
                onClick={addTextLayer}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "12px 10px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                <span style={{ fontSize: "20px" }}>🔤</span>
                <span>+ Custom Text</span>
              </button>

              <button
                type="button"
                onClick={addPhotoUploadArea}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "12px 10px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                <span style={{ fontSize: "20px" }}>📷</span>
                <span>+ Upload Area</span>
              </button>
            </div>

            {/* Custom Mockup File Upload */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "9px 12px",
                borderRadius: "6px",
                border: "1px dashed #008060",
                background: "#f0fdf4",
                color: "#15803d",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span>📁</span> Upload Custom Mockup ({activeSide === "front" ? "Front" : "Back"})
              <input
                type="file"
                accept="image/*"
                onChange={addMockupBackground}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {/* 3. Layer Inspector & Properties */}
          <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#202223" }}>
                {activeLayer ? "🔧 Selected Layer Inspector" : "📑 Canvas Layers Stack"}
              </div>
              {activeLayer && (
                <button
                  type="button"
                  onClick={removeSelectedLayer}
                  style={{ color: "#d82c0d", background: "none", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}
                >
                  Delete Layer
                </button>
              )}
            </div>

            {activeLayer ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
                <label style={{ fontWeight: 600, color: "#202223" }}>
                  Layer Label:
                  <input
                    type="text"
                    value={activeLayer.name || ""}
                    onChange={(e) => {
                      activeLayer.set("name", e.target.value);
                      fabricCanvasRef.current?.renderAll();
                      updateLayersState(fabricCanvasRef.current);
                    }}
                    style={{ width: "100%", padding: "7px 10px", border: "1px solid #c9cccf", borderRadius: "6px", marginTop: "3px" }}
                  />
                </label>

                {activeLayer.type === "i-text" && (
                  <>
                    <label style={{ fontWeight: 600, color: "#202223" }}>
                      Font Family:
                      <select
                        value={activeLayer.fontFamily || "Roboto"}
                        onChange={(e) => {
                          activeLayer.set("fontFamily", e.target.value);
                          fabricCanvasRef.current?.renderAll();
                        }}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #c9cccf", borderRadius: "6px", marginTop: "3px" }}
                      >
                        <option value="Roboto">Roboto (Clean Modern)</option>
                        <option value="Montserrat">Montserrat (Geometric)</option>
                        <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                        <option value="Pacifico">Pacifico (Handwritten Script)</option>
                        <option value="Oswald">Oswald (Bold Headline)</option>
                        <option value="Courier New">Courier New (Vintage Monospace)</option>
                      </select>
                    </label>

                    <label style={{ fontWeight: 600, color: "#202223" }}>
                      Text Ink Color:
                      <input
                        type="color"
                        value={activeLayer.fill || "#111111"}
                        onChange={(e) => {
                          activeLayer.set("fill", e.target.value);
                          fabricCanvasRef.current?.renderAll();
                        }}
                        style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "6px", marginTop: "3px", cursor: "pointer" }}
                      />
                    </label>
                  </>
                )}

                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={bringLayerForward}
                    style={{ flex: 1, padding: "6px 10px", border: "1px solid #c9cccf", borderRadius: "4px", background: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Bring Forward
                  </button>
                  <button
                    type="button"
                    onClick={sendLayerBackward}
                    style={{ flex: 1, padding: "6px 10px", border: "1px solid #c9cccf", borderRadius: "4px", background: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Send Backward
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {layersList.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "12px", color: "#6d7175", textAlign: "center", padding: "10px" }}>
                    No layers added on {activeSide} side yet.
                  </p>
                ) : (
                  layersList.map((layer, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        fabricCanvasRef.current?.setActiveObject(layer);
                        fabricCanvasRef.current?.renderAll();
                        setActiveLayer(layer);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        background: "#fafbfb",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{layer.name || `Layer ${idx + 1}`}</span>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>{layer.type}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 4. Canvas & Print Specs */}
          <div style={{ background: "#ffffff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "16px", fontSize: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#202223", marginBottom: "8px" }}>
              📐 Print Specifications
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
              <label style={{ color: "#6d7175" }}>
                Width (px):
                <input
                  type="number"
                  value={canvasWidth}
                  onChange={(e) => setCanvasWidth(parseInt(e.target.value) || 1200)}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "2px" }}
                />
              </label>
              <label style={{ color: "#6d7175" }}>
                Height (px):
                <input
                  type="number"
                  value={canvasHeight}
                  onChange={(e) => setCanvasHeight(parseInt(e.target.value) || 1200)}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "2px" }}
                />
              </label>
            </div>
            <div style={{ color: "#059669", fontWeight: 600, fontSize: "11px" }}>
              ✓ 300 DPI High-Resolution Output
            </div>
          </div>
        </div>

        {/* =====================================================================
            RIGHT COLUMN: INTERACTIVE VISUAL WORKSPACE & LIVE CANVAS
        ===================================================================== */}
        <div
          style={{
            background: "#1e293b",
            borderRadius: "14px",
            border: "1px solid #334155",
            padding: "20px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Studio Top Switcher Bar */}
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
              paddingBottom: "14px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            {/* Front / Back Switcher Tabs */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                padding: "4px",
                borderRadius: "10px",
                display: "flex",
                gap: "4px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <button
                type="button"
                onClick={() => handleSwitchSide("front")}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: activeSide === "front" ? "#008060" : "transparent",
                  color: "#ffffff",
                  boxShadow: activeSide === "front" ? "0 2px 8px rgba(0, 128, 96, 0.4)" : "none",
                }}
              >
                <span>👕</span> Front Side
              </button>

              <button
                type="button"
                onClick={() => handleSwitchSide("back")}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: activeSide === "back" ? "#008060" : "transparent",
                  color: "#ffffff",
                  boxShadow: activeSide === "back" ? "0 2px 8px rgba(0, 128, 96, 0.4)" : "none",
                }}
              >
                <span>🔄</span> Back Side
              </button>
            </div>

            {/* Zoom Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
                Zoom: {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.2, z - 0.05))}
                style={{ background: "rgba(255, 255, 255, 0.1)", color: "#fff", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(0.45)}
                style={{ background: "rgba(255, 255, 255, 0.1)", color: "#fff", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", cursor: "pointer" }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(1.0, z + 0.05))}
                style={{ background: "rgba(255, 255, 255, 0.1)", color: "#fff", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
              >
                +
              </button>
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div
            ref={canvasContainerRef}
            style={{
              padding: "20px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "auto",
              maxWidth: "100%",
            }}
          >
            <div
              style={{
                boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
                borderRadius: "8px",
                overflow: "hidden",
                border: "2px solid rgba(255, 255, 255, 0.2)",
                lineHeight: 0,
                background: "#ffffff",
              }}
            >
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* Footer Guide text */}
          <div style={{ marginTop: "14px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
            💡 <em>Click any text or photo layer on the canvas to drag, scale, or reposition print boundaries.</em>
          </div>
        </div>
      </div>

      {/* =========================================================================
          STYLED PRODUCT PICKER MODAL (FALLBACK IF NATIVE PICKER CANNOT RUN)
      ========================================================================= */}
      {showProductModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e1e3e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Assign Products to Template</h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6d7175" }}
              >
                &times;
              </button>
            </div>

            {/* Modal Search */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f2f3" }}>
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "13px" }}
              />
            </div>

            {/* Modal Products List */}
            <div style={{ padding: "10px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
              {shopProducts
                .filter((p: any) => p.title.toLowerCase().includes(productSearch.toLowerCase()))
                .map((p: any) => {
                  const isChecked = assignedProductIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px",
                        borderRadius: "8px",
                        border: isChecked ? "2px solid #008060" : "1px solid #e2e8f0",
                        background: isChecked ? "#f0fdf4" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleProductAssignment(p.id)}
                      />
                      <img
                        src={p.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                        alt={p.title}
                        style={{ width: "40px", height: "40px", borderRadius: "6px", objectFit: "cover", border: "1px solid #e2e8f0" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{p.title}</div>
                        <div style={{ fontSize: "11px", color: "#6d7175" }}>{p.variants?.length || 1} variants</div>
                      </div>
                    </label>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e1e3e5", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
                {assignedProductIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                style={{
                  background: "#008060",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}
