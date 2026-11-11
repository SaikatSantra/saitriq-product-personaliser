# User Interface & Frontend Architecture (`_UI.md`)

## 1. Storefront Widget Embed
* **Framework:** Preact / Web Components (isolated shadow DOM to avoid theme CSS collisions).
* **Components:**
  * `CanvasPreview`: Fabric.js dynamic canvas wrapper with zoom/pan controls.
  * `TextOptionGroup`: Font selector, size slider, color picker, curved text toggle.
  * `UploadOptionGroup`: File dropzone, crop modal, automatic DPI validation warning.
  * `ClipartPicker`: Categorized grid with live search filter.

## 2. Merchant Admin Dashboard (Embedded Shopify App)
* **Framework:** React / Next.js with `@shopify/polaris`.
* **Views:**
  * `TemplateStudio`: Drag-and-drop workspace for setting up base products, printable regions, layer bounds, and overlay images.
  * `OptionRulesBuilder`: Visual logic builder for conditional form logic (e.g., IF option X IS SELECTED, SHOW layer Y).
  * `OrderDetailsView`: Visual audit screen allowing merchants to manually inspect, re-render, or edit customer custom orders before fulfillment.
