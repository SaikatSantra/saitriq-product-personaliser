import prisma from "../db.server";
import { ensureShop } from "./shop.server";

export async function getTemplateForProduct(shopifyDomain: string, rawProductId: string) {
  if (!shopifyDomain || !rawProductId) return null;
  const shop = await ensureShop(shopifyDomain);

  // Normalize ID: handle both numeric "9876543210" and GID "gid://shopify/Product/9876543210"
  const cleanId = rawProductId.includes("Product/")
    ? rawProductId
    : `gid://shopify/Product/${rawProductId}`;
  const numericId = rawProductId.replace(/\D/g, "");

  const idConditions = [{ shopifyProductId: rawProductId }];
  if (cleanId && cleanId !== rawProductId) {
    idConditions.push({ shopifyProductId: cleanId });
  }
  if (numericId && numericId !== rawProductId && numericId !== cleanId) {
    idConditions.push({ shopifyProductId: numericId });
  }

  const product = await prisma.product.findFirst({
    where: {
      shopId: shop.id,
      isActive: true,
      templateId: { not: null },
      OR: idConditions,
    },
    select: {
      templateId: true,
    },
  });

  const templateId = product?.templateId;

  if (templateId) {
    const template = await prisma.template.findFirst({
      where: { id: templateId, shopId: shop.id },
      include: {
        optionGroups: {
          orderBy: { position: "asc" },
          include: {
            options: true,
          },
        },
      },
    });
    if (template) return template;
  }

  // If this product does not have an active linked template, return null
  return null;
}
