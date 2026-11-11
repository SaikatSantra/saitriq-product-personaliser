import prisma from "../db.server";
import { ensureShop } from "./shop.server";

export async function getTemplateForProduct(shopifyDomain: string, rawProductId: string) {
  const shop = await ensureShop(shopifyDomain);

  // Normalize ID: handle both numeric "9876543210" and GID "gid://shopify/Product/9876543210"
  const cleanId = rawProductId.includes("Product/")
    ? rawProductId
    : `gid://shopify/Product/${rawProductId}`;
  const numericId = rawProductId.replace(/\D/g, "");

  const product = await prisma.product.findFirst({
    where: {
      shopId: shop.id,
      isActive: true,
      OR: [
        { shopifyProductId: rawProductId },
        { shopifyProductId: cleanId },
        { shopifyProductId: numericId },
      ],
    },
    include: {
      template: {
        include: {
          optionGroups: {
            orderBy: { position: "asc" },
            include: {
              options: true,
            },
          },
        },
      },
    },
  });

  return product?.template || null;
}
