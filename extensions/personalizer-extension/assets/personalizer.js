/**
 * Saitriq Product Personalizer Storefront Web Component
 */
(function () {
  if (customElements.get("saitriq-personalizer")) return;

  class SaitriqPersonalizer extends HTMLElement {
    constructor() {
      super();
      this.templateData = null;
      this.fabricCanvas = null;
      this.activeTextLayer = null;
      this.activePhotoLayer = null;
      this.isLoading = false;
      this.pendingOpen = false;
    }

    async connectedCallback() {
      this.productId = this.getAttribute("data-product-id") || "";
      this.productTitle = this.getAttribute("data-product-title") || "";
      this.productImage = this.getAttribute("data-product-image") || "";
      this.shop = this.getAttribute("data-shop") || window.location.hostname;
      this.appUrl = this.getAttribute("data-app-url") || "";
      this.fabricUrl = this.getAttribute("data-fabric-url") || "";
      this.buttonText = this.getAttribute("data-button-text") || "🎨 Customize This Product";
      this.primaryColor = this.getAttribute("data-primary-color") || "#008060";
      this.autoOpen = this.getAttribute("data-auto-open") === "true";
      this.isDesignMode = this.getAttribute("data-design-mode") === "true" || window.Shopify?.designMode === true;

      this.variantsData = null;
      this.activeSelectedVariantId = null;
      const variantsScript = this.querySelector(".saitriq-variants-json");
      if (variantsScript) {
        try {
          this.variantsData = JSON.parse(variantsScript.textContent || "{}");
        } catch (e) {
          this.variantsData = null;
        }
      }

      // Track active variant changes from the product page (Dawn color swatches, dropdowns, etc.)
      const onVariantChange = () => {
        const newId = this.getSelectedVariantId();
        if (newId && newId !== this.activeSelectedVariantId) {
          this.activeSelectedVariantId = newId;
        }
      };

      document.addEventListener("change", (e) => {
        if (
          e.target &&
          (e.target.name === "id" ||
            e.target.closest("variant-radios") ||
            e.target.closest("variant-selects") ||
            e.target.closest('form[action*="/cart/add"]'))
        ) {
          onVariantChange();
        }
      });
      window.addEventListener("popstate", onVariantChange);

      this.style.setProperty("--saitriq-primary", this.primaryColor);

      // Bind to existing SSR button or create if missing
      this.btn = this.querySelector(".saitriq-customize-btn");
      if (!this.btn) {
        this.renderTriggerButton();
        this.btn = this.querySelector(".saitriq-customize-btn");
      }

      if (this.btn) {
        this.btn.addEventListener("click", () => this.handleTriggerClick());
      }

      await this.fetchTemplate();
    }

    getSelectedVariantId() {
      if (this.activeSelectedVariantId) return this.activeSelectedVariantId;

      // 1. Check form inputs
      const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
      if (formInput && formInput.value) return String(formInput.value);

      const anyId = document.querySelector('input[name="id"], select[name="id"]');
      if (anyId && anyId.value) return String(anyId.value);

      // 2. Check URL search param (?variant=...)
      const params = new URLSearchParams(window.location.search);
      const urlVariant = params.get("variant");
      if (urlVariant) return String(urlVariant);

      // 3. Check Shopify global analytics
      if (window.ShopifyAnalytics?.meta?.selectedVariantId) {
        return String(window.ShopifyAnalytics.meta.selectedVariantId);
      }

      return null;
    }

    getSelectedVariant() {
      if (!this.variantsData || !Array.isArray(this.variantsData.variants) || this.variantsData.variants.length === 0) {
        return null;
      }

      const variantId = this.getSelectedVariantId();
      if (variantId) {
        const match = this.variantsData.variants.find((v) => String(v.id) === String(variantId));
        if (match) return match;
      }

      return this.variantsData.variants[0] || null;
    }

    getSelectedVariantImage() {
      const selected = this.getSelectedVariant();
      if (selected && selected.image) {
        let img = selected.image;
        if (img.startsWith("//")) img = "https:" + img;
        return img;
      }

      // Check active gallery image from theme DOM (Dawn, Sense, etc.)
      const activeGalleryImg = document.querySelector(
        ".product__media-item.is-active img, .product__media-list .is-active img, .product-single__media.is-active img, .product__media img, [data-media-id] img"
      );
      if (activeGalleryImg) {
        const src = activeGalleryImg.currentSrc || activeGalleryImg.src;
        if (src && !src.includes("icon") && !src.includes("badge") && !src.includes("logo")) {
          return src;
        }
      }

      return this.detectPageProductImage();
    }

    detectPageProductImage() {
      if (this.productImage) return this.productImage;

      // Detect product image from storefront DOM (Dawn and OS 2.0 theme standards)
      const selectors = [
        ".product__media img",
        ".product-media img",
        ".product__main-photos img",
        ".product-single__photo",
        ".product-gallery img",
        "img[src*='/products/']",
      ];
      for (const sel of selectors) {
        const img = document.querySelector(sel);
        if (img && (img.currentSrc || img.src)) {
          const src = img.currentSrc || img.src;
          if (!src.includes("icon") && !src.includes("badge") && !src.includes("logo")) {
            return src;
          }
        }
      }
      return "";
    }

    async handleTriggerClick() {
      if (this.isLoading) {
        if (this.btn) this.btn.textContent = "⏳ Loading studio...";
        while (this.isLoading) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (this.btn) this.btn.textContent = this.buttonText;
      }

      if (!this.templateData) {
        if (this.btn) this.btn.textContent = "⏳ Fetching template...";
        await this.fetchTemplate();
        if (this.btn) this.btn.textContent = this.buttonText;
      }

      if (!this.templateData) {
        this.templateData = this.getDefaultPreviewTemplate();
      }

      this.openModal();
    }

    getDefaultPreviewTemplate() {
      const cleanId = (this.productId || "").replace(/\D/g, "");
      return {
        id: cleanId ? `tpl-${cleanId}` : "preview-default-tpl",
        title: this.productTitle ? `${this.productTitle} Customizer` : "Product Personalizer Preview",
        canvasWidth: 1200,
        canvasHeight: 1200,
        printDpi: 300,
        mockupUrl: this.detectPageProductImage(),
        layers: [
          {
            type: "IText",
            text: "Your Custom Text",
            fontSize: 48,
            fontFamily: "Roboto",
            fill: "#111111",
            left: 600,
            top: 480,
            originX: "center",
            originY: "center",
            optionLabel: "Front Custom Text",
            maxCharacters: 30,
          },
          {
            type: "Rect",
            customType: "image_upload",
            name: "Photo Upload Zone",
            optionLabel: "Upload Photo / Logo",
            left: 600,
            top: 720,
            originX: "center",
            originY: "center",
            width: 380,
            height: 260,
            fill: "rgba(0, 128, 96, 0.08)",
            stroke: "#008060",
            strokeWidth: 2,
            strokeDashArray: [6, 6],
          },
        ],
        optionGroups: [],
      };
    }

    async fetchTemplate() {
      this.isLoading = true;
      try {
        const cleanShop = (this.shop || window.location.hostname).replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
        const numericId = (this.productId || "").replace(/\D/g, "");
        const queryParams = new URLSearchParams({
          shop: cleanShop,
          productId: numericId || this.productId,
          rawProductId: this.productId,
          t: String(Date.now()),
        }).toString();

        const candidateEndpoints = [];
        if (this.appUrl) {
          candidateEndpoints.push(`${this.appUrl.replace(/\/$/, "")}/api/storefront/template?${queryParams}`);
          candidateEndpoints.push(`${this.appUrl.replace(/\/$/, "")}/api/storefront?${queryParams}`);
        }
        // Native Shopify App Proxy paths (same-origin, zero config)
        candidateEndpoints.push(`/apps/personalizer/template?${queryParams}`);
        candidateEndpoints.push(`/apps/personalizer?${queryParams}`);
        candidateEndpoints.push(`/api/storefront/template?${queryParams}`);

        let data = null;
        for (const ep of candidateEndpoints) {
          try {
            const resp = await fetch(ep, {
              headers: { Accept: "application/json" },
              cache: "no-store",
            });
            if (resp && resp.ok) {
              const json = await resp.json().catch(() => null);
              if (json && json.hasCustomizer && json.template) {
                data = json;
                break;
              }
            }
          } catch (fetchErr) {
            // try next candidate
          }
        }

        if (data && data.template) {
          this.templateData = data.template;
          window.__saitriq_template = data.template;
          console.log("[Saitriq] Successfully loaded template from backend:", data.template.id, data.template.title);
        }
      } catch (err) {
        console.warn("[Saitriq] Storefront endpoint fetch exception:", err);
      } finally {
        this.isLoading = false;

        if (this.btn) {
          this.btn.textContent = this.buttonText;
        }

        if (this.pendingOpen || this.autoOpen) {
          this.pendingOpen = false;
          if (!this.templateData) {
            this.templateData = this.getDefaultPreviewTemplate();
          }
          this.openModal();
        }
      }
    }

    renderTriggerButton() {
      this.innerHTML = `
        <div class="saitriq-trigger-wrapper">
          <button type="button" class="saitriq-customize-btn" style="background-color: ${this.primaryColor};">
            ${this.buttonText}
          </button>
        </div>
      `;
    }

    openModal() {
      if (!this.templateData) {
        this.templateData = this.getDefaultPreviewTemplate();
      }

      let modal = document.getElementById("saitriq-personalizer-modal");
      if (!modal) {
        modal = this.createModalElement();
        document.body.appendChild(modal);
      }

      modal.classList.add("is-open");
      document.body.style.overflow = "hidden";

      this.initFabricCanvas();
    }

    closeModal() {
      const modal = document.getElementById("saitriq-personalizer-modal");
      if (modal) {
        modal.classList.remove("is-open");
        document.body.style.overflow = "";
      }
    }

    createModalElement() {
      const modal = document.createElement("div");
      modal.id = "saitriq-personalizer-modal";
      modal.className = "saitriq-modal-backdrop";

      modal.innerHTML = `
        <div class="saitriq-modal-window">
          <div class="saitriq-modal-header">
            <div class="saitriq-header-titles">
              <h3>Customize Your Design</h3>
              <p class="saitriq-modal-subtitle">${this.productTitle ? this.productTitle + " • " : ""}Personalize text, upload photos & preview live</p>
            </div>
            <button type="button" class="saitriq-close-btn" aria-label="Close">&times;</button>
          </div>
          
          <div class="saitriq-modal-body">
            <!-- Canvas Preview Studio -->
            <div class="saitriq-canvas-viewport">
              <div class="saitriq-canvas-stage">
                <canvas id="saitriq-storefront-canvas"></canvas>
              </div>
              <div class="saitriq-canvas-badge">
                <span class="saitriq-pulse-dot"></span>
                <span>Live 300 DPI Studio Preview</span>
              </div>
            </div>

            <!-- Customizer Controls -->
            <div class="saitriq-controls-panel">
              <div id="saitriq-dynamic-controls" style="display: flex; flex-direction: column; gap: 14px; flex: 1;">
                <!-- Injected dynamically from template layers -->
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="saitriq-modal-footer">
            <div class="saitriq-preview-info">
              <span class="saitriq-pulse-dot"></span>
              <span>High-Resolution Real-time Render</span>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button type="button" class="saitriq-close-btn-secondary">
                Cancel
              </button>
              <button type="button" class="saitriq-submit-cart-btn">
                <span>Add to Cart with Design</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;

      // Event listeners
      modal.querySelector(".saitriq-close-btn").addEventListener("click", () => this.closeModal());
      modal.querySelector(".saitriq-close-btn-secondary").addEventListener("click", () => this.closeModal());
      modal.addEventListener("click", (e) => {
        if (e.target === modal) this.closeModal();
      });

      modal.querySelector(".saitriq-submit-cart-btn").addEventListener("click", () => this.handleAddToCart());

      return modal;
    }

    async ensureFabric() {
      if (window.fabric && typeof window.fabric.Canvas === "function" && (window.fabric.FabricImage || window.fabric.Image)) {
        return Promise.resolve();
      }

      const fabricUrl = this.fabricUrl || this.getAttribute("data-fabric-url") || "https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js";

      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = fabricUrl;
        script.async = true;
        script.onload = () => {
          console.log("[Saitriq] Fabric 7 loaded successfully, version:", window.fabric?.version);
          resolve();
        };
        script.onerror = () => {
          console.warn("[Saitriq] Primary fabric script failed, falling back to jsdelivr CDN...");
          const cdnScript = document.createElement("script");
          cdnScript.src = "https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js";
          cdnScript.async = true;
          cdnScript.onload = () => resolve();
          cdnScript.onerror = () => resolve();
          document.head.appendChild(cdnScript);
        };
        document.head.appendChild(script);
      });
    }

    async addBaseProductImage(imageUrl, canvasW, canvasH) {
      if (!imageUrl || !this.fabricCanvas) return;
      const ImageClass = window.fabric.FabricImage || window.fabric.Image;

      let cleanUrl = String(imageUrl).trim();
      if (cleanUrl.startsWith("//")) {
        cleanUrl = window.location.protocol + cleanUrl;
      }

      // Add cache-busting parameter to bypass browser's non-CORS image cache
      const corsUrl = cleanUrl + (cleanUrl.includes("?") ? "&" : "?") + "saitriq_cors=" + Date.now();

      const tryLoadImage = (src, withCors) => {
        return new Promise((resolve) => {
          const img = new Image();
          if (withCors) {
            img.crossOrigin = "anonymous";
          }
          img.onload = () => {
            if (img.width > 0 && img.height > 0) resolve(img);
            else resolve(null);
          };
          img.onerror = () => resolve(null);
          img.src = src;
        });
      };

      // 1. Attempt load with CORS and cache buster
      let loadedImg = await tryLoadImage(corsUrl, true);

      // 2. Attempt load with direct URL with CORS
      if (!loadedImg) {
        loadedImg = await tryLoadImage(cleanUrl, true);
      }

      // 3. Fallback without CORS to ensure the product mockup is ALWAYS rendered on the canvas
      if (!loadedImg) {
        console.warn("[Saitriq] CORS load failed for base image, loading non-CORS display:", cleanUrl);
        loadedImg = await tryLoadImage(cleanUrl, false);
      }

      if (!loadedImg || !loadedImg.width || !loadedImg.height) {
        console.error("[Saitriq] Could not load base image from:", cleanUrl);
        return;
      }

      // Remove any previously added base image or unclassified background image
      const existing = this.fabricCanvas.getObjects().filter(
        (o) =>
          o.name === "Product Base Image" ||
          o.name?.includes("Mockup") ||
          o.customType === "background_mockup" ||
          (o.type?.toLowerCase() === "image" && !o.isCustomerEditable && o.name !== "Customer Uploaded Image")
      );
      existing.forEach((o) => this.fabricCanvas.remove(o));

      // Calculate scale to nicely contain product image on canvas
      const maxW = canvasW * 0.98;
      const maxH = canvasH * 0.98;
      const scale = Math.min(maxW / loadedImg.width, maxH / loadedImg.height);

      const baseImg = new ImageClass(loadedImg, {
        left: canvasW / 2,
        top: canvasH / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
        hoverCursor: "default",
        name: "Product Base Image",
        customType: "background_mockup",
      });

      // Insert at bottom (index 0) so custom design layers sit on top of the product
      if (typeof this.fabricCanvas.insertAt === "function") {
        this.fabricCanvas.insertAt(0, baseImg);
      } else {
        this.fabricCanvas.add(baseImg);
        this.fabricCanvas.sendObjectToBack(baseImg);
      }

      if (this.fabricCanvas.requestRenderAll) {
        this.fabricCanvas.requestRenderAll();
      } else {
        this.fabricCanvas.renderAll();
      }
    }

    async initFabricCanvas() {
      await this.ensureFabric();
      if (!window.fabric) {
        console.warn("[Saitriq] Waiting for Fabric.js to load...");
        setTimeout(() => this.initFabricCanvas(), 100);
        return;
      }

      const canvasEl = document.getElementById("saitriq-storefront-canvas");
      if (!canvasEl) return;

      if (this.fabricCanvas) {
        this.fabricCanvas.dispose();
      }

      const tpl = this.templateData || this.getDefaultPreviewTemplate();
      const viewportEl = document.querySelector(".saitriq-canvas-viewport");
      let availW = 460;
      let availH = 460;
      if (viewportEl) {
        const rect = viewportEl.getBoundingClientRect();
        if (rect.width > 0) availW = rect.width - 48;
        if (rect.height > 0) availH = rect.height - 48;
      }
      const maxAvail = Math.min(availW, availH);
      const targetWidth = Math.min(500, Math.max(300, maxAvail > 0 ? maxAvail : 460));
      const canvasW = tpl.canvasWidth || 1200;
      const canvasH = tpl.canvasHeight || 1200;
      const scale = targetWidth / canvasW;

      this.fabricCanvas = new window.fabric.Canvas(canvasEl, {
        width: canvasW * scale,
        height: canvasH * scale,
        backgroundColor: "#ffffff",
        selection: false,
      });

      this.fabricCanvas.setZoom(scale);

      // 1. Prepare template layers
      let layersToLoad = tpl.layers;
      if (typeof layersToLoad === "string") {
        try { layersToLoad = JSON.parse(layersToLoad); } catch(e) {}
      }
      if (Array.isArray(layersToLoad)) {
        layersToLoad = { objects: layersToLoad };
      }

      // Check if template explicitly contains a merchant-uploaded mockup underlay
      let templateHasUnderlay = false;
      const rawObjects = Array.isArray(layersToLoad?.objects)
        ? layersToLoad.objects
        : Array.isArray(layersToLoad)
        ? layersToLoad
        : [];

      for (const obj of rawObjects) {
        const type = (obj.type || "").toLowerCase();
        const objName = (obj.name || "").toLowerCase();
        const customType = (obj.customType || "").toLowerCase();
        if (
          type === "image" &&
          (objName.includes("mockup") || objName.includes("underlay") || customType === "background_mockup")
        ) {
          templateHasUnderlay = true;
          break;
        }
      }

      // Load layers into Fabric canvas
      try {
        if (layersToLoad && (layersToLoad.objects || Array.isArray(layersToLoad))) {
          if (Array.isArray(layersToLoad.objects)) {
            layersToLoad.objects.forEach((o) => {
              if (o && o.type) {
                const lower = o.type.toLowerCase();
                if (lower === "image") o.type = "Image";
                else if (lower === "rect") o.type = "Rect";
                else if (lower === "i-text" || lower === "itext") o.type = "IText";
                else if (lower === "text") o.type = "Text";
              }
            });
          }

          // In Fabric 7 loadFromJSON returns a Promise
          const res = this.fabricCanvas.loadFromJSON(layersToLoad);
          if (res && typeof res.then === "function") {
            await res;
          }
        }
      } catch (err) {
        console.error("[Saitriq] Error loading template layers:", err);
      }

      this.canvasW = canvasW;
      this.canvasH = canvasH;

      // Check if user selected a variant with a specific image (e.g. Blue T-Shirt)
      const selectedVariantImg = this.getSelectedVariantImage();

      // If the customer selected a variant that has its own image (like Blue T-shirt):
      // The selected variant image MUST take precedence so the user customizes what they chose!
      if (selectedVariantImg) {
        await this.addBaseProductImage(selectedVariantImg, canvasW, canvasH);
      } else if (!templateHasUnderlay) {
        const baseImgUrl = this.detectPageProductImage();
        if (baseImgUrl) {
          await this.addBaseProductImage(baseImgUrl, canvasW, canvasH);
        }
      }

      if (this.fabricCanvas.requestRenderAll) {
        this.fabricCanvas.requestRenderAll();
      } else {
        this.fabricCanvas.renderAll();
      }

      this.buildDynamicControls();
    }

    getColorHex(name) {
      if (!name) return "#6b7280";
      const lower = name.toLowerCase().trim();
      const COLOR_MAP = {
        black: "#111111",
        white: "#ffffff",
        blue: "#2563eb",
        navy: "#0f172a",
        red: "#dc2626",
        green: "#16a34a",
        "forest green": "#14532d",
        grey: "#6b7280",
        gray: "#6b7280",
        charcoal: "#374151",
        yellow: "#eab308",
        gold: "#d97706",
        orange: "#ea580c",
        pink: "#ec4899",
        purple: "#9333ea",
        maroon: "#881337",
        burgundy: "#800020",
        brown: "#78350f",
        beige: "#f5f5dc",
        olive: "#556b2f",
        teal: "#0d9488",
        cyan: "#06b6d4",
      };
      if (COLOR_MAP[lower]) return COLOR_MAP[lower];
      for (const [key, hex] of Object.entries(COLOR_MAP)) {
        if (lower.includes(key)) return hex;
      }
      return "#9ca3af";
    }

    getParsedOptions() {
      if (!this.variantsData) return null;
      const { options, variants } = this.variantsData;
      if (!variants || variants.length <= 1) return null;

      if (Array.isArray(options) && options.length > 0) {
        const valid = options.filter(
          (opt) => !(opt.name?.toLowerCase() === "title" && opt.values?.length === 1 && opt.values[0] === "Default Title")
        );
        if (valid.length > 0) return valid;
      }

      if (variants[0] && Array.isArray(variants[0].options)) {
        const numOpts = variants[0].options.length;
        const derived = [];
        for (let i = 0; i < numOpts; i++) {
          const uniqueVals = Array.from(new Set(variants.map((v) => v.options[i]).filter(Boolean)));
          if (uniqueVals.length > 1) {
            derived.push({
              name: i === 0 ? "Color" : i === 1 ? "Size" : `Option ${i + 1}`,
              position: i + 1,
              values: uniqueVals,
            });
          }
        }
        if (derived.length > 0) return derived;
      }

      return null;
    }

    buildDynamicControls() {
      const container = document.getElementById("saitriq-dynamic-controls");
      if (!container || !this.fabricCanvas) return;

      container.innerHTML = "";

      const activeVariant = this.getSelectedVariant();
      if (!this.selectedOptionValues && activeVariant && Array.isArray(activeVariant.options)) {
        this.selectedOptionValues = [...activeVariant.options];
      }

      // 1. Product Options Card (Color, Size, etc.)
      const parsedOptions = this.getParsedOptions();
      if (parsedOptions && parsedOptions.length > 0) {
        const optionsCard = document.createElement("div");
        optionsCard.className = "saitriq-control-card";
        optionsCard.innerHTML = `
          <div class="saitriq-card-header">
            <span class="saitriq-card-icon">🎨</span>
            <span class="saitriq-card-title">Product Options</span>
          </div>
          <div class="saitriq-card-body" id="saitriq-options-body"></div>
        `;
        const optionsBody = optionsCard.querySelector("#saitriq-options-body");

        parsedOptions.forEach((opt, optIdx) => {
          const optPositionIdx = opt.position ? opt.position - 1 : optIdx;
          const currentVal = this.selectedOptionValues?.[optPositionIdx] || opt.values[0];
          const isColor = (opt.name || "").toLowerCase().includes("color") || (opt.name || "").toLowerCase().includes("colour");

          const section = document.createElement("div");
          section.className = "saitriq-option-section";

          const titleRow = document.createElement("div");
          titleRow.className = "saitriq-option-title";
          titleRow.innerHTML = `
            <span>${opt.name}</span>
            <span class="saitriq-option-selected-val" id="saitriq-opt-val-${optPositionIdx}">${currentVal}</span>
          `;
          section.appendChild(titleRow);

          const pillsRow = document.createElement("div");
          pillsRow.className = isColor ? "saitriq-color-pills-row" : "saitriq-size-pills-row";

          opt.values.forEach((val) => {
            const pill = document.createElement("button");
            pill.type = "button";
            const isActive = (val === currentVal);

            if (isColor) {
              pill.className = `saitriq-color-pill ${isActive ? "is-active" : ""}`;
              const hex = this.getColorHex(val);
              pill.innerHTML = `
                <span class="saitriq-color-dot" style="background-color: ${hex}; ${hex === '#ffffff' ? 'border: 1px solid #d1d5db;' : ''}"></span>
                <span>${val}</span>
              `;
            } else {
              pill.className = `saitriq-size-pill ${isActive ? "is-active" : ""}`;
              pill.textContent = val;
            }

            pill.setAttribute("data-value", val);
            pill.classList.add(`saitriq-opt-idx-${optPositionIdx}`);

            pill.addEventListener("click", async () => {
              if (!this.selectedOptionValues) this.selectedOptionValues = [];
              this.selectedOptionValues[optPositionIdx] = val;

              // Find variant matching current active options
              let matched = this.variantsData.variants.find((v) => {
                return Array.isArray(v.options) && v.options.every((oVal, idx) => oVal === this.selectedOptionValues[idx]);
              });

              // Fallback: find variant matching this option value
              if (!matched) {
                matched = this.variantsData.variants.find(
                  (v) => Array.isArray(v.options) && v.options[optPositionIdx] === val
                );
                if (matched && Array.isArray(matched.options)) {
                  this.selectedOptionValues = [...matched.options];
                }
              }

              if (matched) {
                this.activeSelectedVariantId = String(matched.id);

                // Update theme cart form
                const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
                if (formInput) formInput.value = matched.id;

                // Update labels & pills across all option sections
                parsedOptions.forEach((otherOpt, oIdx) => {
                  const oPos = otherOpt.position ? otherOpt.position - 1 : oIdx;
                  const oVal = this.selectedOptionValues[oPos];
                  const labelEl = optionsCard.querySelector(`#saitriq-opt-val-${oPos}`);
                  if (labelEl) labelEl.textContent = oVal;

                  const pills = optionsCard.querySelectorAll(`.saitriq-opt-idx-${oPos}`);
                  pills.forEach((p) => {
                    if (p.getAttribute("data-value") === oVal) {
                      p.classList.add("is-active");
                    } else {
                      p.classList.remove("is-active");
                    }
                  });
                });

                // Update summary card
                const sumVariantEl = document.getElementById("saitriq-summary-variant-title");
                if (sumVariantEl) sumVariantEl.textContent = matched.title;

                // Update mockup underlay image on canvas
                if (matched.image) {
                  let imgUrl = matched.image.startsWith("//") ? "https:" + matched.image : matched.image;
                  await this.addBaseProductImage(imgUrl, this.canvasW || 1200, this.canvasH || 1200);
                }
              }
            });

            pillsRow.appendChild(pill);
          });

          section.appendChild(pillsRow);
          optionsBody.appendChild(section);
        });

        container.appendChild(optionsCard);
      }

      // Check objects in canvas
      const objects = this.fabricCanvas.getObjects();
      let hasTextControl = false;
      let hasUploadControl = false;

      // Find any dashed print area rect if present
      const printRect = objects.find((o) => {
        const type = (o.type || "").toLowerCase();
        return type === "rect" && (o.strokeDashArray || o.customType === "image_upload" || o.name?.includes("Upload"));
      });

      // 2. Photo Upload Zone
      const uploadLayer = objects.find(
        (obj) =>
          obj.customType === "image_upload" ||
          obj.name?.toLowerCase().includes("upload") ||
          obj.name?.toLowerCase().includes("photo") ||
          obj.optionLabel?.toLowerCase().includes("photo") ||
          ((obj.type || "").toLowerCase() === "rect" && obj.strokeDashArray)
      );

      const renderPhotoControl = (targetObj) => {
        hasUploadControl = true;
        const photoCard = document.createElement("div");
        photoCard.className = "saitriq-control-card";
        photoCard.innerHTML = `
          <div class="saitriq-card-header">
            <span class="saitriq-card-icon">📷</span>
            <span class="saitriq-card-title">${targetObj?.optionLabel || "Upload Photo or Logo"}</span>
          </div>
          <div class="saitriq-card-body">
            <div class="saitriq-upload-dropzone">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p class="saitriq-upload-main-text"><strong>Click to browse</strong> or drag & drop</p>
              <p class="saitriq-upload-sub-text">High-res PNG, JPG, or WEBP</p>
              <input type="file" accept="image/*" style="display: none;" />
            </div>
          </div>
        `;

        const dropzone = photoCard.querySelector(".saitriq-upload-dropzone");
        const fileInput = photoCard.querySelector("input[type='file']");

        const handleFile = (file) => {
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (fEvent) => {
            const dataUrl = fEvent.target?.result;
            const imgEl = new Image();
            imgEl.src = dataUrl;
            imgEl.onload = () => {
              const ImageClass = window.fabric.FabricImage || window.fabric.Image;
              const targetRef = targetObj || printRect;
              const targetW = targetRef ? (targetRef.width * (targetRef.scaleX || 1)) : 320;
              const targetH = targetRef ? (targetRef.height * (targetRef.scaleY || 1)) : 320;
              const bestScale = Math.min(targetW / imgEl.width, targetH / imgEl.height);

              const fabricImg = new ImageClass(imgEl, {
                left: targetRef ? targetRef.left : (this.canvasW || 1200) / 2,
                top: targetRef ? targetRef.top : (this.canvasH || 1200) / 2,
                originX: targetRef?.originX || "center",
                originY: targetRef?.originY || "center",
                scaleX: bestScale,
                scaleY: bestScale,
                selectable: true,
                name: "Customer Uploaded Image",
              });

              if (targetRef && targetRef !== fabricImg) {
                this.fabricCanvas.remove(targetRef);
              }

              // Remove previous customer uploaded image if present
              const prev = this.fabricCanvas.getObjects().find((o) => o.name === "Customer Uploaded Image" && o !== fabricImg);
              if (prev) this.fabricCanvas.remove(prev);

              this.fabricCanvas.add(fabricImg);
              this.fabricCanvas.setActiveObject(fabricImg);
              if (this.fabricCanvas.requestRenderAll) {
                this.fabricCanvas.requestRenderAll();
              } else {
                this.fabricCanvas.renderAll();
              }

              // Update dropzone UI with thumbnail
              dropzone.innerHTML = `
                <div class="saitriq-upload-preview">
                  <img src="${dataUrl}" class="saitriq-upload-thumb" alt="Preview" />
                  <div class="saitriq-upload-info">
                    <span class="saitriq-upload-name">${file.name}</span>
                    <span class="saitriq-upload-status">✓ Added to canvas</span>
                  </div>
                  <button type="button" class="saitriq-upload-change-btn">Change</button>
                </div>
                <input type="file" accept="image/*" style="display: none;" />
              `;
              const newFileInput = dropzone.querySelector("input");
              const changeBtn = dropzone.querySelector(".saitriq-upload-change-btn");
              changeBtn.addEventListener("click", (evt) => {
                evt.stopPropagation();
                newFileInput.click();
              });
              newFileInput.addEventListener("change", (evt) => {
                const f = evt.target.files?.[0];
                if (f) handleFile(f);
              });
            };
          };
          reader.readAsDataURL(file);
        };

        dropzone.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        });

        dropzone.addEventListener("dragover", (e) => {
          e.preventDefault();
          dropzone.classList.add("is-dragover");
        });
        dropzone.addEventListener("dragleave", () => {
          dropzone.classList.remove("is-dragover");
        });
        dropzone.addEventListener("drop", (e) => {
          e.preventDefault();
          dropzone.classList.remove("is-dragover");
          const file = e.dataTransfer?.files?.[0];
          if (file) handleFile(file);
        });

        container.appendChild(photoCard);
      };

      if (uploadLayer) {
        renderPhotoControl(uploadLayer);
      }

      // 3. Customer Editable Text Layers
      const textLayers = objects.filter((obj) => {
        const type = (obj.type || "").toLowerCase();
        return (
          type === "i-text" ||
          type === "itext" ||
          type === "text" ||
          obj.customType === "text" ||
          (obj.text !== undefined && !obj.name?.toLowerCase().includes("mockup") && !obj.name?.toLowerCase().includes("base"))
        );
      });

      const renderTextControl = (obj, idx) => {
        hasTextControl = true;
        const textCard = document.createElement("div");
        textCard.className = "saitriq-control-card";
        textCard.innerHTML = `
          <div class="saitriq-card-header">
            <span class="saitriq-card-icon">✏️</span>
            <span class="saitriq-card-title">${obj.optionLabel || `Custom Text ${idx > 1 ? idx : ""}`}</span>
          </div>
          <div class="saitriq-card-body">
            <div>
              <label class="saitriq-sublabel">Your Message / Text</label>
              <input type="text" class="saitriq-text-input" value="${obj.text || ""}" placeholder="Enter your custom text..." />
            </div>
            
            <div>
              <label class="saitriq-sublabel">Font Family</label>
              <select class="saitriq-select-input">
                <option value="Roboto">Roboto (Clean Modern)</option>
                <option value="Montserrat">Montserrat (Geometric Sans)</option>
                <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                <option value="Pacifico">Pacifico (Handwritten Script)</option>
                <option value="Oswald">Oswald (Bold Headline)</option>
                <option value="Courier New">Courier New (Vintage Monospace)</option>
              </select>
            </div>

            <div>
              <label class="saitriq-sublabel">Print Ink Color</label>
              <div class="saitriq-swatches-grid"></div>
            </div>
          </div>
        `;

        const input = textCard.querySelector(".saitriq-text-input");
        if (obj.maxCharacters) input.maxLength = obj.maxCharacters;

        input.addEventListener("input", (e) => {
          obj.set("text", e.target.value);
          if (this.fabricCanvas.requestRenderAll) {
            this.fabricCanvas.requestRenderAll();
          } else {
            this.fabricCanvas.renderAll();
          }
        });

        const fontSelect = textCard.querySelector(".saitriq-select-input");
        if (obj.fontFamily) fontSelect.value = obj.fontFamily;

        fontSelect.addEventListener("change", (e) => {
          obj.set("fontFamily", e.target.value);
          if (this.fabricCanvas.requestRenderAll) {
            this.fabricCanvas.requestRenderAll();
          } else {
            this.fabricCanvas.renderAll();
          }
        });

        const swatchesContainer = textCard.querySelector(".saitriq-swatches-grid");
        const colors = ["#111111", "#ffffff", "#dc2626", "#2563eb", "#008060", "#f59e0b", "#9333ea", "#6b7280"];
        const currentFill = (obj.fill || "#111111").toLowerCase();

        colors.forEach((col) => {
          const swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "saitriq-color-swatch";
          swatch.setAttribute("data-color", col);
          swatch.style.backgroundColor = col;
          if (currentFill === col.toLowerCase()) {
            swatch.classList.add("is-active");
          }

          swatch.addEventListener("click", () => {
            obj.set("fill", col);
            swatchesContainer.querySelectorAll(".saitriq-color-swatch").forEach((s) => s.classList.remove("is-active"));
            swatch.classList.add("is-active");
            if (this.fabricCanvas.requestRenderAll) {
              this.fabricCanvas.requestRenderAll();
            } else {
              this.fabricCanvas.renderAll();
            }
          });
          swatchesContainer.appendChild(swatch);
        });

        // Native custom color picker
        const customColorPicker = document.createElement("input");
        customColorPicker.type = "color";
        customColorPicker.className = "saitriq-custom-color-picker";
        customColorPicker.title = "Pick custom color";
        customColorPicker.value = currentFill.startsWith("#") ? currentFill : "#111111";
        customColorPicker.addEventListener("input", (e) => {
          const chosen = e.target.value;
          obj.set("fill", chosen);
          swatchesContainer.querySelectorAll(".saitriq-color-swatch").forEach((s) => s.classList.remove("is-active"));
          if (this.fabricCanvas.requestRenderAll) {
            this.fabricCanvas.requestRenderAll();
          } else {
            this.fabricCanvas.renderAll();
          }
        });
        swatchesContainer.appendChild(customColorPicker);

        container.appendChild(textCard);
      };

      if (textLayers.length > 0) {
        textLayers.forEach((obj, idx) => renderTextControl(obj, idx + 1));
      }

      // Fallback: If no editable text controls exist, provide Add Custom Text card
      if (!hasTextControl) {
        const textCard = document.createElement("div");
        textCard.className = "saitriq-control-card";
        textCard.innerHTML = `
          <div class="saitriq-card-header">
            <span class="saitriq-card-icon">✏️</span>
            <span class="saitriq-card-title">Add Custom Text</span>
          </div>
          <div class="saitriq-card-body">
            <div>
              <label class="saitriq-sublabel">Your Message / Text</label>
              <input type="text" class="saitriq-text-input" placeholder="Type your custom text here..." />
            </div>
            
            <div>
              <label class="saitriq-sublabel">Font Family</label>
              <select class="saitriq-select-input">
                <option value="Roboto">Roboto (Clean Modern)</option>
                <option value="Montserrat">Montserrat (Geometric Sans)</option>
                <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                <option value="Pacifico">Pacifico (Handwritten Script)</option>
                <option value="Oswald">Oswald (Bold Headline)</option>
                <option value="Courier New">Courier New (Vintage Monospace)</option>
              </select>
            </div>

            <div>
              <label class="saitriq-sublabel">Print Ink Color</label>
              <div class="saitriq-swatches-grid"></div>
            </div>
          </div>
        `;

        const input = textCard.querySelector(".saitriq-text-input");
        const fontSelect = textCard.querySelector(".saitriq-select-input");
        const swatchesContainer = textCard.querySelector(".saitriq-swatches-grid");

        let activeAddedText = null;

        input.addEventListener("input", (e) => {
          const val = e.target.value;
          const ITextClass = window.fabric.IText || window.fabric.Text;
          if (!activeAddedText) {
            const targetLeft = printRect ? printRect.left : 600;
            const targetTop = printRect ? (printRect.top - 80) : 480;
            activeAddedText = new ITextClass(val, {
              left: targetLeft,
              top: targetTop,
              originX: "center",
              originY: "center",
              fontFamily: fontSelect.value || "Roboto",
              fontSize: 48,
              fill: "#111111",
              name: "Customer Text",
              optionLabel: "Custom Text",
            });
            this.fabricCanvas.add(activeAddedText);
            this.fabricCanvas.setActiveObject(activeAddedText);
          } else {
            activeAddedText.set("text", val);
          }
          if (this.fabricCanvas.requestRenderAll) {
            this.fabricCanvas.requestRenderAll();
          } else {
            this.fabricCanvas.renderAll();
          }
        });

        fontSelect.addEventListener("change", (e) => {
          if (activeAddedText) {
            activeAddedText.set("fontFamily", e.target.value);
            if (this.fabricCanvas.requestRenderAll) {
              this.fabricCanvas.requestRenderAll();
            } else {
              this.fabricCanvas.renderAll();
            }
          }
        });

        const colors = ["#111111", "#ffffff", "#dc2626", "#2563eb", "#008060", "#f59e0b", "#9333ea", "#6b7280"];
        colors.forEach((col) => {
          const swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "saitriq-color-swatch";
          swatch.setAttribute("data-color", col);
          swatch.style.backgroundColor = col;
          if (col === "#111111") swatch.classList.add("is-active");

          swatch.addEventListener("click", () => {
            if (activeAddedText) {
              activeAddedText.set("fill", col);
              if (this.fabricCanvas.requestRenderAll) {
                this.fabricCanvas.requestRenderAll();
              } else {
                this.fabricCanvas.renderAll();
              }
            }
            swatchesContainer.querySelectorAll(".saitriq-color-swatch").forEach((s) => s.classList.remove("is-active"));
            swatch.classList.add("is-active");
          });
          swatchesContainer.appendChild(swatch);
        });

        // Custom color picker
        const customColorPicker = document.createElement("input");
        customColorPicker.type = "color";
        customColorPicker.className = "saitriq-custom-color-picker";
        customColorPicker.title = "Pick custom color";
        customColorPicker.value = "#111111";
        customColorPicker.addEventListener("input", (e) => {
          const chosen = e.target.value;
          if (activeAddedText) {
            activeAddedText.set("fill", chosen);
            if (this.fabricCanvas.requestRenderAll) {
              this.fabricCanvas.requestRenderAll();
            } else {
              this.fabricCanvas.renderAll();
            }
          }
          swatchesContainer.querySelectorAll(".saitriq-color-swatch").forEach((s) => s.classList.remove("is-active"));
        });
        swatchesContainer.appendChild(customColorPicker);

        container.appendChild(textCard);
      }

      // Fallback: If no upload control exists, provide Photo Upload card
      if (!hasUploadControl) {
        renderPhotoControl(null);
      }

      // 4. Live Summary Card (Anchored at bottom with margin-top: auto)
      const summaryCard = document.createElement("div");
      summaryCard.className = "saitriq-summary-card";
      summaryCard.innerHTML = `
        <div class="saitriq-summary-row">
          <span class="saitriq-summary-label">Selected Item:</span>
          <span class="saitriq-summary-val" id="saitriq-summary-variant-title">${activeVariant?.title || this.productTitle || "Standard Product"}</span>
        </div>
        <div class="saitriq-summary-row">
          <span class="saitriq-summary-label">Print Specification:</span>
          <span class="saitriq-summary-badge">300 DPI Ultra HD</span>
        </div>
        <div class="saitriq-summary-guarantee">
          🛡️ High-precision laser print guarantee • Colors calibrated to fabric
        </div>
      `;
      container.appendChild(summaryCard);
    }
    }

    async handleAddToCart() {
      if (!this.fabricCanvas) return;

      const submitBtn = document.querySelector(".saitriq-submit-cart-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Processing Design...";
      }

      try {
        // 1. Remove active selection so control handles don't get baked into snapshot
        this.fabricCanvas.discardActiveObject();
        if (this.fabricCanvas.requestRenderAll) {
          this.fabricCanvas.requestRenderAll();
        } else {
          this.fabricCanvas.renderAll();
        }

        // Brief delay for render cycle to settle
        await new Promise((r) => setTimeout(r, 60));

        // 2. Generate snapshot preview JPEG (compressed to ~40-60KB to fit easily in Shopify line item limits)
        let previewDataUrl = "";
        try {
          const exportMultiplier = Math.max(1, 600 / (this.fabricCanvas.width || 460));
          previewDataUrl = this.fabricCanvas.toDataURL({
            format: "jpeg",
            quality: 0.88,
            multiplier: exportMultiplier,
          });
        } catch (exportErr) {
          console.warn("[Saitriq] Direct toDataURL error (tainted canvas?), trying safe fallback:", exportErr);
          try {
            const bg = this.fabricCanvas.getObjects().find(
              (o) => o.customType === "background_mockup" || o.name === "Product Base Image"
            );
            if (bg) bg.visible = false;
            previewDataUrl = this.fabricCanvas.toDataURL({
              format: "jpeg",
              quality: 0.85,
            });
            if (bg) bg.visible = true;
          } catch (err2) {
            console.error("[Saitriq] Fallback export also failed:", err2);
            previewDataUrl = "";
          }
        }

        const customizationId = "cust_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        const resolvedTemplateId =
          this.templateData?.id || (this.productId ? `tpl-${this.productId}` : "custom-template");

        // Attempt server-side image upload so line items get a clean HTTPS URL instead of raw base64
        let finalPreviewUrl = previewDataUrl;
        if (previewDataUrl) {
          try {
            if (submitBtn) submitBtn.textContent = "Uploading Design...";
            const uploadRes = await fetch("/apps/personalizer/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customizationId: customizationId,
                image: previewDataUrl,
                shop: this.shopDomain || window.Shopify?.shop || "",
              }),
            });
            if (uploadRes.ok) {
              const uploadJson = await uploadRes.json();
              if (uploadJson.previewUrl || uploadJson.directUrl) {
                finalPreviewUrl = uploadJson.previewUrl || uploadJson.directUrl;
                console.log("[Saitriq] Design preview uploaded:", finalPreviewUrl);
              }
            }
          } catch (uploadErr) {
            console.warn("[Saitriq] Preview upload notice (using fallback):", uploadErr);
          }
        }

        if (submitBtn) submitBtn.textContent = "Adding to Cart...";

        // 3. Gather customer inputs for line item properties
        const properties = {
          _customization_id: customizationId,
          _template_id: resolvedTemplateId,
          _customization_preview: finalPreviewUrl,
          "Custom Design Preview": finalPreviewUrl,
          "Custom Design": "Personalized ✨",
        };

        const objects = this.fabricCanvas.getObjects();
        objects.forEach((obj, idx) => {
          const type = (obj.type || "").toLowerCase();
          if (
            (type.includes("text") || obj.text !== undefined) &&
            !obj.name?.toLowerCase().includes("mockup") &&
            !obj.name?.toLowerCase().includes("base")
          ) {
            const label = obj.optionLabel || `Custom Text ${idx + 1}`;
            if (obj.text && obj.text.trim()) {
              properties[label] = obj.text;
            }
          }
        });

        // 4. Find variant ID from the active Shopify product form or personalizer selection
        let variantId = this.activeSelectedVariantId || null;
        if (!variantId) {
          const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
          if (formInput && formInput.value) {
            variantId = formInput.value;
          } else {
            const anyIdInput = document.querySelector('input[name="id"], select[name="id"]');
            if (anyIdInput && anyIdInput.value) {
              variantId = anyIdInput.value;
            }
          }
        }

        if (!variantId) {
          alert("Could not detect active product variant. Please select a variant on the product page.");
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Add to Cart with Design";
          }
          return;
        }

        // 5. Store preview in sessionStorage specifically for this customized variant
        try {
          if (previewDataUrl) {
            sessionStorage.setItem("saitriq_preview_" + variantId, previewDataUrl);
            sessionStorage.setItem("saitriq_preview_" + customizationId, previewDataUrl);
          }
          if (finalPreviewUrl && finalPreviewUrl !== previewDataUrl) {
            sessionStorage.setItem("saitriq_url_" + variantId, finalPreviewUrl);
          }
        } catch (storageErr) {}

        // 6. Submit to Shopify Cart API (/cart/add.js)
        const cartResponse = await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              {
                id: variantId,
                quantity: 1,
                properties: properties,
              },
            ],
          }),
        });

        if (cartResponse.ok) {
          document.dispatchEvent(new CustomEvent("cart:updated"));
          document.dispatchEvent(new CustomEvent("cart:refresh"));
          document.dispatchEvent(new CustomEvent("cart:change"));

          this.closeModal();
          window.location.href = "/cart";
        } else {
          const errData = await cartResponse.json().catch(() => ({}));
          alert("Failed to add to cart: " + (errData.description || "Please try again."));
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Add to Cart with Design";
          }
        }
      } catch (err) {
        console.error("[Saitriq] Error adding to cart:", err);
        alert("An error occurred while preparing your custom design.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Add to Cart with Design";
        }
      }
    }
  }

  customElements.define("saitriq-personalizer", SaitriqPersonalizer);

  // Cart page preview enhancer
  function initCartPreviewEnhancer() {
    if (!window.location.pathname.includes("/cart")) return;
    async function enhanceCart() {
      try {
        const res = await fetch("/cart.js", { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const cart = await res.json();
        if (!cart || !cart.items || cart.items.length === 0) return;

        const customizedMap = new Map();
        cart.items.forEach((item, index) => {
          const preview =
            item.properties?._customization_preview ||
            sessionStorage.getItem("saitriq_preview_" + item.variant_id) ||
            sessionStorage.getItem("saitriq_latest_preview");

          if (preview && typeof preview === "string" && preview.startsWith("data:image")) {
            customizedMap.set(String(item.variant_id), { preview, title: item.title, key: item.key });
          }
        });

        if (customizedMap.size === 0) return;

        const cartItemEls = document.querySelectorAll(
          "tr.cart-item, .cart-item, [id^='CartItem-'], .cart__item, .line-item"
        );

        cartItemEls.forEach((el) => {
          const img = el.querySelector(
            ".cart-item__image-container img, .cart-item__media img, .cart__image img, .cart-item img, img"
          );
          if (!img) return;

          let matched = null;
          for (const [vId, custom] of customizedMap.entries()) {
            if (
              el.innerHTML.includes(vId) ||
              (custom.title && el.textContent.includes(custom.title)) ||
              (custom.key && el.innerHTML.includes(custom.key)) ||
              cartItemEls.length === 1
            ) {
              matched = custom;
              break;
            }
          }

          if (matched && matched.preview) {
            img.src = matched.preview;
            img.srcset = "";
            img.style.objectFit = "contain";
            img.style.borderRadius = "6px";
            img.style.border = "1px solid #d4d6d8";
            img.style.background = "#ffffff";

            if (!el.querySelector(".saitriq-cart-badge")) {
              const badge = document.createElement("span");
              badge.className = "saitriq-cart-badge";
              badge.textContent = "✨ Custom Design Applied";
              badge.style.cssText =
                "display:inline-block; font-size:11px; background:#e3f1df; color:#108043; padding:2px 8px; border-radius:10px; font-weight:600; margin-top:4px;";
              const titleEl = el.querySelector(".cart-item__name, .product-title, .cart__item-title, h3, a");
              if (titleEl && titleEl.parentNode) {
                titleEl.parentNode.appendChild(badge);
              }
            }
          }
        });
      } catch (e) {}
    }

    enhanceCart();
    setTimeout(enhanceCart, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCartPreviewEnhancer);
  } else {
    initCartPreviewEnhancer();
  }
})();
