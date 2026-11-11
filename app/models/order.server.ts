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
