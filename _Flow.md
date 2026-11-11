# System Sequence & User Flows (`_Flow.md`)

## 1. End-to-End Execution Sequence Flow

```
[Shopper]              [Storefront Widget]        [Shopify Storefront]        [App Backend]         [Render Worker]
   │                            │                         │                         │                     │
   ├─► Opens Product Page ─────►│                         │                         │                     │
   │                            ├─► Fetch Config & Schema ─────────────────────────►│                     │
   │                            │◄── Return Template JSON ──────────────────────────┤                     │
   │                            │                                                   │                     │
   ├─► Enters Custom Text / ───►│ (Debounced Canvas Update)                             │                     │
   │   Uploads Image            │                                                   │                     │
   │                            │                                                   │                     │
   ├─► Clicks "Add to Cart" ────►│                                                   │                     │
   │                            ├─► Serialize Customization ───────────────────────►│                     │
   │                            │   Attributes & Upload Photo                       │                     │
   │                            │◄── Return Snapshot & Property Payload ────────────┤                     │
   │                            │                                                   │                     │
   │                            ├─► Submit Line Item Attributes ──►                 │                     │
   │                            │   (`_customization_id`, `_preview_url`)           │                     │
   │                                                      │                         │                     │
[Completes Checkout] ────────────────────────────────────►│                         │                     │
                                                          ├─► Webhook `orders/create`                     │
                                                          │   fired ───────────────►│                     │
                                                                                    ├─► Push Render Job ─►│
                                                                                    │   to BullMQ Queue   │
                                                                                                          ├─► Launch Fabric.js
                                                                                                          │   Headless Node
                                                                                                          ├─► Output 300 DPI PDF
                                                                                                          ├─► Upload to AWS S3
                                                                                    │◄── Job Complete ────┤
                                                                                    │
                                                                                    ├─► Update Order Meta fields
                                                                                    └─► Dispatch POD API
```
