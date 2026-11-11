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
    select: {
      templateId: true,
    },
  });

  const templateId = product?.templateId;

  if (templateId) {
    const template = await prisma.template.findUnique({
      where: { id: templateId },
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

  // Fallback: If no explicit assignment, use the shop's most recent template so customization always works
  const defaultTemplate = await prisma.template.findFirst({
    where: {
      shopId: shop.id,
    },
    include: {
      optionGroups: {
        orderBy: { position: "asc" },
        include: {
          options: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return defaultTemplate || null;
}
