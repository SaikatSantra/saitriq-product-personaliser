import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../models/shop.server";

export const DEFAULT_STOREFRONT_TEXT: Record<string, string> = {
  button_text: "🎨 Customize This Product",
  modal_title: "Customize Your Design",
  modal_subtitle: "Personalize text, upload photos & preview live",
  front_side: "Front Side",
  back_side: "Back Side",
  custom_text_title: "Add Custom Text",
  your_message: "Your Message / Text",
  text_placeholder: "Line 1\nLine 2...",
  font_family: "Font Family",
  print_ink_color: "Print Ink Color",
  upload_title: "Upload Photo or Logo",
  upload_hint: "High-res PNG, JPG, or WEBP",
  change_photo: "Change",
  remove_photo: "Remove",
  cancel: "Cancel",
  add_to_cart: "Add to Cart with Design",
  adding_to_cart: "Adding to Cart...",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  let settings = {
    defaultDpi: 300,
    storageProvider: "local",
    enableAiBackgroundRemoval: true,
    s3Bucket: "",
    s3Region: "us-east-1",
    printfulApiKey: "",
    printifyApiKey: "",
    storefrontText: DEFAULT_STOREFRONT_TEXT,
  };

  try {
    const parsed = JSON.parse(shop.settings || "{}");
    settings = {
      ...settings,
      ...parsed,
      storefrontText: {
        ...DEFAULT_STOREFRONT_TEXT,
        ...(parsed.storefrontText || {}),
      },
    };
  } catch {}

  return { shop, settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  let storefrontText = DEFAULT_STOREFRONT_TEXT;
  const storefrontTextJson = formData.get("storefrontText") as string;
  try {
    if (storefrontTextJson) {
      storefrontText = { ...DEFAULT_STOREFRONT_TEXT, ...JSON.parse(storefrontTextJson) };
    }
  } catch {}

  const settings = {
    defaultDpi: parseInt(formData.get("defaultDpi") as string) || 300,
    storageProvider: (formData.get("storageProvider") as string) || "local",
    enableAiBackgroundRemoval: formData.get("enableAiBackgroundRemoval") === "true",
    s3Bucket: (formData.get("s3Bucket") as string) || "",
    s3Region: (formData.get("s3Region") as string) || "us-east-1",
    printfulApiKey: (formData.get("printfulApiKey") as string) || "",
    printifyApiKey: (formData.get("printifyApiKey") as string) || "",
    storefrontText,
  };

  await prisma.shop.update({
    where: { shopifyDomain: session.shop },
    data: {
      settings: JSON.stringify(settings),
      updatedAt: new Date(),
    },
  });

  return { success: true, message: "Settings and storefront text saved successfully" };
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [defaultDpi, setDefaultDpi] = useState(settings.defaultDpi);
  const [storageProvider, setStorageProvider] = useState(settings.storageProvider);
  const [enableAi, setEnableAi] = useState(settings.enableAiBackgroundRemoval);
  const [s3Bucket, setS3Bucket] = useState(settings.s3Bucket);
  const [s3Region, setS3Region] = useState(settings.s3Region);
  const [printfulKey, setPrintfulKey] = useState(settings.printfulApiKey);
  const [printifyKey, setPrintifyKey] = useState(settings.printifyApiKey);

  const [storefrontText, setStorefrontText] = useState<Record<string, string>>({
    ...DEFAULT_STOREFRONT_TEXT,
    ...(settings.storefrontText || {}),
  });

  const updateText = (key: string, val: string) => {
    setStorefrontText((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    fetcher.submit(
      {
        defaultDpi: defaultDpi.toString(),
        storageProvider,
        enableAiBackgroundRemoval: enableAi.toString(),
        s3Bucket,
        s3Region,
        printfulApiKey: printfulKey,
        printifyApiKey: printifyKey,
        storefrontText: JSON.stringify(storefrontText),
      },
      { method: "POST" },
    );
  };

  const isSaving = fetcher.state === "submitting";

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #c9cccf",
    borderRadius: "6px",
    marginTop: "4px",
    fontSize: "13px",
  };

  const labelStyle = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#202223",
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  };

  const hintStyle = {
    fontSize: "12px",
    color: "#6d7175",
    fontWeight: 400,
  };

  return (
    <s-page heading="App Settings & Print Configurations">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Save Settings"}
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">
            {fetcher.data.message}
          </s-banner>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "780px" }}>
        
        {/* Storefront Text & Language Customization */}
        <s-section heading="Storefront Text & Language">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "#4a4f54" }}>
              Customize all button labels, titles, and instructions displayed in the storefront personalizer. Changes saved here reflect immediately in your customer studio.
            </p>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                1. Button & Studio Titles
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Customize Button Text:
                  <input
                    type="text"
                    value={storefrontText.button_text || ""}
                    onChange={(e) => updateText("button_text", e.target.value)}
                    placeholder="🎨 Customize This Product"
                    style={inputStyle}
                  />
                  <span style={hintStyle}>Shown on the product page next to Add to Cart</span>
                </label>
                <label style={labelStyle}>
                  Studio Modal Header:
                  <input
                    type="text"
                    value={storefrontText.modal_title || ""}
                    onChange={(e) => updateText("modal_title", e.target.value)}
                    placeholder="Customize Your Design"
                    style={inputStyle}
                  />
                  <span style={hintStyle}>Main title at top of the personalization modal</span>
                </label>
              </div>

              <div style={{ marginTop: "10px" }}>
                <label style={labelStyle}>
                  Modal Subtitle:
                  <input
                    type="text"
                    value={storefrontText.modal_subtitle || ""}
                    onChange={(e) => updateText("modal_subtitle", e.target.value)}
                    placeholder="Personalize text, upload photos & preview live"
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                2. Multi-Side Switcher Tabs
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Front Side Tab Label:
                  <input
                    type="text"
                    value={storefrontText.front_side || ""}
                    onChange={(e) => updateText("front_side", e.target.value)}
                    placeholder="Front Side"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Back Side Tab Label:
                  <input
                    type="text"
                    value={storefrontText.back_side || ""}
                    onChange={(e) => updateText("back_side", e.target.value)}
                    placeholder="Back Side"
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                3. Custom Text Controls
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Text Card Title:
                  <input
                    type="text"
                    value={storefrontText.custom_text_title || ""}
                    onChange={(e) => updateText("custom_text_title", e.target.value)}
                    placeholder="Add Custom Text"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Message Field Label:
                  <input
                    type="text"
                    value={storefrontText.your_message || ""}
                    onChange={(e) => updateText("your_message", e.target.value)}
                    placeholder="Your Message / Text"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Font Family Label:
                  <input
                    type="text"
                    value={storefrontText.font_family || ""}
                    onChange={(e) => updateText("font_family", e.target.value)}
                    placeholder="Font Family"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Print Ink Color Label:
                  <input
                    type="text"
                    value={storefrontText.print_ink_color || ""}
                    onChange={(e) => updateText("print_ink_color", e.target.value)}
                    placeholder="Print Ink Color"
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                4. Photo & Logo Upload Controls
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Upload Card Title:
                  <input
                    type="text"
                    value={storefrontText.upload_title || ""}
                    onChange={(e) => updateText("upload_title", e.target.value)}
                    placeholder="Upload Photo or Logo"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Upload Hint / File Types:
                  <input
                    type="text"
                    value={storefrontText.upload_hint || ""}
                    onChange={(e) => updateText("upload_hint", e.target.value)}
                    placeholder="High-res PNG, JPG, or WEBP"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Change Photo Button:
                  <input
                    type="text"
                    value={storefrontText.change_photo || ""}
                    onChange={(e) => updateText("change_photo", e.target.value)}
                    placeholder="Change"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Remove Photo Button:
                  <input
                    type="text"
                    value={storefrontText.remove_photo || ""}
                    onChange={(e) => updateText("remove_photo", e.target.value)}
                    placeholder="Remove"
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                5. Actions & Buttons
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Add to Cart Button:
                  <input
                    type="text"
                    value={storefrontText.add_to_cart || ""}
                    onChange={(e) => updateText("add_to_cart", e.target.value)}
                    placeholder="Add to Cart with Design"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Adding to Cart (Loading State):
                  <input
                    type="text"
                    value={storefrontText.adding_to_cart || ""}
                    onChange={(e) => updateText("adding_to_cart", e.target.value)}
                    placeholder="Adding to Cart..."
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          </div>
        </s-section>

        {/* Print Standards */}
        <s-section heading="Print Specifications">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Default Print Resolution (DPI):
              <input
                type="number"
                value={defaultDpi}
                onChange={(e) => setDefaultDpi(parseInt(e.target.value) || 300)}
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              />
              <span style={{ fontSize: "12px", color: "#6d7175" }}>
                300 DPI is the industry gold standard for physical commercial printing.
              </span>
            </label>
          </div>
        </s-section>

        {/* AI Processing */}
        <s-section heading="AI Image Processing">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={enableAi}
                onChange={(e) => setEnableAi(e.target.checked)}
              />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>Enable AI Background Removal on Customer Uploads</div>
                <div style={{ fontSize: "12px", color: "#6d7175" }}>
                  Automatically isolates subject portraits from customer-uploaded photos using Rembg / PhotoRoom pipeline.
                </div>
              </div>
            </label>
          </div>
        </s-section>

        {/* Storage Provider */}
        <s-section heading="Asset & Print Storage Provider">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Storage Destination:
              <select
                value={storageProvider}
                onChange={(e) => setStorageProvider(e.target.value)}
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              >
                <option value="local">Local Development Storage (App Filesystem)</option>
                <option value="s3">Amazon AWS S3 Bucket</option>
                <option value="r2">Cloudflare R2 (Zero Egress Fees)</option>
              </select>
            </label>

            {storageProvider !== "local" && (
              <>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>
                  Bucket Name:
                  <input
                    type="text"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="e.g. my-store-customizer-prints"
                    style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>
                  Region:
                  <input
                    type="text"
                    value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)}
                    placeholder="us-east-1"
                    style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                  />
                </label>
              </>
            )}
          </div>
        </s-section>

        {/* POD Automation */}
        <s-section heading="Print on Demand (POD) Integrations">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Printful API Key (Optional):
              <input
                type="password"
                value={printfulKey}
                onChange={(e) => setPrintfulKey(e.target.value)}
                placeholder="Bearer token..."
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Printify API Token (Optional):
              <input
                type="password"
                value={printifyKey}
                onChange={(e) => setPrintifyKey(e.target.value)}
                placeholder="API token..."
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              />
            </label>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}
