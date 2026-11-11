import { useState, useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
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

  // Fetch shop products for the assignment dropdown/modal
  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 25) {
          edges {
            node {
              id
              title
              featuredImage {
                url
              }
              variants(first: 5) {
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
  const shopProducts = productsJson.data?.products?.edges?.map((e: any) => e.node) || [];

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

    return { success: true, message: "Template saved successfully" };
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
  const navigate = useNavigate();
  const shopify = useAppBridge();

  // Template state
  const [title, setTitle] = useState(template.title);
  const [canvasWidth, setCanvasWidth] = useState(template.canvasWidth);
  const [canvasHeight, setCanvasHeight] = useState(template.canvasHeight);
  const [printDpi, setPrintDpi] = useState(template.printDpi);
  const [assignedProductIds, setAssignedProductIds] = useState<string[]>(
    template.products.map((p: any) => p.shopifyProductId),
  );

  // Layers & Canvas state
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const [activeLayer, setActiveLayer] = useState<any>(null);
  const [layersList, setLayersList] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.4);

  // Initialize Fabric Canvas on Client
  useEffect(() => {
    let isMounted = true;

    async function initFabric() {
      if (typeof window === "undefined" || !canvasRef.current) return;

      const fabricModule = await import("fabric");
      const { Canvas, IText, Rect, Image: FabricImage } = fabricModule;

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

      // Load existing layers if present
      if (template.layersJson && template.layersJson !== "[]") {
        try {
          const parsed = JSON.parse(template.layersJson);
          if (parsed.objects && parsed.objects.length > 0) {
            canvas.loadFromJSON(parsed, () => {
              canvas.renderAll();
              updateLayersState(canvas);
            });
          }
        } catch (e) {
          console.error("Failed to parse layers JSON", e);
        }
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
      // Custom personalizer metadata
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
      fill: "rgba(0, 128, 255, 0.15)",
      stroke: "#0080ff",
      strokeDashArray: [10, 10],
      strokeWidth: 4,
      name: `Photo Upload ${layersList.length + 1}`,
      // Custom personalizer metadata
      customType: "image_upload",
      isCustomerEditable: true,
      optionLabel: "Upload Your Photo",
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

        // Send to bottom
        fabricCanvasRef.current.add(fabricImg);
        fabricCanvasRef.current.sendObjectToBack(fabricImg);
        fabricCanvasRef.current.renderAll();
        updateLayersState(fabricCanvasRef.current);
      };
    };
    reader.readAsDataURL(file);
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

    const canvasJson = JSON.stringify(fabricCanvasRef.current.toObject([
      "name",
      "customType",
      "isCustomerEditable",
      "optionLabel",
      "maxCharacters",
      "enableAiBackgroundRemoval",
    ]));

    // Generate option groups automatically from customer-editable layers
    const objects = fabricCanvasRef.current.getObjects();
    const generatedOptionGroups = objects
      .filter((obj: any) => obj.isCustomerEditable)
      .map((obj: any, idx: number) => ({
        name: obj.optionLabel || `Option ${idx + 1}`,
        displayType: obj.customType === "image_upload" ? "image_upload" : "text_input",
        position: idx,
        conditionalRules: "{}",
        options: [
          {
            label: obj.optionLabel || `Option ${idx + 1}`,
            priceExtra: 0.0,
            metadata: JSON.stringify({
              layerName: obj.name,
              maxCharacters: obj.maxCharacters || 50,
            }),
          },
        ],
      }));

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

  const isSaving = fetcher.state === "submitting";

  return (
    <s-page
      heading={title}
      back-action="/app/templates"
    >
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Save Template"}
      </s-button>

      <s-button
        slot="secondary-actions"
        onClick={handleOpenNativePicker}
      >
        Assign Products ({assignedProductIds.length})
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">
            {fetcher.data.message}
          </s-banner>
        </div>
      )}

      {/* Main Studio Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 300px", gap: "16px", minHeight: "750px" }}>
        
        {/* Left Toolbar */}
        <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e1e3e5", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <h4 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600 }}>Add Layers</h4>
          
          <button
            type="button"
            onClick={addTextLayer}
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              background: "#fafbfb",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            <span>🔤</span> Add Custom Text
          </button>

          <button
            type="button"
            onClick={addPhotoUploadArea}
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              background: "#fafbfb",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            <span>🖼️</span> Add Photo Upload Area
          </button>

          <label
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              border: "1px dashed #0080ff",
              background: "#f0f8ff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#0066cc",
            }}
          >
            <span>👕</span> Upload Mockup Underlay
            <input
              type="file"
              accept="image/*"
              onChange={addMockupBackground}
              style={{ display: "none" }}
            />
          </label>

          <hr style={{ border: "none", borderTop: "1px solid #e1e3e5", margin: "8px 0" }} />

          <h4 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600 }}>Canvas Zoom</h4>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.2, z - 0.1))}
              style={{ flex: 1, padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", background: "#fff" }}
            >
              Zoom Out
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(1.0, z + 0.1))}
              style={{ flex: 1, padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", background: "#fff" }}
            >
              Zoom In
            </button>
          </div>
          <span style={{ fontSize: "12px", color: "#6d7175", textAlign: "center" }}>
            Current Zoom: {Math.round(zoomLevel * 100)}%
          </span>

          <hr style={{ border: "none", borderTop: "1px solid #e1e3e5", margin: "8px 0" }} />

          <h4 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600 }}>Print Bounds</h4>
          <label style={{ fontSize: "12px", color: "#6d7175" }}>
            Width (px):
            <input
              type="number"
              value={canvasWidth}
              onChange={(e) => setCanvasWidth(parseInt(e.target.value) || 1000)}
              style={{ width: "100%", padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
            />
          </label>
          <label style={{ fontSize: "12px", color: "#6d7175" }}>
            Height (px):
            <input
              type="number"
              value={canvasHeight}
              onChange={(e) => setCanvasHeight(parseInt(e.target.value) || 1000)}
              style={{ width: "100%", padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
            />
          </label>
          <label style={{ fontSize: "12px", color: "#6d7175" }}>
            Print DPI:
            <input
              type="number"
              value={printDpi}
              onChange={(e) => setPrintDpi(parseInt(e.target.value) || 300)}
              style={{ width: "100%", padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
            />
          </label>
        </div>

        {/* Center Canvas Workspace */}
        <div
          ref={canvasContainerRef}
          style={{
            background: "#ebeef0",
            borderRadius: "8px",
            border: "1px solid #c9cccf",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            padding: "30px",
            boxShadow: "inset 0 0 10px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              border: "1px solid #bbb",
              background: "#fff",
              lineHeight: 0,
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Right Inspector & Layer Stack */}
        <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e1e3e5", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Active Layer Settings */}
          {activeLayer ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Layer Inspector</h4>
                <button
                  type="button"
                  onClick={removeSelectedLayer}
                  style={{
                    color: "#d72c0d",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  Delete
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                <label>
                  Layer Name:
                  <input
                    type="text"
                    value={activeLayer.name || ""}
                    onChange={(e) => {
                      activeLayer.set("name", e.target.value);
                      fabricCanvasRef.current?.renderAll();
                      updateLayersState(fabricCanvasRef.current);
                    }}
                    style={{ width: "100%", padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                  />
                </label>

                {activeLayer.type === "i-text" && (
                  <>
                    <label>
                      Font Family:
                      <select
                        value={activeLayer.fontFamily || "Roboto"}
                        onChange={(e) => {
                          activeLayer.set("fontFamily", e.target.value);
                          fabricCanvasRef.current?.renderAll();
                        }}
                        style={{ width: "100%", padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                      >
                        <option value="Roboto">Roboto (Sans-serif)</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Playfair Display">Playfair Display (Serif)</option>
                        <option value="Pacifico">Pacifico (Handwritten)</option>
                        <option value="Oswald">Oswald (Bold Impact)</option>
                        <option value="Courier New">Courier New (Monospace)</option>
                      </select>
                    </label>

                    <label>
                      Fill Color:
                      <input
                        type="color"
                        value={activeLayer.fill || "#111111"}
                        onChange={(e) => {
                          activeLayer.set("fill", e.target.value);
                          fabricCanvasRef.current?.renderAll();
                        }}
                        style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px", cursor: "pointer" }}
                      />
                    </label>
                  </>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(activeLayer.isCustomerEditable)}
                    onChange={(e) => {
                      activeLayer.set("isCustomerEditable", e.target.checked);
                      fabricCanvasRef.current?.renderAll();
                      updateLayersState(fabricCanvasRef.current);
                    }}
                  />
                  <span>Customer Editable on Storefront</span>
                </label>

                {activeLayer.isCustomerEditable && (
                  <label>
                    Storefront Input Label:
                    <input
                      type="text"
                      value={activeLayer.optionLabel || ""}
                      onChange={(e) => {
                        activeLayer.set("optionLabel", e.target.value);
                        fabricCanvasRef.current?.renderAll();
                      }}
                      style={{ width: "100%", padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                    />
                  </label>
                )}

                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={bringLayerForward}
                    style={{ flex: 1, padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", background: "#fff", fontSize: "12px" }}
                  >
                    Bring Forward
                  </button>
                  <button
                    type="button"
                    onClick={sendLayerBackward}
                    style={{ flex: 1, padding: "6px", border: "1px solid #c9cccf", borderRadius: "4px", background: "#fff", fontSize: "12px" }}
                  >
                    Send Backward
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#6d7175", fontSize: "13px" }}>
              Click on any layer on the canvas to inspect and edit its properties.
            </div>
          )}

          <hr style={{ border: "none", borderTop: "1px solid #e1e3e5", margin: 0 }} />

          {/* Layer Hierarchy Stack */}
          <div>
            <h4 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600 }}>Layers Stack ({layersList.length})</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "250px", overflowY: "auto" }}>
              {layersList.map((layer, index) => (
                <div
                  key={index}
                  onClick={() => {
                    fabricCanvasRef.current?.setActiveObject(layer);
                    fabricCanvasRef.current?.renderAll();
                    setActiveLayer(layer);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: activeLayer === layer ? "2px solid #0080ff" : "1px solid #e1e3e5",
                    background: activeLayer === layer ? "#f0f8ff" : "#fafbfb",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{layer.name || `Layer ${index + 1}`}</span>
                  <span style={{ color: "#6d7175", fontSize: "11px" }}>{layer.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Product Assignment Modal */}
      {showProductModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div style={{ background: "#fff", borderRadius: "8px", width: "520px", maxHeight: "80vh", overflowY: "auto", padding: "24px" }}>
            <h3 style={{ margin: "0 0 16px" }}>Assign Products to Template</h3>
            <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 0 16px" }}>
              Select which products will display this customizer studio on their storefront detail page.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {shopProducts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 16px", background: "#f6f6f7", borderRadius: "8px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>👕</div>
                  <h4 style={{ margin: "0 0 6px", fontSize: "15px" }}>No products found on your store</h4>
                  <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 auto 16px", maxWidth: "380px" }}>
                    Your development store doesn't have any products yet. Click below to automatically create 3 sample customizable products (T-Shirt, Mug, Canvas Art) on your store.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      fetcher.submit({ intent: "create_sample_products" }, { method: "POST" });
                    }}
                    disabled={fetcher.state === "submitting"}
                    style={{
                      padding: "10px 18px",
                      background: "#008060",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    {fetcher.state === "submitting" ? "Creating Products..." : "✨ Generate 3 Sample Products"}
                  </button>
                </div>
              ) : (
                shopProducts.map((prod: any) => {
                  const isChecked = assignedProductIds.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "8px",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignedProductIds([...assignedProductIds, prod.id]);
                          } else {
                            setAssignedProductIds(assignedProductIds.filter((id) => id !== prod.id));
                          }
                        }}
                      />
                      {prod.featuredImage?.url && (
                        <img
                          src={prod.featuredImage.url}
                          alt=""
                          style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{prod.title}</div>
                        <div style={{ color: "#6d7175", fontSize: "11px" }}>{prod.id}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                  background: "#fff",
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
