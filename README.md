# Shopify Real-Time Product Personalization & POD SaaS App

This repository contains the architecture, documentation, database schemas, sequence flows, UI specifications, LLM integration specs, and development plans for building a production-ready Shopify Product Personalization app (comparable to Customily and Teeinblue).

## 📄 File Directory

* [`_prd.md`](./_prd.md) — Product Requirements Document (Scope, Features, Personas, Epics)
* [`_TRD.md`](./_TRD.md) — Technical Requirements Document (Architecture, Tech Stack, Scalability, Webhooks)
* [`_DB.md`](./_DB.md) — Database Schema Design (PostgreSQL Multi-tenant Schema & Redis Caching)
* [`_Flow.md`](./_Flow.md) — System Sequence & User Flows (Storefront, Cart, Webhooks, Rendering Pipeline)
* [`_UI.md`](./_UI.md) — User Interface Architecture (Polaris Admin Dashboard, Storefront Widget, Canvas Editor)
* [`_LLM.md`](./_LLM.md) — LLM & AI Processing Specifications (Background Removal, Face Cut-outs, Generative AI)
* [`_plan.md`](./_plan.md) — Step-by-Step Development & Implementation Plan (Phased Roadmap & Milestones)
* [`_memory.json`](./_memory.json) — Agent Memory & State Protocol for Continuous Development & Modification Tracking

---

## 🚀 Key Architectural Highlights

1. **Multi-Tenant Shopify Integration:** OAuth 2.0 with App Bridge v4, Session Tokens, and Theme App Extensions (`app block`).
2. **Real-time Storefront Rendering:** Fabric.js canvas editor injected into Online Store 2.0 with sub-100ms update latencies.
3. **High-Res Server-Side Rendering:** Asynchronous Node.js / Puppeteer worker cluster generating 300 DPI print-ready PDF/PNG output upon checkout.
