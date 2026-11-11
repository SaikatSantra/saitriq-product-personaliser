import prisma from "../db.server";

export async function ensureShop(shopifyDomain: string, accessToken: string = "") {
  return await prisma.shop.upsert({
    where: { shopifyDomain },
    update: {
      ...(accessToken ? { accessToken } : {}),
      updatedAt: new Date(),
    },
    create: {
      shopifyDomain,
      accessToken,
      planName: "trial",
      settings: JSON.stringify({
        defaultDpi: 300,
        storageProvider: "local",
        enableAiBackgroundRemoval: true,
      }),
    },
  });
}

export async function getShop(shopifyDomain: string) {
  return await prisma.shop.findUnique({
    where: { shopifyDomain },
  });
}
