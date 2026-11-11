# Step-by-Step Development & Execution Plan (`_plan.md`)

## Phase 1: Core Setup & Auth (Weeks 1–2)
* Setup Next.js + NestJS monorepo (Turborepo).
* Implement Shopify OAuth 2.0 with Session Tokens and Shopify App Bridge v4.
* Configure PostgreSQL schema and Prisma / TypeORM migration scripts.

## Phase 2: Merchant Template Studio (Weeks 3–4)
* Develop Polaris admin UI for canvas template management.
* Build Fabric.js visual layout tool for defining print bounds, dpi settings, and layer stacks.
* Store template layer configurations into PostgreSQL `templates` table.

## Phase 3: Storefront Widget & Canvas Engine (Weeks 5–6)
* Build Theme App Extension web component (`customizer-widget.js`).
* Connect client-side Fabric.js editor with dynamic JSON template loaded from backend.
* Implement custom font loader, swatches, and image upload modules.

## Phase 4: Order Pipeline & Webhooks (Week 7)
* Attach customization IDs and preview images to Shopify line item properties.
* Construct `orders/create` webhook listener in NestJS backend.
* Setup Redis BullMQ queue for rendering tasks.

## Phase 5: High-Res (300 DPI) Render Worker & AI (Weeks 8–9)
* Build headless Fabric.js / Puppeteer render cluster to output 300 DPI print PDFs.
* Connect background removal (Rembg) and AI image filter pipelines.
* Integrate AWS S3 storage for final asset delivery.

## Phase 6: POD Automation & Launch (Week 10)
* Integrate Printful / Printify APIs for automatic order routing.
* Perform load testing (Simultaneous storefront renders & webhook handling).
* Final security audit & Submit to Shopify App Store.
