import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`[Compliance] Received ${topic} request for ${shop}`);

  try {
    const existingShop = await prisma.shop.findUnique({
      where: { shopifyDomain: shop },
    });
    if (existingShop) {
      await prisma.shop.delete({
        where: { shopifyDomain: shop },
      });
    }
  } catch (err) {
    console.error("[Compliance] Error redacting shop data:", err);
  }

  return new Response(null, { status: 200 });
};
