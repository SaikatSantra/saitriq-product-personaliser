import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createCustomizedOrder,
  updateCustomizedOrderStatus,
} from "../models/order.server";
import { renderHighResPrintFile } from "../services/renderer.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Processing ${topic} for ${shop} (Order #${payload.id})`);

  const orderId = String(payload.id);
  const lineItems = payload.line_items || [];

  for (const item of lineItems) {
    const properties: Array<{ name: string; value: any }> = item.properties || [];
    const propsMap: Record<string, any> = {};
    properties.forEach((p) => {
      propsMap[p.name] = p.value;
    });

    // Check if this line item was customized
    if (propsMap._customization_id || propsMap._template_id) {
      console.log(`[Webhook] Found customized line item #${item.id} with customization ID: ${propsMap._customization_id}`);

      const previewUrl = propsMap._customization_preview || "";
      const lineItemId = String(item.id);

      // Create record in customized_orders
      const record = await createCustomizedOrder(shop, {
        shopifyOrderId: orderId,
        shopifyLineItemId: lineItemId,
        customerSelections: JSON.stringify(propsMap),
        previewImageUrl: previewUrl,
      });

      // Asynchronously trigger 300 DPI high-res rendering
      try {
        const printPdfUrl = await renderHighResPrintFile({
          orderId,
          lineItemId,
          canvasWidth: 1200,
          canvasHeight: 1200,
          printDpi: 300,
          customerSelections: propsMap,
          previewBase64: previewUrl,
        });

        await updateCustomizedOrderStatus(record.id, shop, "completed", printPdfUrl);
        console.log(`[Renderer] Successfully generated 300 DPI print file for order #${orderId}: ${printPdfUrl}`);
      } catch (renderErr) {
        console.error(`[Renderer] Failed rendering 300 DPI print file for order #${orderId}:`, renderErr);
        await updateCustomizedOrderStatus(record.id, shop, "failed");
      }
    }
  }

  return new Response(null, { status: 200 });
};
