# Technical Requirements Document (TRD)

## 1. System Architecture Overview

```
 [Shopify Storefront] (Theme App Extension)
        │
        ▼ (App Bridge / REST API)
 [Node.js / Express / NestJS API Core] <───────> [PostgreSQL DB]
        │                                         [Redis Cache & PubSub]
        ▼ (Queue Jobs)
 [Asynchronous Render Workers] ───────────────> [AWS S3 / Cloudflare R2]
 (Puppeteer / Fabric.js Node)                     (Storage for Print Files)
```

## 2. Tech Stack Specification
* **Admin Dashboard:** Next.js 14 (App Router), Shopify Polaris UI components, Tailwind CSS, Zustand.
* **Storefront Customizer Engine:** Lightweight Preact / Vanilla JS Web Component (<60KB gzipped), Fabric.js (v5/v6) canvas SDK.
* **Backend Framework:** Node.js (NestJS) or Go (Fiber) for fast concurrency.
* **Database & Caching:** PostgreSQL 16 (Relational DB for multi-tenant data), Redis (Job queue, caching, rate limiting).
* **Storage:** AWS S3 or Cloudflare R2 for uploading user assets and saving high-res 300 DPI files.
* **Worker Cluster:** Dockerized headless Chrome / Node.js workers scaled across AWS ECS / Kubernetes.

## 3. Shopify API & Integration Requirements
* **Auth:** Session Tokens via Shopify App Bridge v4.
* **Theme Extensions:** App Block liquid templates (`blocks/customizer.liquid`).
* **Webhooks Subscribed:** `app/uninstalled`, `orders/create`, `orders/cancelled`, `products/delete`.
