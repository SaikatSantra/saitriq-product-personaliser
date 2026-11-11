/**
 * Print on Demand (POD) Automation Service
 * Connects with Printful and Printify APIs for automatic fulfillment routing.
 */

export interface PodOrderPayload {
  shopifyOrderId: string;
  recipient: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    province_code?: string;
    country_code: string;
    zip: string;
    phone?: string;
    email?: string;
  };
  items: Array<{
    sku?: string;
    quantity: number;
    printFileUrl: string;
    externalVariantId?: string;
  }>;
}

/**
 * Dispatches order to Printful API
 * Docs: https://developers.printful.com/docs/#operation/createOrder
 */
export async function dispatchToPrintful(
  apiKey: string,
  payload: PodOrderPayload,
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const printfulItems = payload.items.map((item) => ({
      sync_variant_id: item.externalVariantId ? parseInt(item.externalVariantId) : undefined,
      quantity: item.quantity,
      files: [
        {
          type: "default",
          url: item.printFileUrl,
        },
      ],
    }));

    const response = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        external_id: payload.shopifyOrderId,
        recipient: {
          name: payload.recipient.name,
          address1: payload.recipient.address1,
          address2: payload.recipient.address2,
          city: payload.recipient.city,
          state_code: payload.recipient.province_code,
          country_code: payload.recipient.country_code,
          zip: payload.recipient.zip,
          phone: payload.recipient.phone,
          email: payload.recipient.email,
        },
        items: printfulItems,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || `Printful HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      externalId: String(data.result?.id || ""),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reach Printful" };
  }
}

/**
 * Dispatches order to Printify API
 * Docs: https://developers.printify.com/#create-an-order
 */
export async function dispatchToPrintify(
  apiToken: string,
  shopId: string,
  payload: PodOrderPayload,
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const lineItems = payload.items.map((item) => ({
      print_provider_id: 1,
      blueprint_id: 1,
      variant_id: item.externalVariantId ? parseInt(item.externalVariantId) : 1,
      quantity: item.quantity,
      print_areas: {
        front: item.printFileUrl,
      },
    }));

    const response = await fetch(
      `https://api.printify.com/v1/shops/${shopId}/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          external_id: payload.shopifyOrderId,
          shipping_method: 1,
          send_shipping_notification: false,
          address_to: {
            first_name: payload.recipient.name.split(" ")[0] || "Customer",
            last_name: payload.recipient.name.split(" ").slice(1).join(" ") || "Name",
            email: payload.recipient.email,
            phone: payload.recipient.phone,
            country: payload.recipient.country_code,
            region: payload.recipient.province_code,
            address1: payload.recipient.address1,
            address2: payload.recipient.address2,
            city: payload.recipient.city,
            zip: payload.recipient.zip,
          },
          line_items: lineItems,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || `Printify HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      externalId: String(data.id || ""),
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reach Printify" };
  }
}
