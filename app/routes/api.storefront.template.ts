import type { LoaderFunctionArgs } from "react-router";
import { getTemplateForProduct } from "../models/product.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!shop || !productId) {
    return Response.json(
      { hasCustomizer: false, error: "Missing shop or productId parameter" },
      { headers: corsHeaders },
    );
  }

  const template = await getTemplateForProduct(shop, productId);

  if (!template) {
    return Response.json(
      { hasCustomizer: false, message: "No template assigned to this product" },
      { headers: corsHeaders },
    );
  }

  let parsedLayers = [];
  try {
    parsedLayers = JSON.parse(template.layersJson || "[]");
  } catch {
    parsedLayers = [];
  }

  return Response.json(
    {
      hasCustomizer: true,
      template: {
        id: template.id,
        title: template.title,
        canvasWidth: template.canvasWidth,
        canvasHeight: template.canvasHeight,
        printDpi: template.printDpi,
        layers: parsedLayers,
        optionGroups: template.optionGroups,
      },
    },
    { headers: corsHeaders },
  );
};
