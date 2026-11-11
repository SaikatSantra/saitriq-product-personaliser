import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../models/shop.server";

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
  };

  try {
    settings = { ...settings, ...JSON.parse(shop.settings || "{}") };
  } catch {}

  return { shop, settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = {
    defaultDpi: parseInt(formData.get("defaultDpi") as string) || 300,
    storageProvider: (formData.get("storageProvider") as string) || "local",
    enableAiBackgroundRemoval: formData.get("enableAiBackgroundRemoval") === "true",
    s3Bucket: (formData.get("s3Bucket") as string) || "",
    s3Region: (formData.get("s3Region") as string) || "us-east-1",
    printfulApiKey: (formData.get("printfulApiKey") as string) || "",
    printifyApiKey: (formData.get("printifyApiKey") as string) || "",
  };

  await prisma.shop.update({
    where: { shopifyDomain: session.shop },
    data: {
      settings: JSON.stringify(settings),
      updatedAt: new Date(),
    },
  });

  return { success: true, message: "Settings saved successfully" };
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
      },
      { method: "POST" },
    );
  };

  const isSaving = fetcher.state === "submitting";

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

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "700px" }}>
        
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
