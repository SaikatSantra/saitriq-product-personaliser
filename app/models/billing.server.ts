import prisma from "../db.server";
import { ensureShop } from "./shop.server";
import {
  PLAN_FREE,
  PLAN_STARTER,
  PLAN_UNLIMITED,
  PLANS,
  type ShopBillingInfo,
} from "./billing.types";

export * from "./billing.types";

/**
 * Retrieves the current shop's plan, checks live Shopify billing subscriptions,
 * syncs local database state, and evaluates template quotas.
 */
export async function getShopBillingInfo(
  shopifyDomain: string,
  billingContext?: any,
): Promise<ShopBillingInfo> {
  const shop = await ensureShop(shopifyDomain);

  let activePlan = PLAN_FREE;
  let activeSubscription: any = null;

  // 1. Check live Shopify Subscriptions via billing context
  if (billingContext && typeof billingContext.check === "function") {
    try {
      const checkResult = await billingContext.check({
        plans: [PLAN_UNLIMITED, PLAN_STARTER],
        isTest: process.env.NODE_ENV !== "production",
      });

      if (checkResult && checkResult.hasActivePayment) {
        const sub = checkResult.appSubscriptions?.[0];
        if (sub) {
          activeSubscription = sub;
          const subName = (sub.name || "").toLowerCase();
          if (subName.includes("unlimited")) {
            activePlan = PLAN_UNLIMITED;
          } else if (subName.includes("starter") || subName.includes("5")) {
            activePlan = PLAN_STARTER;
          }
        }
      }
    } catch (err) {
      console.warn("[Billing] Could not check Shopify subscriptions:", err);
    }
  }

  // 2. Fallback to local DB plan if not active on Shopify (e.g. manual grant or offline)
  if (activePlan === PLAN_FREE && shop.planName && shop.planName !== "trial" && shop.planName !== "Free") {
    if (PLANS[shop.planName]) {
      activePlan = shop.planName;
    }
  }

  // 3. Keep local DB planName in sync
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
