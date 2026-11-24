import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function IndexLandingPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.container}>
      {/* Top Navbar */}
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <div className={styles.logoBadge}>🎨</div>
          <div>
            <h1 className={styles.brandName}>Saitriq Product Personaliser</h1>
          </div>
        </div>
        <nav className={styles.headerNav}>
          <a href="#features" className={styles.headerLink}>
            Features
          </a>
          <a href="#pricing" className={styles.headerLink}>
            Plans & Pricing
          </a>
          <a href="#workflow" className={styles.headerLink}>
            How It Works
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.pill}>
          <span>✨ Print-Ready Personalization Studio for Shopify</span>
        </div>
        <h1 className={styles.heroTitle}>
          Empower Shoppers to Personalize Products in Real Time
        </h1>
        <p className={styles.heroSubtitle}>
          Interactive dual-side 2D & 3D visual studio with customizable text, custom fonts, 
          photo upload dropzones, color variant syncing, and automated 300 DPI production-ready print files.
        </p>

        {/* Store Installation Form */}
        {showForm && (
          <div className={styles.installCard}>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>Enter your Shopify store domain to get started:</span>
                <div className={styles.inputGroup}>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="my-shop"
                    required
                  />
                  <span className={styles.domainSuffix}>.myshopify.com</span>
                </div>
              </label>
              <button className={styles.button} type="submit">
                Install App on Shopify →
              </button>
              <p className={styles.hint}>
                Free plan available • No credit card required to install • 100% theme app block compatible
              </p>
            </Form>
          </div>
        )}
      </section>

      {/* Features Grid */}
      <section id="features" className={styles.featuresSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Built for High-Converting Custom Merch Stores</h2>
          <p className={styles.sectionSubtitle}>
            Everything merchants need to offer personalized products without complex setup or manual design work.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>👕</span>
            <h3 className={styles.featureTitle}>Dual-Side Visual Studio</h3>
            <p className={styles.featureDesc}>
              Allows customers to switch effortlessly between Front and Back design views with editable text, custom fonts, color swatches, and photo upload areas.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🎨</span>
            <h3 className={styles.featureTitle}>Variant & Color Syncing</h3>
            <p className={styles.featureDesc}>
              Matches background mockups to Shopify product color swatches and variant images in real time, preventing mismatched apparel views.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🖨️</span>
            <h3 className={styles.featureTitle}>300 DPI Print Fulfillment</h3>
            <p className={styles.featureDesc}>
              Automatically renders high-resolution 300 DPI print-ready production assets (PDF & PNG) linked directly to order line items for streamlined printing.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🧩</span>
            <h3 className={styles.featureTitle}>Zero-Code Theme Block</h3>
            <p className={styles.featureDesc}>
              Native Shopify Online Store 2.0 app block. Add to your product page with a single click in the Shopify Theme Editor without modifying theme code.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className={styles.pricingSection}>
        <div className={styles.pricingInner}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Simple, Transparent Monthly Pricing</h2>
            <p className={styles.sectionSubtitle}>
              Billed through official Shopify Billing with 30-day recurring cycles, automatic proration, and zero long-term commitments.
            </p>
          </div>

          <div className={styles.pricingGrid}>
            <div className={styles.pricingCard}>
              <h3 className={styles.planName}>Free Tier</h3>
              <div className={styles.planPrice}>
                $0 <span className={styles.planInterval}>/ 30 days</span>
              </div>
              <p className={styles.planDesc}>Perfect for testing and stores getting started with custom products.</p>
              <ul className={styles.planFeatures}>
                <li>✓ Up to 2 active product templates</li>
                <li>✓ Full dual-side visual customizer</li>
                <li>✓ Front & back text and photo uploads</li>
                <li>✓ Real-time storefront preview</li>
                <li>✓ Standard order fulfillment review</li>
              </ul>
            </div>

            <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
              <div className={styles.pricingBadge}>Most Popular</div>
              <h3 className={styles.planName}>Starter Plan</h3>
              <div className={styles.planPrice}>
                $5 <span className={styles.planInterval}>/ 30 days</span>
              </div>
              <p className={styles.planDesc}>Designed for growing stores with a focused line of customized merchandise.</p>
              <ul className={styles.planFeatures}>
                <li>✓ Up to 5 active product templates</li>
                <li>✓ Automated 300 DPI print-ready renders</li>
                <li>✓ Front & back multi-layer canvas</li>
                <li>✓ Shopify Files asset storage</li>
                <li>✓ Standard email & merchant support</li>
              </ul>
            </div>

            <div className={styles.pricingCard}>
              <h3 className={styles.planName}>Unlimited Plan</h3>
              <div className={styles.planPrice}>
                $20 <span className={styles.planInterval}>/ 30 days</span>
              </div>
              <p className={styles.planDesc}>Maximum scale for high-volume apparel, print shops, and custom brands.</p>
              <ul className={styles.planFeatures}>
                <li>✓ Unlimited active product templates</li>
                <li>✓ Automated 300 DPI production files</li>
                <li>✓ Priority background rendering queue</li>
                <li>✓ Complete catalog personalization</li>
                <li>✓ Priority merchant support</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.footerText}>
          © {new Date().getFullYear()} Saitriq Product Personaliser & Print Studio. All rights reserved.
        </p>
        <p className={styles.footerText} style={{ color: "#64748b", fontSize: "0.8rem" }}>
          Built for Shopify • Uses official Shopify Billing and App Bridge • GDPR & Privacy Compliant
        </p>
      </footer>
    </div>
  );
}
