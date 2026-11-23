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
      this.activeSide = "front";
      this._sideLoadSeq = 0;
      this.sidesData = { front: null, back: null };
      this.templateUnderlays = { front: null, back: null };
      this.sideUnderlays = { front: null, back: null };
      this.customerUploadedImageDataUrls = { front: null, back: null };
      this.customerUploadedImageFileNames = { front: null, back: null };
      this.customerUploadedImageDataUrl = null;
      this.locales = {};
    }

    t(key, fallback = "") {
      const val = this.locales?.[key];
      if (val !== undefined && val !== null && String(val).trim() !== "" && !String(val).includes("translation missing:")) {
        return String(val);
      }
      return fallback;
    }

    async connectedCallback() {
      const embedEl = document.getElementById("saitriq-personalizer-embed");
      this.isDesignMode = this.getAttribute("data-design-mode") === "true" || window.Shopify?.designMode === true;
      const isAppActive = Boolean(embedEl) || this.isDesignMode;

      if (!isAppActive) {
        this.style.display = "none";
        return;
      }
      this.style.display = "";

      this.locales = {};
      const localeScript = this.querySelector(".saitriq-locales-json") || document.querySelector(".saitriq-locales-json");
      if (localeScript) {
        try {
          this.locales = JSON.parse(localeScript.textContent || "{}");
        } catch (e) {
          console.warn("[Saitriq] Error parsing locales JSON:", e);
        }
      }

      this.productId = this.getAttribute("data-product-id") || "";
      this.productTitle = this.getAttribute("data-product-title") || "";
      this.productImage = this.getAttribute("data-product-image") || "";
      this.shop = this.getAttribute("data-shop") || window.location.hostname;
      this.appUrl = this.getAttribute("data-app-url") || "";
      this.fabricUrl = this.getAttribute("data-fabric-url") || "";
      this.buttonText = this.getAttribute("data-button-text") || "🎨 Customize This Product";
      this.primaryColor = this.getAttribute("data-primary-color") || "#008060";
      this.autoOpen = this.getAttribute("data-auto-open") === "true";

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
      document.documentElement.style.setProperty("--saitriq-primary", this.primaryColor);

      // Bind to existing SSR button or create if missing
      this.btn = this.querySelector(".saitriq-customize-btn");
      if (!this.btn) {
        this.renderTriggerButton();
        this.btn = this.querySelector(".saitriq-customize-btn");
      } else {
        this.btn.textContent = this.buttonText;
        this.btn.style.backgroundColor = this.primaryColor;
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

    getImageUrl(img) {
      if (!img) return "";
      let url = typeof img === "object" ? (img.url || img.src || "") : String(img);
      if (url.startsWith("//")) url = window.location.protocol + url;
      return url.trim();
    }

    getImageAlt(img) {
      if (!img || typeof img !== "object") return "";
      return String(img.alt || "").toLowerCase();
    }

    resolveSideImage(side, variant) {
      const activeVariant = variant || this.getSelectedVariant();
      let colorOption = "";
      if (activeVariant && Array.isArray(activeVariant.options)) {
        const opts = this.variantsData?.options || [];
        const colorIdx = opts.findIndex((o) => {
          const n = String(o.name || "").toLowerCase();
          return n.includes("color") || n.includes("colour");
        });
        if (colorIdx !== -1 && activeVariant.options[colorIdx]) {
          colorOption = String(activeVariant.options[colorIdx]).toLowerCase().trim();
        } else {
          const found = activeVariant.options.find((val) => {
            const h = this.getColorHex(val);
            return h !== "#6b7280" && h !== "#9ca3af";
          });
          colorOption = String(found || activeVariant.options[0] || "").toLowerCase().trim();
        }
      }

      const images = (this.variantsData && Array.isArray(this.variantsData.images)) ? this.variantsData.images : [];
      const templateUnderlay = this.templateUnderlays?.[side] || "";

      // Collect URLs assigned directly as variant featured images (typically front views of each color)
      const variantFeaturedUrls = new Set(
        (this.variantsData?.variants || [])
          .map((v) => this.getImageUrl(v.image))
          .filter(Boolean)
      );

      // Collect all known color names from variants to detect and prevent cross-color fallbacks
      const allColors = Array.from(
        new Set(
          (this.variantsData?.variants || [])
            .map((v) => {
              if (!Array.isArray(v.options)) return "";
              const opts = this.variantsData?.options || [];
              const cIdx = opts.findIndex((o) => {
                const n = String(o.name || "").toLowerCase();
                return n.includes("color") || n.includes("colour");
              });
              return String(cIdx !== -1 ? v.options[cIdx] : v.options[0] || "").toLowerCase().trim();
            })
            .filter(Boolean)
        )
      );
      const otherColors = allColors.filter((c) => c !== colorOption);

      // 1. Front Side Resolution
      if (side === "front") {
        if (activeVariant && activeVariant.image) {
          return this.getImageUrl(activeVariant.image);
        }
        if (images.length > 0 && colorOption) {
          const match = images.find((img) => {
            const url = this.getImageUrl(img).toLowerCase();
            const alt = this.getImageAlt(img);
            return (url.includes(colorOption) || alt.includes(colorOption)) && !alt.includes("back") && !url.includes("back");
          });
          if (match) return this.getImageUrl(match);
        }
        if (templateUnderlay) return templateUnderlay;
        if (images.length > 0) return this.getImageUrl(images[0]);
        return this.detectPageProductImage() || "";
      }

      // 2. Back Side Resolution
      if (images.length > 0) {
        // A. Search image matching variant color AND ("back" or "rear")
        if (colorOption) {
          const matchBack = images.find((img) => {
            const url = this.getImageUrl(img).toLowerCase();
            const alt = this.getImageAlt(img);
            return (
              (url.includes(colorOption) || alt.includes(colorOption)) &&
              (alt.includes("back") || url.includes("back") || alt.includes("rear") || url.includes("rear"))
            );
          });
          if (matchBack) return this.getImageUrl(matchBack);
        }

        // B. Paired gallery image right after variant's featured image (only if NOT another variant's front image)
        if (activeVariant && activeVariant.image) {
          const vUrl = this.getImageUrl(activeVariant.image);
          const vIdx = images.findIndex((img) => this.getImageUrl(img) === vUrl);
          if (vIdx !== -1 && vIdx + 1 < images.length) {
            const nextImg = images[vIdx + 1];
            const nextUrl = this.getImageUrl(nextImg);
            const nextAlt = this.getImageAlt(nextImg);
            if (!variantFeaturedUrls.has(nextUrl)) {
              // Ensure this adjacent image does not explicitly belong to another color
              const conflictsWithOther = otherColors.some(
                (c) => nextUrl.toLowerCase().includes(c) || nextAlt.includes(c)
              );
              if (!conflictsWithOther) {
                return nextUrl;
              }
            }
          }
        }

        // C. Admin-uploaded Back Mockup Underlay from Template Studio
        if (templateUnderlay) {
          return templateUnderlay;
        }

        // D. Non-conflicting gallery image explicitly tagged "back" or "rear"
        // (Only safe if it does NOT mention a different color than the active color)
        const safeBack = images.find((img) => {
          const url = this.getImageUrl(img).toLowerCase();
          const alt = this.getImageAlt(img);
          const isBack = alt.includes("back") || url.includes("back") || alt.includes("rear") || url.includes("rear");
          if (!isBack) return false;
          // Reject if image belongs to another color (e.g. Black Back when Blue is active)
          const conflicts = otherColors.some((c) => url.includes(c) || alt.includes(c));
          return !conflicts;
        });
        if (safeBack) return this.getImageUrl(safeBack);

        // E. Non-variant second gallery image ONLY if it doesn't conflict with another color
        if (images.length > 1) {
          const img1 = images[1];
          const img1Url = this.getImageUrl(img1);
          const img1Alt = this.getImageAlt(img1);
          if (!variantFeaturedUrls.has(img1Url)) {
            const conflicts = otherColors.some((c) => img1Url.toLowerCase().includes(c) || img1Alt.includes(c));
            if (!conflicts) {
              return img1Url;
            }
          }
        }

        // F. Final fallback: keep the selected variant's color image so the selected color is never replaced with an incorrect color
        if (activeVariant && activeVariant.image) {
          return this.getImageUrl(activeVariant.image);
        }
        return this.getImageUrl(images[0]);
      }

      if (templateUnderlay) return templateUnderlay;
      return this.detectPageProductImage() || "";
    }

    getSideBaseImage(side) {
      return this.resolveSideImage(side, this.getSelectedVariant());
    }

    async handleTriggerClick() {
      if (this.isLoading) {
        if (this.btn) this.btn.textContent = "⏳ Loading studio...";
        let waitCount = 0;
        while (this.isLoading && waitCount < 30) {
          await new Promise((r) => setTimeout(r, 100));
          waitCount++;
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

        if (data && data.storefrontText && typeof data.storefrontText === "object") {
          const cleanText = {};
          Object.keys(data.storefrontText).forEach((k) => {
            if (data.storefrontText[k] && String(data.storefrontText[k]).trim() !== "") {
              cleanText[k] = data.storefrontText[k];
            }
          });
          this.locales = { ...this.locales, ...cleanText };
          if (cleanText.button_text) {
            this.buttonText = cleanText.button_text;
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
      if (modal) {
        modal.remove();
      }
      modal = this.createModalElement();
      document.body.appendChild(modal);

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
              <h3>${this.t("modal_title", "Customize Your Design")}</h3>
              <p class="saitriq-modal-subtitle">${this.productTitle ? this.productTitle + " • " : ""}${this.t("modal_subtitle", "Personalize text, upload photos & preview live")}</p>
            </div>
            <button type="button" class="saitriq-close-btn" aria-label="Close">&times;</button>
          </div>
          
          <div class="saitriq-modal-body">
            <!-- Canvas Preview Studio -->
            <div class="saitriq-canvas-viewport">
              <!-- Front / Back Multi-Side Switcher -->
              <div class="saitriq-side-switcher">
                <button type="button" class="saitriq-side-tab is-active" data-side="front">
                  <span class="saitriq-side-tab-icon">👕</span>
                  <span>${this.t("front_side", "Front Side")}</span>
                </button>
                <button type="button" class="saitriq-side-tab" data-side="back">
                  <span class="saitriq-side-tab-icon">🔄</span>
                  <span>${this.t("back_side", "Back Side")}</span>
                </button>
              </div>

              <div class="saitriq-canvas-stage">
                <canvas id="saitriq-storefront-canvas"></canvas>
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
             
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button type="button" class="saitriq-close-btn-secondary">
                ${this.t("cancel", "Cancel")}
              </button>
              <button type="button" class="saitriq-submit-cart-btn">
                <span>${this.t("add_to_cart", "Add to Cart with Design")}</span>
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

      // Multi-side tab switcher event listeners
      modal.querySelectorAll(".saitriq-side-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          const side = tab.getAttribute("data-side");
          this.switchSide(side);
        });
      });

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

    async addBaseProductImage(imageUrl, canvasW, canvasH, expectedSeq = null) {
      if (!imageUrl || !this.fabricCanvas) return;
      const ImageClass = window.fabric.FabricImage || window.fabric.Image;

      let cleanUrl = String(imageUrl).trim();
      if (cleanUrl.startsWith("//")) {
        cleanUrl = window.location.protocol + cleanUrl;
      }

      const isDataOrBlob = cleanUrl.startsWith("data:") || cleanUrl.startsWith("blob:");

      const tryLoadImage = (src, withCors) => {
        return new Promise((resolve) => {
          const img = new Image();
          if (withCors && !isDataOrBlob) {
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

      let loadedImg = null;
      if (isDataOrBlob) {
        loadedImg = await tryLoadImage(cleanUrl, false);
      } else {
        // Add cache-busting parameter to bypass browser's non-CORS image cache
        const corsUrl = cleanUrl + (cleanUrl.includes("?") ? "&" : "?") + "saitriq_cors=" + Date.now();
        // 1. Attempt load with CORS and cache buster
        loadedImg = await tryLoadImage(corsUrl, true);
        // 2. Attempt load with direct URL with CORS
        if (!loadedImg) {
          loadedImg = await tryLoadImage(cleanUrl, true);
        }
        // 3. Fallback without CORS to ensure the product mockup is ALWAYS rendered on the canvas
        if (!loadedImg) {
          console.warn("[Saitriq] CORS load failed for base image, loading non-CORS display:", cleanUrl);
          loadedImg = await tryLoadImage(cleanUrl, false);
        }
      }

      // Abort if user toggled to another side while this image was downloading
      if (expectedSeq && expectedSeq !== this._sideLoadSeq) {
        return;
      }

      if (!loadedImg || !loadedImg.width || !loadedImg.height || !this.fabricCanvas) {
        console.error("[Saitriq] Could not load base image from:", cleanUrl);
        return;
      }

      // Remove only previously added base image / template mockup underlays (preserve customer photos)
      const existing = this.fabricCanvas.getObjects().filter(
        (o) =>
          o.name === "Product Base Image" ||
          o.name === "Mockup Underlay" ||
          o.customType === "background_mockup"
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
      if (typeof baseImg.setCoords === "function") baseImg.setCoords();

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
      let availW = 420;
      let availH = 420;
      if (viewportEl) {
        const rect = viewportEl.getBoundingClientRect();
        if (rect.width > 0) availW = rect.width - 32;
        if (rect.height > 0) availH = rect.height - 56;
      }
      const maxAvail = Math.min(availW, availH);
      const targetWidth = Math.min(460, Math.max(260, maxAvail > 0 ? maxAvail : 420));
      const canvasW = tpl.canvasWidth || 1200;
      const canvasH = tpl.canvasHeight || 1200;
      const scale = targetWidth / canvasW;

      this.canvasW = canvasW;
      this.canvasH = canvasH;

      this.fabricCanvas = new window.fabric.Canvas(canvasEl, {
        width: canvasW * scale,
        height: canvasH * scale,
        backgroundColor: "#ffffff",
        selection: false,
      });

      this.fabricCanvas.setZoom(scale);

      // Keyboard Delete / Backspace handler to remove selected customer photo
      if (!this._hasDeleteKeyBound) {
        this._hasDeleteKeyBound = true;
        window.addEventListener("keydown", (e) => {
          if (e.key !== "Delete" && e.key !== "Backspace") return;
          const activeTag = document.activeElement?.tagName;
          if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
          const activeObj = this.fabricCanvas?.getActiveObject();
          if (activeObj && (activeObj.name === "Customer Uploaded Image" || activeObj.customType === "customer_upload")) {
            const rmBtn = document.querySelector(".saitriq-upload-remove-btn");
            if (rmBtn) {
              rmBtn.click();
            } else {
              this.fabricCanvas.remove(activeObj);
              this.fabricCanvas.requestRenderAll();
            }
          }
        });
      }

      // 1. Prepare multi-side template layers
      let rawLayers = tpl.layers;
      if (typeof rawLayers === "string") {
        try { rawLayers = JSON.parse(rawLayers); } catch (e) {}
      }

      const isUnderlayObj = (o) => {
        if (!o) return false;
        const type = (o.type || "").toLowerCase();
        const name = (o.name || "").toLowerCase();
        const customType = (o.customType || "").toLowerCase();
        return (
          type === "image" &&
          (customType === "background_mockup" || name.includes("mockup") || name.includes("underlay") || name === "product base image")
        );
      };

      const splitUnderlayAndLayers = (sideObj) => {
        const objs = Array.isArray(sideObj?.objects) ? sideObj.objects : [];
        const underlay = objs.find(isUnderlayObj);
        const designObjs = objs.filter((o) => !isUnderlayObj(o));
        return {
          underlaySrc: underlay?.src ? this.getImageUrl(underlay.src) : "",
          data: { ...(sideObj || {}), objects: designObjs },
        };
      };

      if (rawLayers && rawLayers.sides) {
        const frontParsed = splitUnderlayAndLayers(rawLayers.sides.front || { objects: [] });
        const backParsed = splitUnderlayAndLayers(rawLayers.sides.back || { objects: [] });
        this.templateUnderlays.front = frontParsed.underlaySrc;
        this.templateUnderlays.back = backParsed.underlaySrc;
        this.sidesData.front = frontParsed.data;
        this.sidesData.back = backParsed.data;
      } else {
        let frontObjs = [];
        if (Array.isArray(rawLayers?.objects)) {
          frontObjs = rawLayers.objects;
        } else if (Array.isArray(rawLayers)) {
          frontObjs = rawLayers;
        }
        const frontParsed = splitUnderlayAndLayers({ objects: frontObjs });
        this.templateUnderlays.front = frontParsed.underlaySrc;
        this.templateUnderlays.back = "";
        this.sidesData.front = frontParsed.data;
        this.sidesData.back = { objects: [] };
      }

      const activeVariant = this.getSelectedVariant();
      this.sideUnderlays = {
        front: this.resolveSideImage("front", activeVariant),
        back: this.resolveSideImage("back", activeVariant),
      };

      this.activeSide = "front";
      await this.loadSideIntoCanvas("front");
      this.buildDynamicControls();
    }

    serializeCanvasObjects() {
      if (!this.fabricCanvas) return { objects: [] };
      const raw = this.fabricCanvas.toObject([
        "name",
        "customType",
        "isCustomerEditable",
        "optionLabel",
        "maxCharacters",
        "enableAiBackgroundRemoval",
        "selectable",
        "evented",
      ]);
      // Exclude dynamic product base image from serialized customer design objects so it never pollutes design layers
      if (raw && Array.isArray(raw.objects)) {
        raw.objects = raw.objects.filter(
          (o) =>
            o.name !== "Product Base Image" &&
            o.customType !== "background_mockup" &&
            o.name !== "Mockup Underlay"
        );
      }
      return raw;
    }

    async loadSideIntoCanvas(side, { skipSeqCheck = false } = {}) {
      if (!this.fabricCanvas) return;
      const loadSeq = skipSeqCheck ? null : ++this._sideLoadSeq;

      let sideData = this.sidesData[side];
      if (!sideData || !Array.isArray(sideData.objects)) {
        sideData = { objects: [] };
      }

      // Clone objects and normalize types + CORS for Fabric 7
      const cleanObjects = sideData.objects
        .filter(
          (o) =>
            o &&
            o.name !== "Product Base Image" &&
            o.customType !== "background_mockup" &&
            o.name !== "Mockup Underlay"
        )
        .map((o) => {
          const copy = { ...o };
          if (copy.type) {
            const lower = copy.type.toLowerCase();
            if (lower === "image") {
              copy.type = "Image";
              if (copy.src && String(copy.src).startsWith("http")) {
                copy.crossOrigin = "anonymous";
              }
            } else if (lower === "rect") copy.type = "Rect";
            else if (lower === "i-text" || lower === "itext") copy.type = "IText";
            else if (lower === "text") copy.type = "Text";
          }
          return copy;
        });

      // 1. Load customer design layers FIRST (since loadFromJSON clears the entire canvas)
      this.fabricCanvas.clear();
      if (cleanObjects.length > 0) {
        try {
          const res = this.fabricCanvas.loadFromJSON({ ...sideData, objects: cleanObjects });
          if (res && typeof res.then === "function") {
            await res;
          }
        } catch (err) {
          console.error("[Saitriq] Error loading side layers:", err);
        }
      }

      if (loadSeq && loadSeq !== this._sideLoadSeq) return;

      this.fabricCanvas.backgroundColor = "#ffffff";

      // 2. Load the side's base product underlay image SECOND (inserts cleanly at bottom index 0)
      const activeVariant = this.getSelectedVariant();
      const sideUnderlay = this.sideUnderlays?.[side] || this.resolveSideImage(side, activeVariant);
      if (sideUnderlay) {
        await this.addBaseProductImage(sideUnderlay, this.canvasW, this.canvasH, loadSeq);
      }

      if (loadSeq && loadSeq !== this._sideLoadSeq) return;

      if (this.fabricCanvas.requestRenderAll) {
        this.fabricCanvas.requestRenderAll();
      } else {
        this.fabricCanvas.renderAll();
      }
    }

    async switchSide(targetSide) {
      if (!targetSide || targetSide === this.activeSide || !this.fabricCanvas) return;

      // Discard selection
      this.fabricCanvas.discardActiveObject();

      // 1. Serialize current canvas
      this.sidesData[this.activeSide] = this.serializeCanvasObjects();

      // 2. Update activeSide state and tabs
      this.activeSide = targetSide;

      const modal = document.getElementById("saitriq-personalizer-modal");
      if (modal) {
        modal.querySelectorAll(".saitriq-side-tab").forEach((tab) => {
          if (tab.getAttribute("data-side") === targetSide) {
            tab.classList.add("is-active");
          } else {
            tab.classList.remove("is-active");
          }
        });
      }

      // 3. Load target side into canvas
      await this.loadSideIntoCanvas(targetSide);

      // 4. Rebuild dynamic controls for target side
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
            <span class="saitriq-card-title">${this.t("product_options", "Product Options")}</span>
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

                // Update Front and Back underlays for the newly selected variant
                const frontImg = this.resolveSideImage("front", matched);
                const backImg = this.resolveSideImage("back", matched);

                this.sideUnderlays = {
                  front: frontImg,
                  back: backImg,
                };

                // Update canvas underlay for whichever side is currently visible!
                const activeUnderlay = this.activeSide === "front" ? frontImg : backImg;
                if (activeUnderlay) {
                  await this.addBaseProductImage(activeUnderlay, this.canvasW || 1200, this.canvasH || 1200);
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
            <span class="saitriq-card-title">${targetObj?.optionLabel || this.t("upload_title", "Upload Photo or Logo")}</span>
          </div>
          <div class="saitriq-card-body">
            <div class="saitriq-upload-dropzone">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p class="saitriq-upload-main-text"><strong>${this.t("upload_browse", "Click to browse")}</strong> ${this.t("upload_or_drag", "or drag & drop")}</p>
              <p class="saitriq-upload-sub-text">${this.t("upload_hint", "High-res PNG, JPG, or WEBP")}</p>
              <input type="file" accept="image/*" style="display: none;" />
            </div>
          </div>
        `;

        const dropzone = photoCard.querySelector(".saitriq-upload-dropzone");
        const fileInput = photoCard.querySelector("input[type='file']");

        const emptyDropzoneMarkup = `
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="saitriq-upload-main-text"><strong>${this.t("upload_browse", "Click to browse")}</strong> ${this.t("upload_or_drag", "or drag & drop")}</p>
          <p class="saitriq-upload-sub-text">${this.t("upload_hint", "High-res PNG, JPG, or WEBP")}</p>
          <input type="file" accept="image/*" style="display: none;" />
        `;

        const bindEmptyDropzoneInput = (dz) => {
          const inp = dz.querySelector("input[type='file']");
          if (inp) {
            inp.addEventListener("change", (e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            });
          }
        };

        const removeUploadedImage = () => {
          const uploadSide = this.activeSide;
          // 1. Remove customer image object from canvas
          const existingImgs = this.fabricCanvas
            .getObjects()
            .filter((o) => o.name === "Customer Uploaded Image" || o.customType === "customer_upload");
          existingImgs.forEach((img) => this.fabricCanvas.remove(img));

          // 2. Clear state in memory
          if (this.customerUploadedImageDataUrls) {
            this.customerUploadedImageDataUrls[uploadSide] = null;
          }
          if (this.customerUploadedImageFileNames) {
            this.customerUploadedImageFileNames[uploadSide] = null;
          }
          if (uploadSide === "front" || !this.customerUploadedImageDataUrls?.front) {
            this.customerUploadedImageDataUrl = null;
            this.customerUploadedImageFileName = null;
          }

          // 3. Serialize and render
          this.sidesData[uploadSide] = this.serializeCanvasObjects();
          this.fabricCanvas.discardActiveObject();
          if (this.fabricCanvas.requestRenderAll) {
            this.fabricCanvas.requestRenderAll();
          } else {
            this.fabricCanvas.renderAll();
          }

          // 4. Reset dropzone to empty state
          dropzone.innerHTML = emptyDropzoneMarkup;
          bindEmptyDropzoneInput(dropzone);
        };

        const bindDropzoneChange = (dz, onSelect) => {
          const inp = dz.querySelector("input[type='file']");
          const chBtn = dz.querySelector(".saitriq-upload-change-btn");
          const rmBtn = dz.querySelector(".saitriq-upload-remove-btn");
          const delBadge = dz.querySelector(".saitriq-upload-thumb-del");

          if (chBtn && inp) {
            chBtn.addEventListener("click", (evt) => {
              evt.stopPropagation();
              inp.click();
            });
          }
          if (rmBtn) {
            rmBtn.addEventListener("click", (evt) => {
              evt.stopPropagation();
              removeUploadedImage();
            });
          }
          if (delBadge) {
            delBadge.addEventListener("click", (evt) => {
              evt.stopPropagation();
              removeUploadedImage();
            });
          }
          if (inp) {
            inp.addEventListener("change", (evt) => {
              const f = evt.target.files?.[0];
              if (f) onSelect(f);
            });
          }
        };

        const renderUploadedThumbnail = (dz, dataUrl, fileName, onSelect) => {
          dz.innerHTML = `
            <div class="saitriq-upload-preview">
              <div class="saitriq-upload-thumb-wrap">
                <img src="${dataUrl}" class="saitriq-upload-thumb" alt="Preview" />
                <button type="button" class="saitriq-upload-thumb-del" title="${this.t("remove_photo", "Remove photo")}">&times;</button>
              </div>
              <div class="saitriq-upload-info">
                <span class="saitriq-upload-name">${fileName || this.t("uploaded_photo", "Uploaded Photo")}</span>
                <span class="saitriq-upload-status">✓ ${this.activeSide === "back" ? this.t("added_to_back_canvas", "Added to Back canvas") : this.t("added_to_front_canvas", "Added to Front canvas")}</span>
              </div>
              <div class="saitriq-upload-actions">
                <button type="button" class="saitriq-upload-change-btn">${this.t("change_photo", "Change")}</button>
                <button type="button" class="saitriq-upload-remove-btn" title="${this.t("remove_photo", "Remove")}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  <span>${this.t("remove_photo", "Remove")}</span>
                </button>
              </div>
            </div>
            <input type="file" accept="image/*" style="display: none;" />
          `;
          bindDropzoneChange(dz, onSelect);
        };

        const handleFile = (file) => {
          if (!file) return;
          const uploadSide = this.activeSide;
          const reader = new FileReader();
          reader.onload = (fEvent) => {
            const dataUrl = fEvent.target?.result;
            this.customerUploadedImageDataUrl = dataUrl;
            if (this.customerUploadedImageDataUrls) {
              this.customerUploadedImageDataUrls[uploadSide] = dataUrl;
            }
            if (this.customerUploadedImageFileNames) {
              this.customerUploadedImageFileNames[uploadSide] = file.name;
            }
            this.customerUploadedImageFileName = file.name;
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
                isCustomerEditable: true,
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

              renderUploadedThumbnail(dropzone, dataUrl, file.name, handleFile);
            };
          };
          reader.readAsDataURL(file);
        };

        // Restore thumbnail if user already uploaded an image for this side
        const existingSideUpload = this.customerUploadedImageDataUrls?.[this.activeSide];
        if (existingSideUpload) {
          renderUploadedThumbnail(
            dropzone,
            existingSideUpload,
            this.customerUploadedImageFileNames?.[this.activeSide] || "Uploaded Photo",
            handleFile
          );
        }

        dropzone.addEventListener("click", (e) => {
          if (
            e.target.closest(".saitriq-upload-change-btn") ||
            e.target.closest(".saitriq-upload-remove-btn") ||
            e.target.closest(".saitriq-upload-thumb-del")
          ) {
            return;
          }
          const curInput = dropzone.querySelector("input[type='file']");
          if (curInput) curInput.click();
        });
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
        const currentAlign = obj.textAlign || "left";
        const textCard = document.createElement("div");
        textCard.className = "saitriq-control-card";
        textCard.innerHTML = `
          <div class="saitriq-card-header">
            <span class="saitriq-card-icon">✏️</span>
            <span class="saitriq-card-title">${obj.optionLabel || `${this.t("custom_text_title", "Custom Text")} ${idx > 1 ? idx : ""}`}</span>
          </div>
          <div class="saitriq-card-body">
            <div class="saitriq-text-controls-row">
              <div class="saitriq-text-col">
                <div class="saitriq-sublabel-row">
                  <label class="saitriq-sublabel">${this.t("your_message", "Your Message / Text")}</label>
                </div>
                <textarea class="saitriq-textarea-input" rows="2" placeholder="${this.t("text_placeholder", "Line 1\nLine 2...").replace(/"/g, '&quot;')}">${obj.text || ""}</textarea>
              </div>

              <div class="saitriq-font-col">
                <div class="saitriq-sublabel-row">
                  <label class="saitriq-sublabel">${this.t("font_family", "Font Family")}</label>
                  <div class="saitriq-align-btn-group" title="Text Alignment">
                    <button type="button" class="saitriq-align-btn ${currentAlign === "left" ? "is-active" : ""}" data-align="left" title="${this.t("align_left", "Align Left")}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
                    </button>
                    <button type="button" class="saitriq-align-btn ${currentAlign === "center" ? "is-active" : ""}" data-align="center" title="${this.t("align_center", "Align Center")}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                    </button>
                    <button type="button" class="saitriq-align-btn ${currentAlign === "right" ? "is-active" : ""}" data-align="right" title="${this.t("align_right", "Align Right")}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <select class="saitriq-select-input">
                  <option value="Roboto">Roboto (Clean Modern)</option>
                  <option value="Montserrat">Montserrat (Geometric Sans)</option>
                  <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                  <option value="Pacifico">Pacifico (Handwritten Script)</option>
                  <option value="Oswald">Oswald (Bold Headline)</option>
                  <option value="Courier New">Courier New (Vintage Monospace)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="saitriq-sublabel">${this.t("print_ink_color", "Print Ink Color")}</label>
              <div class="saitriq-swatches-grid"></div>
            </div>
          </div>
        `;

        const textarea = textCard.querySelector(".saitriq-textarea-input");
        if (obj.maxCharacters) textarea.maxLength = obj.maxCharacters;

        textarea.addEventListener("input", (e) => {
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

        const alignBtns = textCard.querySelectorAll(".saitriq-align-btn");
        alignBtns.forEach((btn) => {
          btn.addEventListener("click", () => {
            const align = btn.getAttribute("data-align");
            alignBtns.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            obj.set("textAlign", align);
            if (this.fabricCanvas.requestRenderAll) {
              this.fabricCanvas.requestRenderAll();
            } else {
              this.fabricCanvas.renderAll();
            }
          });
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
        customColorPicker.title = this.t("pick_custom_color", "Pick custom color");
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
        let selectedAlign = "left";
        const textCard = document.createElement("div");
        textCard.className = "saitriq-control-card";
        textCard.innerHTML = `
          <div class="saitriq-card-header">
            <span class="saitriq-card-icon">✏️</span>
            <span class="saitriq-card-title">Add Custom Text</span>
          </div>
          <div class="saitriq-card-body">
            <div class="saitriq-text-controls-row">
              <div class="saitriq-text-col">
                <div class="saitriq-sublabel-row">
                  <label class="saitriq-sublabel">Your Message / Text</label>
                </div>
                <textarea class="saitriq-textarea-input" rows="2" placeholder="Line 1&#10;Line 2..."></textarea>
              </div>

              <div class="saitriq-font-col">
                <div class="saitriq-sublabel-row">
                  <label class="saitriq-sublabel">Font Family</label>
                  <div class="saitriq-align-btn-group" title="Text Alignment">
                    <button type="button" class="saitriq-align-btn is-active" data-align="left" title="Align Left">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
                    </button>
                    <button type="button" class="saitriq-align-btn" data-align="center" title="Align Center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                    </button>
                    <button type="button" class="saitriq-align-btn" data-align="right" title="Align Right">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <select class="saitriq-select-input">
                  <option value="Roboto">Roboto (Clean Modern)</option>
                  <option value="Montserrat">Montserrat (Geometric Sans)</option>
                  <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                  <option value="Pacifico">Pacifico (Handwritten Script)</option>
                  <option value="Oswald">Oswald (Bold Headline)</option>
                  <option value="Courier New">Courier New (Vintage Monospace)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="saitriq-sublabel">Print Ink Color</label>
              <div class="saitriq-swatches-grid"></div>
            </div>
          </div>
        `;

        const textarea = textCard.querySelector(".saitriq-textarea-input");
        const fontSelect = textCard.querySelector(".saitriq-select-input");
        const swatchesContainer = textCard.querySelector(".saitriq-swatches-grid");

        let activeAddedText = null;
        let selectedFallbackColor = "#111111";

        textarea.addEventListener("input", (e) => {
          const val = e.target.value;
          const ITextClass = window.fabric.IText || window.fabric.Text;
          if (!val) {
            if (activeAddedText) {
              this.fabricCanvas.remove(activeAddedText);
              activeAddedText = null;
              this.fabricCanvas.discardActiveObject();
              if (this.fabricCanvas.requestRenderAll) {
                this.fabricCanvas.requestRenderAll();
              } else {
                this.fabricCanvas.renderAll();
              }
            }
            return;
          }

          if (!activeAddedText) {
            const targetLeft = printRect ? printRect.left : 600;
            const targetTop = printRect ? (printRect.top - 80) : 480;
            activeAddedText = new ITextClass(val, {
              left: targetLeft,
              top: targetTop,
              originX: "center",
              originY: "center",
              fontFamily: fontSelect.value || "Roboto",
              textAlign: selectedAlign,
              fontSize: 48,
              fill: selectedFallbackColor,
              isCustomerEditable: true,
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

        const alignBtns = textCard.querySelectorAll(".saitriq-align-btn");
        alignBtns.forEach((btn) => {
          btn.addEventListener("click", () => {
            const align = btn.getAttribute("data-align");
            alignBtns.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            selectedAlign = align;
            if (activeAddedText) {
              activeAddedText.set("textAlign", align);
              if (this.fabricCanvas.requestRenderAll) {
                this.fabricCanvas.requestRenderAll();
              } else {
                this.fabricCanvas.renderAll();
              }
            }
          });
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
            selectedFallbackColor = col;
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
          selectedFallbackColor = chosen;
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

    async handleAddToCart() {
      if (!this.fabricCanvas) return;

      const submitBtn = document.querySelector(".saitriq-submit-cart-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = this.t("processing_design", "Processing Design...");
      }

      try {
        // 1. Remove active selection and serialize current side
        this.fabricCanvas.discardActiveObject();
        if (this.fabricCanvas.requestRenderAll) {
          this.fabricCanvas.requestRenderAll();
        } else {
          this.fabricCanvas.renderAll();
        }
        await new Promise((r) => setTimeout(r, 60));

        this.sidesData[this.activeSide] = this.serializeCanvasObjects();

        // 2. Helper to export snapshot of a side cleanly
        const exportSideSnapshot = async (side) => {
          if (this.activeSide !== side) {
            this.activeSide = side;
            await this.loadSideIntoCanvas(side, { skipSeqCheck: true });
          }
          this.fabricCanvas.discardActiveObject();
          if (this.fabricCanvas.requestRenderAll) {
            this.fabricCanvas.requestRenderAll();
          } else {
            this.fabricCanvas.renderAll();
          }
          // Allow images/fonts to finish painting onto the 2D context
          await new Promise((r) => setTimeout(r, 120));

          let dataUrl = "";
          try {
            const exportMultiplier = Math.max(1, 600 / (this.fabricCanvas.width || 460));
            dataUrl = this.fabricCanvas.toDataURL({
              format: "jpeg",
              quality: 0.85,
              multiplier: exportMultiplier,
            });
          } catch (exportErr) {
            console.warn("[Saitriq] Export error for side:", side, exportErr);
            try {
              const bg = this.fabricCanvas.getObjects().find(
                (o) => o.customType === "background_mockup" || o.name === "Product Base Image"
              );
              if (bg) bg.visible = false;
              dataUrl = this.fabricCanvas.toDataURL({ format: "jpeg", quality: 0.85 });
              if (bg) bg.visible = true;
            } catch (e2) {
              dataUrl = "";
            }
          }
          return dataUrl;
        };

        const initialSide = this.activeSide;
        const otherSide = initialSide === "front" ? "back" : "front";

        const snapshotCurrent = await exportSideSnapshot(initialSide);
        const snapshotOther = await exportSideSnapshot(otherSide);

        // Restore user's current side in canvas
        if (this.activeSide !== initialSide) {
          this.activeSide = initialSide;
          await this.loadSideIntoCanvas(initialSide, { skipSeqCheck: true });
        }

        const frontPreviewDataUrl = initialSide === "front" ? snapshotCurrent : snapshotOther;
        const backPreviewDataUrl = initialSide === "front" ? snapshotOther : snapshotCurrent;

        const customizationId = "cust_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        const resolvedTemplateId =
          this.templateData?.id || (this.productId ? `tpl-${this.productId}` : "custom-template");

        const shopDomain = (this.shop || window.Shopify?.shop || window.location.hostname || "")
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "")
          .trim();

        const uploadAsset = async (idSuffix, imageData) => {
          if (!imageData || !String(imageData).startsWith("data:image")) return imageData || "";
          const endpoints = ["/apps/personalizer/upload"];
          if (this.appUrl) {
            endpoints.push(`${this.appUrl.replace(/\/$/, "")}/api/storefront/upload`);
          }
          for (const ep of endpoints) {
            try {
              const res = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  customizationId: `${customizationId}_${idSuffix}`,
                  image: imageData,
                  shop: shopDomain,
                }),
              });
              if (res.ok) {
                const json = await res.json();
                if (json.previewUrl || json.directUrl) {
                  return json.previewUrl || json.directUrl;
                }
              }
            } catch (err) {
              console.warn("[Saitriq] Upload notice for", idSuffix, err);
            }
          }
          return imageData;
        };

        // 3. Upload Front & Back Design Previews
        if (submitBtn) submitBtn.textContent = this.t("uploading_front_design", "Uploading Front Design...");
        const finalFrontUrl = frontPreviewDataUrl ? await uploadAsset("front", frontPreviewDataUrl) : "";

        if (submitBtn) submitBtn.textContent = this.t("uploading_back_design", "Uploading Back Design...");
        const finalBackUrl = backPreviewDataUrl ? await uploadAsset("back", backPreviewDataUrl) : "";

        // 4. Upload customer's raw uploaded images independently for Front and Back
        let finalFrontUploadedUrl = "";
        let finalBackUploadedUrl = "";
        const rawFrontPhoto = this.customerUploadedImageDataUrls?.front || null;
        const rawBackPhoto = this.customerUploadedImageDataUrls?.back || null;

        if (rawFrontPhoto) {
          if (submitBtn) submitBtn.textContent = this.t("uploading_front_photo", "Uploading Front Photo...");
          finalFrontUploadedUrl = await uploadAsset("upload_front", rawFrontPhoto);
        }
        if (rawBackPhoto) {
          if (submitBtn) submitBtn.textContent = this.t("uploading_back_photo", "Uploading Back Photo...");
          finalBackUploadedUrl = await uploadAsset("upload_back", rawBackPhoto);
        }
        if (!rawFrontPhoto && !rawBackPhoto && this.customerUploadedImageDataUrl) {
          if (submitBtn) submitBtn.textContent = this.t("uploading_photo", "Uploading Photo...");
          finalFrontUploadedUrl = await uploadAsset("upload", this.customerUploadedImageDataUrl);
        }

        const finalUploadedImageUrl = finalFrontUploadedUrl || finalBackUploadedUrl || "";

        if (submitBtn) submitBtn.textContent = this.t("adding_to_cart", "Adding to Cart...");

        // 5. Gather customer inputs (Clean single-source properties without duplicates)
        const hasBackSide = Boolean(finalBackUrl && this.sidesData.back?.objects?.length > 0);
        const properties = {
          _customization_id: customizationId,
          _template_id: resolvedTemplateId,
          _product_title: this.productTitle || "",
          _customization_preview: finalFrontUrl,
        };

        if (hasBackSide) {
          properties._customization_preview_front = finalFrontUrl;
          properties._customization_preview_back = finalBackUrl;
          properties["Front Preview"] = finalFrontUrl;
          properties["Back Preview"] = finalBackUrl;
        } else {
          properties["Preview"] = finalFrontUrl;
        }

        if (finalFrontUploadedUrl && finalBackUploadedUrl) {
          properties._uploaded_image_front = finalFrontUploadedUrl;
          properties._uploaded_image_back = finalBackUploadedUrl;
          properties["Front Uploaded Photo"] = finalFrontUploadedUrl;
          properties["Back Uploaded Photo"] = finalBackUploadedUrl;
        } else if (finalFrontUploadedUrl) {
          properties._uploaded_image = finalFrontUploadedUrl;
          properties["Uploaded Photo"] = finalFrontUploadedUrl;
        } else if (finalBackUploadedUrl) {
          properties._uploaded_image = finalBackUploadedUrl;
          properties["Uploaded Photo"] = finalBackUploadedUrl;
        }

        // Extract Text, Font Family, and Text Color from BOTH Front and Back side objects
        const extractSideParams = (sideObjects, sideLabel) => {
          if (!Array.isArray(sideObjects)) return;
          let textCounter = 0;
          sideObjects.forEach((obj) => {
            const type = (obj.type || "").toLowerCase();
            if (
              (type.includes("text") || obj.text !== undefined) &&
              !obj.name?.toLowerCase().includes("mockup") &&
              !obj.name?.toLowerCase().includes("base")
            ) {
              const cleanText = obj.text ? String(obj.text).trim() : "";
              if (!cleanText) return;
              textCounter++;
              const suffix = textCounter > 1 ? ` ${textCounter}` : "";
              properties[`${sideLabel} Text${suffix}`] = cleanText;
              if (obj.fontFamily) {
                properties[`${sideLabel} Font${suffix}`] = String(obj.fontFamily);
              }
              if (obj.fill) {
                properties[`${sideLabel} Color${suffix}`] = String(obj.fill);
              }
            }
          });
        };

        extractSideParams(this.sidesData.front?.objects, "Front");
        extractSideParams(this.sidesData.back?.objects, "Back");

        // Remove any empty property values so Shopify stores all populated params cleanly
        Object.keys(properties).forEach((k) => {
          if (properties[k] === undefined || properties[k] === null || properties[k] === "") {
            delete properties[k];
          }
        });

        // 7. Find variant ID from the active Shopify product form or personalizer selection
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
          alert(this.t("error_select_variant", "Could not detect active product variant. Please select a variant on the product page."));
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = this.t("add_to_cart", "Add to Cart with Design");
          }
          return;
        }

        // 8. Store preview in sessionStorage specifically for this customized variant
        try {
          if (frontPreviewDataUrl) {
            sessionStorage.setItem("saitriq_preview_" + variantId, frontPreviewDataUrl);
            sessionStorage.setItem("saitriq_preview_" + customizationId, frontPreviewDataUrl);
          }
          if (finalFrontUrl && finalFrontUrl !== frontPreviewDataUrl) {
            sessionStorage.setItem("saitriq_url_" + variantId, finalFrontUrl);
          }
        } catch (storageErr) {}

        // 9. Submit to Shopify Cart API (/cart/add.js)
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
          alert(errData.description || this.t("error_add_to_cart", "Could not add customized item to cart. Please try again."));
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = this.t("add_to_cart", "Add to Cart with Design");
          }
        }
      } catch (err) {
        console.error("[Saitriq] Error adding to cart:", err);
        alert(this.t("error_add_to_cart", "Could not add customized item to cart. Please try again."));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = this.t("add_to_cart", "Add to Cart with Design");
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
    document.addEventListener("DOMContentLoaded", () => {
      initCartPreviewEnhancer();
    });
  } else {
    initCartPreviewEnhancer();
  }
})();
