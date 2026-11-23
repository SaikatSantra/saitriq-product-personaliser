import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getTemplateForProduct } from "../models/product.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const rawShop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";
  const shop = rawShop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const productId = url.searchParams.get("productId") || url.searchParams.get("rawProductId") || "";
  const requestedLocale = (url.searchParams.get("locale") || "en").toLowerCase().split("-")[0];

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let languages: any = {};
  let storefrontText: Record<string, string> = {};
  let primaryColor = "#008060";
  let defaultDpi = 300;

  const normalizedShop = shop
    ? shop.includes(".myshopify.com")
      ? shop
      : `${shop}.myshopify.com`
    : "";

  if (normalizedShop) {
    try {
      let shopRecord = await prisma.shop.findUnique({
        where: { shopifyDomain: normalizedShop },
      });
      if (!shopRecord && shop) {
        shopRecord = await prisma.shop.findFirst({
          where: {
            OR: [
              { shopifyDomain: shop },
              { shopifyDomain: normalizedShop },
              { shopifyDomain: { contains: shop.replace(".myshopify.com", "") } },
            ],
          },
        });
      }

      if (shopRecord?.settings) {
        const parsed = JSON.parse(shopRecord.settings);
        if (parsed.primaryColor && typeof parsed.primaryColor === "string") {
          primaryColor = parsed.primaryColor;
        }
        if (parsed.defaultDpi && Number(parsed.defaultDpi)) {
          defaultDpi = Number(parsed.defaultDpi);
        }
        if (parsed.languages && typeof parsed.languages === "object") {
          languages = parsed.languages;
        } else if (parsed.storefrontText) {
          languages = {
            en: {
              name: "English",
              isDefault: true,
              strings: parsed.storefrontText,
            },
          };
        }
      }
    } catch (e) {
      console.error("[api.storefront.template] Failed to load shop settings:", e);
    }
  }

  // Pick strings for requested locale, or fallback to default / English
  if (languages[requestedLocale]?.strings) {
    storefrontText = languages[requestedLocale].strings;
  } else {
    const defaultKey = Object.keys(languages).find((k) => languages[k]?.isDefault) || "en";
    storefrontText = languages[defaultKey]?.strings || languages["en"]?.strings || {};
  }

  if (!normalizedShop) {
    return Response.json(
      {
        hasCustomizer: false,
        error: "Missing shop parameter",
        primaryColor,
        defaultDpi,
        settings: { primaryColor, defaultDpi },
        storefrontText,
        languages,
      },
      { headers: corsHeaders },
    );
  }

  const template = await getTemplateForProduct(normalizedShop, productId);

  if (!template) {
    return Response.json(
      {
        hasCustomizer: false,
        message: "No template assigned to this product",
        primaryColor,
        defaultDpi,
        settings: { primaryColor, defaultDpi },
        storefrontText,
        languages,
      },
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
      primaryColor,
      defaultDpi,
      settings: { primaryColor, defaultDpi },
      storefrontText,
      languages,
      template: {
        id: template.id,
        title: template.title,
        canvasWidth: template.canvasWidth || 1200,
        canvasHeight: template.canvasHeight || 1200,
        printDpi: template.printDpi || defaultDpi || 300,
        layers: parsedLayers,
        optionGroups: template.optionGroups || [],
      },
    },
    { headers: corsHeaders },
  );
};
