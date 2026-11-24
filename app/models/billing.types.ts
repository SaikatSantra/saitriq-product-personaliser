export const PLAN_FREE = "Free";
export const PLAN_STARTER = "Starter";
export const PLAN_UNLIMITED = "Unlimited";

export interface PlanConfig {
  id: string;
  name: string;
  price: number;
  intervalText: string;
  templateLimit: number;
  description: string;
  badge?: string;
  features: string[];
  highlights: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  [PLAN_FREE]: {
    id: PLAN_FREE,
    name: "Free",
    price: 0,
    intervalText: "Free forever",
    templateLimit: 2,
    description: "Ideal for new merchants testing product personalization on up to 2 products.",
    highlights: ["2 active templates", "Free forever", "No credit card required"],
    features: [
      "Up to 2 active personalization templates",
      "Full interactive visual studio for front & back sides",
      "Text personalization with curated fonts & colors",
      "Customer image/photo uploads with crop & zoom",
      "300 DPI high-resolution print output files",
      "Live cart preview & customized order line properties",
      "Standard community & documentation support",
    ],
  },
  [PLAN_STARTER]: {
    id: PLAN_STARTER,
    name: "Starter",
    price: 5,
    intervalText: "Billed $5/month (recurring every 30 days)",
    templateLimit: 5,
    description: "Perfect for growing stores expanding their customized product catalog.",
    badge: "Most Popular",
    highlights: ["5 active templates", "Recurring monthly", "Cancel anytime"],
    features: [
      "Up to 5 active personalization templates",
      "Everything included in the Free plan",
      "Unlimited customer orders & custom transactions",
      "Multi-variant product assignment & color variants",
      "High-resolution 300 DPI production PDF & PNG exports",
      "Multi-language storefront customization texts",
      "Priority email support",
    ],
  },
  [PLAN_UNLIMITED]: {
    id: PLAN_UNLIMITED,
    name: "Unlimited",
    price: 20,
    intervalText: "Billed $20/month (recurring every 30 days)",
    templateLimit: Infinity,
    description: "Maximum scale for established print-on-demand brands & high-volume merchants.",
    badge: "Best Value",
    highlights: ["Unlimited templates", "Recurring monthly", "VIP 24/7 support"],
    features: [
      "Unlimited active personalization templates (no limits)",
      "Everything included in the Starter plan",
      "Unlimited products & variants linked across store",
      "Ultra-fast high-res 300 DPI print rendering engine",
      "Dedicated print-ready production files storage",
      "All future template studio features & updates included",
      "24/7 VIP priority support & personalized onboarding",
    ],
  },
};

export interface ShopBillingInfo {
  activePlan: string;
  planConfig: PlanConfig;
  currentTemplateCount: number;
  templateLimit: number;
  canCreateMore: number | boolean;
  activeSubscription: any | null;
}
