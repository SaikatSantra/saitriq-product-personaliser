import prisma from "../db.server";
import { ensureShop } from "./shop.server";

export interface CreateTemplateInput {
  title: string;
  canvasWidth?: number;
  canvasHeight?: number;
  printDpi?: number;
  layersJson?: string;
}

export interface UpdateTemplateInput {
  title?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  printDpi?: number;
  layersJson?: string;
  optionGroups?: Array<{
    id?: string;
    name: string;
    displayType: string;
    position: number;
    conditionalRules?: string;
    options?: Array<{
      id?: string;
      label: string;
      priceExtra?: number;
      metadata?: string;
    }>;
  }>;
}

export async function listTemplates(shopifyDomain: string) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.template.findMany({
    where: { shopId: shop.id },
    include: {
      products: true,
      optionGroups: {
        include: {
          options: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplate(id: string, shopifyDomain: string) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.template.findFirst({
    where: {
      id,
      shopId: shop.id,
    },
    include: {
      products: true,
      optionGroups: {
        orderBy: { position: "asc" },
        include: {
          options: true,
        },
      },
    },
  });
}

export async function createTemplate(
  shopifyDomain: string,
  data: CreateTemplateInput,
) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.template.create({
    data: {
      shopId: shop.id,
      title: data.title || "Untitled Template",
      canvasWidth: data.canvasWidth || 1200,
      canvasHeight: data.canvasHeight || 1200,
      printDpi: data.printDpi || 300,
      layersJson: data.layersJson || JSON.stringify([]),
    },
  });
}

export async function updateTemplate(
  id: string,
  shopifyDomain: string,
  data: UpdateTemplateInput,
) {
  const shop = await ensureShop(shopifyDomain);

  // Verify ownership
  const existing = await prisma.template.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!existing) {
    throw new Error("Template not found or unauthorized");
  }

  // Update base template fields
  const updated = await prisma.template.update({
    where: { id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.canvasWidth ? { canvasWidth: data.canvasWidth } : {}),
      ...(data.canvasHeight ? { canvasHeight: data.canvasHeight } : {}),
      ...(data.printDpi ? { printDpi: data.printDpi } : {}),
      ...(data.layersJson ? { layersJson: data.layersJson } : {}),
      updatedAt: new Date(),
    },
  });

  // If option groups are supplied, sync them
  if (data.optionGroups) {
    // Delete existing option groups for this template and recreate with options
    await prisma.optionGroup.deleteMany({
      where: { templateId: id },
    });

    for (let i = 0; i < data.optionGroups.length; i++) {
      const og = data.optionGroups[i];
      await prisma.optionGroup.create({
        data: {
          templateId: id,
          name: og.name,
          displayType: og.displayType,
          position: og.position ?? i,
          conditionalRules: og.conditionalRules || "{}",
          options: {
            create: (og.options || []).map((opt) => ({
              label: opt.label,
              priceExtra: opt.priceExtra || 0.0,
              metadata: opt.metadata || "{}",
            })),
          },
        },
      });
    }
  }

  return updated;
}

export async function deleteTemplate(id: string, shopifyDomain: string) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.template.deleteMany({
    where: {
      id,
      shopId: shop.id,
    },
  });
}

export async function duplicateTemplate(id: string, shopifyDomain: string) {
  const original = await getTemplate(id, shopifyDomain);
  if (!original) throw new Error("Template not found");

  const copy = await prisma.template.create({
    data: {
      shopId: original.shopId,
      title: `${original.title} (Copy)`,
      canvasWidth: original.canvasWidth,
      canvasHeight: original.canvasHeight,
      printDpi: original.printDpi,
      layersJson: original.layersJson,
      optionGroups: {
        create: original.optionGroups.map((og) => ({
          name: og.name,
          displayType: og.displayType,
          position: og.position,
          conditionalRules: og.conditionalRules,
          options: {
            create: og.options.map((opt) => ({
              label: opt.label,
              priceExtra: opt.priceExtra,
              metadata: opt.metadata,
            })),
          },
        })),
      },
    },
  });

  return copy;
}

export async function assignProductsToTemplate(
  templateId: string,
  shopifyDomain: string,
  shopifyProductIds: string[],
) {
  const shop = await ensureShop(shopifyDomain);

  // 1. Remove previous products assigned to this template
  await prisma.product.deleteMany({
    where: {
      shopId: shop.id,
      templateId,
    },
  });

  // 2. Clean up any orphaned records with null templateId
  await prisma.product.deleteMany({
    where: {
      shopId: shop.id,
      templateId: null,
    },
  });

  // 3. Create fresh associations
  if (shopifyProductIds.length > 0) {
    // Collect normalized GID format (e.g. gid://shopify/Product/12345)
    const uniqueIds = Array.from(
      new Set(
        shopifyProductIds.map((pId) =>
          pId.includes("Product/") ? pId : `gid://shopify/Product/${pId}`,
        ),
      ),
    );

    // Delete any previous associations for these specific products to avoid duplicates
    await prisma.product.deleteMany({
      where: {
        shopId: shop.id,
        shopifyProductId: { in: uniqueIds },
      },
    });

    await prisma.product.createMany({
      data: uniqueIds.map((pId) => ({
        shopId: shop.id,
        shopifyProductId: pId,
        templateId,
        isActive: true,
      })),
    });
  }

  return true;
}
