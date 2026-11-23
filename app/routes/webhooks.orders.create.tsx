import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  createCustomizedOrder,
  updateCustomizedOrderStatus,
} from "../models/order.server";
import { renderHighResPrintFile } from "../services/renderer.server";
import { uploadToShopifyFiles } from "../services/shopifyFiles.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin: webhookAdmin } = await authenticate.webhook(request);

  console.log(`[Webhook] Processing ${topic} for ${shop} (Order #${payload.id})`);

  let adminClient: any = webhookAdmin;
  if (!adminClient) {
    try {
      const unauth = await unauthenticated.admin(shop);
      adminClient = unauth.admin;
    } catch (unauthErr) {
      console.warn("[Webhook] Could not instantiate admin client for shop:", shop, unauthErr);
    }
  }

  const orderId = String(payload.id);
  const lineItems = payload.line_items || [];

  for (const item of lineItems) {
    const properties: Array<{ name: string; value: any }> = item.properties || [];
    const propsMap: Record<string, any> = {};
    properties.forEach((p) => {
      propsMap[p.name] = p.value;
    });

    // Check if this line item was customized
    if (
      propsMap._customization_id ||
      propsMap._template_id ||
      propsMap._customization_preview ||
      propsMap["Front Preview"] ||
      propsMap["Preview"]
    ) {
      console.log(
        `[Webhook] Found customized line item #${item.id} with customization ID: ${propsMap._customization_id}`
      );

      const rawFrontPreview =
        propsMap["_customization_preview_front"] ||
        propsMap["_customization_preview"] ||
        propsMap["Front Preview"] ||
        propsMap["Preview"] ||
        propsMap["Front Design Preview"] ||
        propsMap["Custom Design Preview"] ||
        "";

      const rawBackPreview =
        propsMap["_customization_preview_back"] ||
        propsMap["Back Preview"] ||
        propsMap["Back Design Preview"] ||
        "";

      const rawUploadedImage =
        propsMap["_uploaded_image_front"] ||
        propsMap["_uploaded_image"] ||
        propsMap["Front Uploaded Photo"] ||
        propsMap["Uploaded Photo"] ||
        propsMap["Front Uploaded Image"] ||
        propsMap["Uploaded Image"] ||
        "";

      const lineItemId = String(item.id);

      // Upload previews to Shopify Files (Shopify Admin Content > Files)
      let shopifyFrontUrl = "";
      let shopifyBackUrl = "";
      let shopifyUploadedUrl = "";

      if (adminClient) {
        if (rawFrontPreview) {
          try {
            const uploaded = await uploadToShopifyFiles(adminClient, {
              imageSource: rawFrontPreview,
              filename: `order_${orderId}_${lineItemId}_front.jpg`,
              alt: `Order #${orderId} Front Preview`,
            });
            if (uploaded) {
              shopifyFrontUrl = uploaded;
              propsMap["Front Preview"] = uploaded;
              propsMap["_customization_preview"] = uploaded;
              propsMap["_customization_preview_front"] = uploaded;
            }
          } catch (e) {
            console.warn("[Webhook] Error uploading front preview to Shopify Files:", e);
          }
        }

        if (rawBackPreview) {
          try {
            const uploaded = await uploadToShopifyFiles(adminClient, {
              imageSource: rawBackPreview,
              filename: `order_${orderId}_${lineItemId}_back.jpg`,
              alt: `Order #${orderId} Back Preview`,
            });
            if (uploaded) {
              shopifyBackUrl = uploaded;
              propsMap["Back Preview"] = uploaded;
              propsMap["_customization_preview_back"] = uploaded;
            }
          } catch (e) {
            console.warn("[Webhook] Error uploading back preview to Shopify Files:", e);
          }
        }

        if (rawUploadedImage) {
          try {
            const uploaded = await uploadToShopifyFiles(adminClient, {
              imageSource: rawUploadedImage,
              filename: `order_${orderId}_${lineItemId}_upload.jpg`,
              alt: `Order #${orderId} Uploaded Artwork`,
            });
            if (uploaded) {
              shopifyUploadedUrl = uploaded;
              propsMap["Uploaded Photo"] = uploaded;
              propsMap["_uploaded_image"] = uploaded;
            }
          } catch (e) {
            console.warn("[Webhook] Error uploading customer photo to Shopify Files:", e);
          }
        }
      }

      const finalPreviewUrl = shopifyFrontUrl || rawFrontPreview;

      // Create record in customized_orders
      const record = await createCustomizedOrder(shop, {
        shopifyOrderId: orderId,
        shopifyLineItemId: lineItemId,
        customerSelections: JSON.stringify(propsMap),
        previewImageUrl: finalPreviewUrl,
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
          previewBase64: finalPreviewUrl,
        });

        await updateCustomizedOrderStatus(record.id, shop, "completed", printPdfUrl);
        console.log(
          `[Renderer] Successfully generated 300 DPI print file for order #${orderId}: ${printPdfUrl}`
        );
      } catch (renderErr) {
        console.error(
          `[Renderer] Failed rendering 300 DPI print file for order #${orderId}:`,
          renderErr
        );
        await updateCustomizedOrderStatus(record.id, shop, "failed");
      }
    }
  }

  return new Response(null, { status: 200 });
};
