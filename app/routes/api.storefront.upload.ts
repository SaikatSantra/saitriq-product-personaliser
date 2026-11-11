import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import * as fs from "fs/promises";
import * as path from "path";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-shopify-shop-domain",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return Response.json({ status: "Saitriq Upload API ready" }, { headers: corsHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const body = await request.json();
    const { image, customizationId, shop: rawShop } = body;

    const shop = (
      rawShop ||
      url.searchParams.get("shop") ||
      request.headers.get("x-shopify-shop-domain") ||
      ""
    )
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .trim();

    if (!image || typeof image !== "string") {
      return Response.json(
        { success: false, error: "Missing or invalid image data" },
        { status: 400, headers: corsHeaders },
      );
    }

    const cleanId = (customizationId || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`)
      .replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `${cleanId}.jpg`;

    // Extract raw base64 buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Write to public/uploads/previews
    const uploadDir = path.resolve(process.cwd(), "public", "uploads", "previews");
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, imageBuffer);

    // Build public URLs
    // 1. Storefront App Proxy URL (runs under the merchant's store domain):
    const proxyUrl = shop
      ? `https://${shop}/apps/personalizer/preview/${filename}`
      : `/apps/personalizer/preview/${filename}`;

    // 2. Direct App Host URL (accessible globally, in admin, and external):
    const appHost = process.env.SHOPIFY_APP_URL
      ? process.env.SHOPIFY_APP_URL.replace(/\/$/, "")
      : `${url.protocol}//${url.host}`;
    const directUrl = `${appHost}/uploads/previews/${filename}`;

    return Response.json(
      {
        success: true,
        customizationId: cleanId,
        filename,
        previewUrl: proxyUrl,
        directUrl,
      },
      { headers: corsHeaders },
    );
  } catch (err: any) {
    console.error("[Saitriq Upload API] Error processing preview upload:", err);
    return Response.json(
      { success: false, error: err?.message || "Failed to process upload" },
      { status: 500, headers: corsHeaders },
    );
  }
};
