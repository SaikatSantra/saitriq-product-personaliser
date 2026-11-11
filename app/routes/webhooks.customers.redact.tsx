import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[Compliance] Received ${topic} request for ${shop}`);

  // Redact customer personal identifiers if stored
  try {
    const customerOrders = payload.orders_to_redact || [];
    for (const orderId of customerOrders) {
      await prisma.customizedOrder.updateMany({
        where: { shopifyOrderId: String(orderId) },
        data: { customerSelections: "{}" },
      });
    }
  } catch (err) {
    console.error("[Compliance] Error redacting customer data:", err);
  }

  return new Response(null, { status: 200 });
};
