import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`[Compliance] Received ${topic} request for ${shop}`);

  // In a public app, fulfill or acknowledge the customer data request
  return new Response(null, { status: 200 });
};
