export const PLAN_FREE = "Free";
export const PLAN_STARTER = "Starter";
export const PLAN_UNLIMITED = "Unlimited";

export interface PlanConfig {
  id: string;
  name: string;
  price: number;
  templateLimit: number;
  description: string;
  badge?: string;
  features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  [PLAN_FREE]: {
    id: PLAN_FREE,
    name: "Free Plan",
    price: 0,
    templateLimit: 2,
    description: "Great for testing and single product personalization stores.",
    features: [
      "Up to 2 Personalization Templates",
      "Full Visual Studio (Text & Photo layers)",
      "Multi-side Customization (Front & Back)",
      "300 DPI High-Resolution Print Output",
      "Unlimited Storefront Custom Orders",
      "Standard Community Support",
    ],
  },
  [PLAN_STARTER]: {
    id: PLAN_STARTER,
    name: "Starter Plan",
    price: 5,
    templateLimit: 5,
    description: "Ideal for growing shops offering multiple custom products.",
    badge: "Most Popular",
    features: [
      "Up to 5 Personalization Templates",
      "Everything in Free Plan",
      "Multi-Language Storefront Translations",
      "High-Performance Canvas Rendering",
      "Priority Email Support",
    ],
  },
  [PLAN_UNLIMITED]: {
    id: PLAN_UNLIMITED,
    name: "Unlimited Plan",
    price: 20,
    templateLimit: Infinity,
    description: "Unlimited scale for power merchants and print-on-demand brands.",
    badge: "Best Value",
    features: [
      "Unlimited Personalization Templates",
      "Everything in Starter Plan",
      "Unlimited Products & Variants Linked",
      "Dedicated High-Speed Rendering",
      "24/7 Priority Support",
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
