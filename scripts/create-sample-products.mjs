import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE_PRODUCTS = [
  {
    title: "Custom Classic T-Shirt",
    bodyHtml: "<p>Premium 100% cotton custom printed t-shirt. Personalize with your own text, photos, and artwork.</p>",
    productType: "Apparel",
    vendor: "Saitriq Customizer",
    tags: ["customizable", "t-shirt", "personalizer"],
    variants: [
      { price: "24.99", sku: "TSHIRT-BLK-S", optionValues: [{ name: "Size", value: "S" }] },
      { price: "24.99", sku: "TSHIRT-BLK-M", optionValues: [{ name: "Size", value: "M" }] },
      { price: "24.99", sku: "TSHIRT-BLK-L", optionValues: [{ name: "Size", value: "L" }] },
      { price: "24.99", sku: "TSHIRT-BLK-XL", optionValues: [{ name: "Size", value: "XL" }] },
    ],
  },
  {
    title: "Custom Ceramic Coffee Mug",
    bodyHtml: "<p>High-grade ceramic glossy mug. Dishwasher and microwave safe. Upload your custom photo or text.</p>",
    productType: "Drinkware",
    vendor: "Saitriq Customizer",
    tags: ["customizable", "mug", "personalizer"],
    variants: [
      { price: "16.99", sku: "MUG-11OZ", optionValues: [{ name: "Size", value: "11oz" }] },
      { price: "19.99", sku: "MUG-15OZ", optionValues: [{ name: "Size", value: "15oz" }] },
    ],
  },
  {
    title: "Custom Canvas Wall Art",
    bodyHtml: "<p>Gallery quality stretched canvas print on solid wooden frame. High-resolution 300 DPI output.</p>",
    productType: "Home Decor",
    vendor: "Saitriq Customizer",
    tags: ["customizable", "canvas", "personalizer"],
    variants: [
      { price: "39.99", sku: "CANVAS-12X16", optionValues: [{ name: "Size", value: "12x16 in" }] },
      { price: "59.99", sku: "CANVAS-18X24", optionValues: [{ name: "Size", value: "18x24 in" }] },
    ],
  },
];

async function main() {
  console.log("Looking for active Shopify session in database...");
  const session = await prisma.session.findFirst({
    where: { isOnline: false },
    orderBy: { expires: "desc" },
  }) || await prisma.session.findFirst({
    orderBy: { expires: "desc" },
  });

  if (!session || !session.accessToken) {
    console.error("No active session found with an access token in prisma dev.sqlite.");
    process.exit(1);
  }

  const shopDomain = session.shop;
  const accessToken = session.accessToken;
  console.log(`Found session for ${shopDomain}. Creating sample products via Shopify Admin API...`);

  // Ensure Shop in DB
  const shop = await prisma.shop.upsert({
    where: { shopifyDomain: shopDomain },
    update: { accessToken, updatedAt: new Date() },
    create: {
      shopifyDomain: shopDomain,
      accessToken,
      planName: "development",
      settings: JSON.stringify({ defaultDpi: 300 }),
    },
  });

  // Ensure at least one default Template in DB
  let template = await prisma.template.findFirst({
    where: { shopId: shop.id },
  });

  if (!template) {
    template = await prisma.template.create({
      data: {
        shopId: shop.id,
        title: "Standard T-Shirt & Merch Template",
        canvasWidth: 1200,
        canvasHeight: 1200,
        printDpi: 300,
        layersJson: JSON.stringify([
          {
            type: "i-text",
            text: "Your Custom Text Here",
            left: 250,
            top: 200,
            fontFamily: "Roboto",
            fontSize: 60,
            fill: "#111111",
            name: "Headline Text",
            isCustomerEditable: true,
            optionLabel: "Enter Your Text",
            maxCharacters: 30,
          },
          {
            type: "rect",
            left: 300,
            top: 400,
            width: 600,
            height: 500,
            fill: "rgba(0, 128, 255, 0.15)",
            stroke: "#0080ff",
            strokeDashArray: [10, 10],
            strokeWidth: 4,
            name: "Photo Upload Area",
            customType: "image_upload",
            isCustomerEditable: true,
            optionLabel: "Upload Photo",
            enableAiBackgroundRemoval: true,
          },
        ]),
      },
    });
    console.log(`Created default template: "${template.title}" (ID: ${template.id})`);
  } else {
    console.log(`Using existing template: "${template.title}" (ID: ${template.id})`);
  }

  const createdProductIds = [];

  for (const p of SAMPLE_PRODUCTS) {
    const query = `#graphql
      mutation createProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const res = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: {
          product: {
            title: p.title,
            descriptionHtml: p.bodyHtml,
            productType: p.productType,
            vendor: p.vendor,
            tags: p.tags,
            status: "ACTIVE",
          },
        },
      }),
    });

    const json = await res.json();
    if (json.data?.productCreate?.product) {
      const prod = json.data.productCreate.product;
      console.log(`✔ Created product: "${prod.title}" (ID: ${prod.id})`);
      createdProductIds.push(prod.id);
    } else {
      console.error(`Failed to create product "${p.title}":`, json.errors || json.data?.productCreate?.userErrors);
    }
  }

  // Link products to template in DB
  if (createdProductIds.length > 0 && template) {
    for (const pId of createdProductIds) {
      await prisma.product.upsert({
        where: { id: pId },
        update: {
          templateId: template.id,
          isActive: true,
        },
        create: {
          shopId: shop.id,
          shopifyProductId: pId,
          templateId: template.id,
          isActive: true,
        },
      }).catch(async () => {
        // Fallback create
        await prisma.product.create({
          data: {
            shopId: shop.id,
            shopifyProductId: pId,
            templateId: template.id,
            isActive: true,
          },
        });
      });
    }
    console.log(`✔ Linked all ${createdProductIds.length} products to template "${template.title}"!`);
  }

  console.log("\n🎉 Finished generating sample products!");
}

main()
  .catch((e) => {
    console.error("Execution failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
