import prisma from "../db.server";
import { ensureShop } from "./shop.server";
import {
  PLAN_FREE,
  PLAN_STARTER,
  PLAN_UNLIMITED,
  PLANS,
  type ShopBillingInfo,
} from "./billing.types";

function resolvePlanFromSubscription(sub: any): string {
  const subName = (sub?.name || "").toLowerCase();
  if (subName.includes("unlimited")) {
    return PLAN_UNLIMITED;
  }
  if (subName.includes("starter")) {
    return PLAN_STARTER;
  }

  const priceAmount = Number(
    sub?.lineItems?.[0]?.plan?.pricingDetails?.price?.amount ?? 0,
  );
  if (priceAmount >= 20) {
    return PLAN_UNLIMITED;
  }
  if (priceAmount >= 5) {
    return PLAN_STARTER;
  }

  return PLAN_FREE;
}

/**
 * Fetches the app's handle from Shopify Admin API and builds the Managed App Pricing URL.
 */
export async function getManagedPricingUrl(
  shopifyDomain: string,
  adminContext?: any,
): Promise<string> {
  const storeHandle = shopifyDomain.replace(".myshopify.com", "");
  let appHandle = process.env.SHOPIFY_APP_HANDLE || "saitriq-product-personaliser";

  if (adminContext && typeof adminContext.graphql === "function") {
    try {
      const response = await adminContext.graphql(`
        query GetAppHandle {
          currentAppInstallation {
            app {
              handle
            }
          }
        }
      `);
      const json = await response.json();
      const fetchedHandle = json?.data?.currentAppInstallation?.app?.handle;
      if (fetchedHandle) {
        appHandle = fetchedHandle;
      }
    } catch (err) {
      console.warn("[Billing] Could not fetch app handle from Shopify:", err);
    }
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

/**
 * Retrieves the current shop's plan, checks live Shopify billing subscriptions
 * (compatible with Shopify App Pricing / Managed Pricing), syncs local database state,
 * and evaluates template quotas.
 */
export async function getShopBillingInfo(
  shopifyDomain: string,
  billingContext?: any,
  adminContext?: any,
): Promise<ShopBillingInfo> {
  const shop = await ensureShop(shopifyDomain);

  let activePlan = PLAN_FREE;
  let activeSubscription: any = null;
  let shopifyChecked = false;

  // 1. Prefer querying currentAppInstallation directly via Admin GraphQL (works for all Managed Pricing plan names)
  if (adminContext && typeof adminContext.graphql === "function") {
    try {
      const response = await adminContext.graphql(`
        query GetActiveSubscriptions {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              test
              currentPeriodEnd
              lineItems {
                id
                plan {
                  pricingDetails {
                    __typename
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `);
      const json = await response.json();
      const subs = json?.data?.currentAppInstallation?.activeSubscriptions;
      if (Array.isArray(subs)) {
        shopifyChecked = true;
        const activeSub = subs.find((s: any) => s.status === "ACTIVE") || subs[0];
        if (activeSub) {
          activeSubscription = activeSub;
          activePlan = resolvePlanFromSubscription(activeSub);
        }
      }
    } catch (err) {
      console.warn("[Billing] Could not query currentAppInstallation:", err);
    }
  }

  // 2. Fallback to billing.check() if adminContext was not provided
  if (!shopifyChecked && billingContext && typeof billingContext.check === "function") {
    try {
      const checkResult = await billingContext.check({
        plans: [PLAN_UNLIMITED, PLAN_STARTER],
        isTest: process.env.NODE_ENV !== "production",
      });
      shopifyChecked = true;

      if (checkResult && checkResult.hasActivePayment) {
        const sub = checkResult.appSubscriptions?.[0];
        if (sub) {
          activeSubscription = sub;
          activePlan = resolvePlanFromSubscription(sub);
        }
      }
    } catch (err) {
      console.warn("[Billing] Could not check Shopify subscriptions:", err);
    }
  }

  // 3. Fallback to local DB plan only if Shopify could not be queried
  if (!shopifyChecked && activePlan === PLAN_FREE && shop.planName && shop.planName !== "trial" && shop.planName !== "Free") {
    if (PLANS[shop.planName]) {
      activePlan = shop.planName;
    }
  }

  // 4. Keep local DB planName in sync with Shopify
  if (shop.planName !== activePlan) {
    try {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { planName: activePlan },
      });
    } catch {}
  }

  const currentTemplateCount = await prisma.template.count({
    where: { shopId: shop.id },
  });

  const planConfig = PLANS[activePlan] || PLANS[PLAN_FREE];
  const canCreateMore = currentTemplateCount < planConfig.templateLimit;

  return {
    activePlan,
    planConfig,
    currentTemplateCount,
    templateLimit: planConfig.templateLimit,
    canCreateMore,
    activeSubscription,
  };
}

/**
 * Cancels active Shopify app subscription and resets local shop plan to Free.
 */
export async function cancelShopSubscription(
  shopifyDomain: string,
  billingContext?: any,
): Promise<{ success: boolean; message: string }> {
  if (billingContext && typeof billingContext.check === "function") {
    try {
      const billingInfo = await getShopBillingInfo(shopifyDomain, billingContext);
      if (billingInfo.activeSubscription?.id) {
        await billingContext.cancel({
          subscriptionId: billingInfo.activeSubscription.id,
          isTest: process.env.NODE_ENV !== "production",
          prorate: true,
        });
      }
    } catch (e) {
      console.warn("[Billing] Error cancelling subscription with Shopify:", e);
    }
  }

  await prisma.shop.update({
    where: { shopifyDomain },
    data: { planName: PLAN_FREE },
  });

  return {
    success: true,
    message: "Subscription cancelled successfully. Your store is now on the Free plan.",
  };
}

/**
 * Updates shop plan in the local database (used for dev mode or direct plan grants).
 */
export async function updateShopPlanLocally(
  shopifyDomain: string,
  planName: string,
): Promise<{ success: boolean; message: string }> {
  await prisma.shop.update({
    where: { shopifyDomain },
    data: { planName },
  });

  return {
    success: true,
    message: `Plan updated to ${planName} successfully.`,
  };
}
