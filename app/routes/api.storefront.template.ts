import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getTemplateForProduct } from "../models/product.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const rawShop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
  const shop = rawShop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const productId = url.searchParams.get("productId") || url.searchParams.get("rawProductId") || "";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let storefrontText: Record<string, string> = {};
  if (shop) {
    try {
      const shopRecord = await prisma.shop.findUnique({
        where: { shopifyDomain: shop },
      });
      if (shopRecord?.settings) {
        const parsed = JSON.parse(shopRecord.settings);
        if (parsed.storefrontText && typeof parsed.storefrontText === "object") {
          storefrontText = parsed.storefrontText;
        }
      }
    } catch {}
  }

  if (!shop) {
    return Response.json(
      { hasCustomizer: false, error: "Missing shop parameter", storefrontText },
      { headers: corsHeaders },
    );
  }

  const template = await getTemplateForProduct(shop, productId);

  if (!template) {
    return Response.json(
      { hasCustomizer: false, message: "No template assigned to this product", storefrontText },
      { headers: corsHeaders },
    );
  }

  let parsedLayers: any = [];
  try {
    parsedLayers = JSON.parse(template.layersJson || "[]");
  } catch {
    parsedLayers = [];
  }

  return Response.json(
    {
      hasCustomizer: true,
      storefrontText,
      template: {
        id: template.id,
        title: template.title,
        canvasWidth: template.canvasWidth || 1200,
        canvasHeight: template.canvasHeight || 1200,
        printDpi: template.printDpi || 300,
        layers: parsedLayers,
        optionGroups: template.optionGroups || [],
      },
    },
    { headers: corsHeaders },
  );
};
