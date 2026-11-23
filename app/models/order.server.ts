import prisma from "../db.server";
import { ensureShop } from "./shop.server";

export async function listCustomizedOrders(shopifyDomain: string) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.customizedOrder.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getCustomizedOrder(id: string, shopifyDomain: string) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.customizedOrder.findFirst({
    where: { id, shopId: shop.id },
  });
}

export async function createCustomizedOrder(
  shopifyDomain: string,
  data: {
    shopifyOrderId: string;
    shopifyLineItemId: string;
    customerSelections: string;
    previewImageUrl: string;
    printFileUrl?: string;
  },
) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.customizedOrder.create({
    data: {
      shopId: shop.id,
      shopifyOrderId: data.shopifyOrderId,
      shopifyLineItemId: data.shopifyLineItemId,
      customerSelections: data.customerSelections,
      previewImageUrl: data.previewImageUrl,
      printFileUrl: data.printFileUrl || null,
      fulfillmentStatus: "pending",
    },
  });
}

export async function updateCustomizedOrderStatus(
  id: string,
  shopifyDomain: string,
  status: string,
  printFileUrl?: string,
) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.customizedOrder.updateMany({
    where: { id, shopId: shop.id },
    data: {
      fulfillmentStatus: status,
      ...(printFileUrl ? { printFileUrl } : {}),
    },
  });
}

export async function updateCustomizedOrderPreview(
  id: string,
  shopifyDomain: string,
  previewImageUrl: string,
  customerSelections?: string,
) {
  const shop = await ensureShop(shopifyDomain);
  return await prisma.customizedOrder.updateMany({
    where: { id, shopId: shop.id },
    data: {
      previewImageUrl,
      ...(customerSelections ? { customerSelections } : {}),
    },
  });
}

export async function deleteCustomizedOrder(
  shopifyDomain: string,
  options: { id?: string; shopifyOrderId?: string; lineItemId?: string },
) {
  const shop = await ensureShop(shopifyDomain);

  // 1. Delete from database
  if (options.id) {
    await prisma.customizedOrder.deleteMany({
      where: { id: options.id, shopId: shop.id },
    });
  }
  if (options.shopifyOrderId) {
    const rawId = options.shopifyOrderId.replace(/\D/g, "");
    await prisma.customizedOrder.deleteMany({
      where: {
        shopId: shop.id,
        OR: [
          { shopifyOrderId: options.shopifyOrderId },
          { shopifyOrderId: rawId },
          { shopifyOrderId: `#${rawId}` },
        ],
        ...(options.lineItemId ? { shopifyLineItemId: options.lineItemId } : {}),
      },
    });
  }

  // 2. Add to hidden keys in shop settings so live GraphQL query does not restore it
  let settings: any = {};
  try {
    settings = JSON.parse(shop.settings || "{}");
  } catch {}

  const hidden: string[] = settings.hiddenOrderKeys || [];
  const keysToAdd: string[] = [];
  if (options.id) keysToAdd.push(options.id);
  if (options.shopifyOrderId) {
    const rawId = options.shopifyOrderId.replace(/\D/g, "");
    if (options.lineItemId) {
      keysToAdd.push(`${options.shopifyOrderId}_${options.lineItemId}`);
      keysToAdd.push(`${rawId}_${options.lineItemId}`);
      keysToAdd.push(`#${rawId}_${options.lineItemId}`);
    } else {
      keysToAdd.push(options.shopifyOrderId);
      keysToAdd.push(rawId);
    }
  }

  const updatedHidden = Array.from(new Set([...hidden, ...keysToAdd]));
  settings.hiddenOrderKeys = updatedHidden;

  await prisma.shop.update({
    where: { id: shop.id },
    data: { settings: JSON.stringify(settings) },
  });

  return { success: true };
}
