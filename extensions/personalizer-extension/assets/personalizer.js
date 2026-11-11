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
      this.shop = this.getAttribute("data-shop") || window.location.hostname;
      this.appUrl = this.getAttribute("data-app-url") || "";
      this.buttonText = this.getAttribute("data-button-text") || "🎨 Customize This Product";
      this.primaryColor = this.getAttribute("data-primary-color") || "#008060";
      this.autoOpen = this.getAttribute("data-auto-open") === "true";
      this.isDesignMode = this.getAttribute("data-design-mode") === "true" || window.Shopify?.designMode === true;

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

    handleTriggerClick() {
      if (this.templateData) {
        this.openModal();
      } else if (this.isLoading) {
        this.pendingOpen = true;
        if (this.btn) this.btn.textContent = "⏳ Loading studio...";
      } else {
        // Fallback demo template if offline or no template assigned yet
        this.templateData = this.getDefaultPreviewTemplate();
        this.openModal();
      }
    }

    getDefaultPreviewTemplate() {
      return {
        id: "preview-default-tpl",
        title: "Product Personalizer Preview",
        canvasWidth: 800,
        canvasHeight: 800,
        printDpi: 300,
        layers: [
          {
            type: "i-text",
            text: "Your Custom Text",
            fontSize: 40,
            fontFamily: "Roboto",
            fill: "#111111",
            left: 240,
            top: 240,
            optionLabel: "Front Custom Text",
            maxCharacters: 30,
          },
          {
            type: "rect",
            customType: "image_upload",
            name: "Photo Upload Zone",
            optionLabel: "Upload Photo / Logo",
            left: 250,
            top: 360,
            width: 300,
            height: 220,
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
        let endpoint = "";
        if (this.appUrl) {
          const base = this.appUrl.replace(/\/$/, "");
          endpoint = `${base}/api/storefront/template?shop=${encodeURIComponent(this.shop)}&productId=${encodeURIComponent(this.productId)}`;
        } else {
          // Native Shopify App Proxy path (same-origin, zero config)
          endpoint = `/apps/personalizer/template?shop=${encodeURIComponent(this.shop)}&productId=${encodeURIComponent(this.productId)}`;
        }

        let response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
        }).catch(() => null);

        // Fallback to direct relative path if proxy not resolved
        if ((!response || !response.ok) && !this.appUrl) {
          endpoint = `/api/storefront/template?shop=${encodeURIComponent(this.shop)}&productId=${encodeURIComponent(this.productId)}`;
          response = await fetch(endpoint, { headers: { Accept: "application/json" } }).catch(() => null);
        }

        if (response && response.ok) {
          const data = await response.json().catch(() => null);
          if (data && data.hasCustomizer && data.template) {
            this.templateData = data.template;
          }
        }
      } catch (err) {
        console.warn("[Saitriq] Storefront endpoint fetch exception:", err);
      } finally {
        this.isLoading = false;
        if (!this.templateData && (this.isDesignMode || this.pendingOpen)) {
          this.templateData = this.getDefaultPreviewTemplate();
        }

        if (this.btn) {
          this.btn.textContent = this.buttonText;
        }

        if (this.pendingOpen || this.autoOpen) {
          this.pendingOpen = false;
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
            <h3>Customize Your Design</h3>
            <button type="button" class="saitriq-close-btn" aria-label="Close">&times;</button>
          </div>
          
          <div class="saitriq-modal-body">
            <!-- Canvas Preview -->
            <div class="saitriq-canvas-viewport">
              <div class="saitriq-canvas-stage">
                <canvas id="saitriq-storefront-canvas"></canvas>
              </div>
            </div>

            <!-- Customizer Controls -->
            <div class="saitriq-controls-panel">
              <div id="saitriq-dynamic-controls">
                <!-- Injected dynamically from template layers -->
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="saitriq-modal-footer">
            <div class="saitriq-preview-info">
              <span>✨ Live 300 DPI Preview</span>
            </div>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="saitriq-close-btn-secondary" style="background: none; border: 1px solid #c9cccf; padding: 10px 16px; border-radius: 6px; cursor: pointer;">
                Cancel
              </button>
              <button type="button" class="saitriq-submit-cart-btn">
                Add to Cart with Design
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
      if (window.fabric) return;
      return new Promise((resolve) => {
        const existing = document.querySelector('script[src*="fabric"]');
        if (existing) {
          if (window.fabric) return resolve();
          existing.addEventListener("load", resolve, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js";
        script.async = true;
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    }

    async initFabricCanvas() {
      await this.ensureFabric();
      if (!window.fabric) {
        console.warn("[Saitriq] Waiting for Fabric.js to load from CDN...");
        setTimeout(() => this.initFabricCanvas(), 100);
        return;
      }

      const canvasEl = document.getElementById("saitriq-storefront-canvas");
      if (!canvasEl) return;

      if (this.fabricCanvas) {
        this.fabricCanvas.dispose();
      }

      const tpl = this.templateData || this.getDefaultPreviewTemplate();
      const targetWidth = Math.min(460, window.innerWidth - 60);
      const scale = targetWidth / (tpl.canvasWidth || 800);

      this.fabricCanvas = new window.fabric.Canvas(canvasEl, {
        width: (tpl.canvasWidth || 800) * scale,
        height: (tpl.canvasHeight || 800) * scale,
        backgroundColor: "#ffffff",
        selection: false,
      });

      this.fabricCanvas.setZoom(scale);

      // Load layers
      if (tpl.layers && tpl.layers.objects) {
        this.fabricCanvas.loadFromJSON(tpl.layers, () => {
          this.fabricCanvas.renderAll();
          this.buildDynamicControls();
        });
      } else if (Array.isArray(tpl.layers) && tpl.layers.length > 0) {
        this.fabricCanvas.loadFromJSON({ objects: tpl.layers }, () => {
          this.fabricCanvas.renderAll();
          this.buildDynamicControls();
        });
      } else {
        this.buildDynamicControls();
      }
    }

    buildDynamicControls() {
      const container = document.getElementById("saitriq-dynamic-controls");
      if (!container || !this.fabricCanvas) return;

      container.innerHTML = "";
      const objects = this.fabricCanvas.getObjects();

      let controlIndex = 1;

      objects.forEach((obj) => {
        // Customer Editable Text Layer
        if (obj.type === "i-text" || obj.type === "text") {
          const group = document.createElement("div");
          group.className = "saitriq-control-group";

          const label = document.createElement("label");
          label.className = "saitriq-control-label";
          label.textContent = obj.optionLabel || `Custom Text ${controlIndex}`;

          const input = document.createElement("input");
          input.type = "text";
          input.className = "saitriq-text-input";
          input.value = obj.text || "";
          input.placeholder = "Enter your text...";
          if (obj.maxCharacters) input.maxLength = obj.maxCharacters;

          input.addEventListener("input", (e) => {
            obj.set("text", e.target.value);
            this.fabricCanvas.renderAll();
          });

          // Font Selector
          const fontSelect = document.createElement("select");
          fontSelect.className = "saitriq-select-input";
          fontSelect.style.marginTop = "6px";
          const fonts = ["Roboto", "Montserrat", "Playfair Display", "Pacifico", "Oswald", "Courier New"];
          fonts.forEach((f) => {
            const opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            if (obj.fontFamily === f) opt.selected = true;
            fontSelect.appendChild(opt);
          });

          fontSelect.addEventListener("change", (e) => {
            obj.set("fontFamily", e.target.value);
            this.fabricCanvas.renderAll();
          });

          // Color Swatches
          const swatchesContainer = document.createElement("div");
          swatchesContainer.className = "saitriq-swatches-grid";
          swatchesContainer.style.marginTop = "6px";

          const colors = ["#111111", "#ffffff", "#d72c0d", "#008060", "#005bd3", "#ffc453", "#9c6ade"];
          colors.forEach((col) => {
            const swatch = document.createElement("button");
            swatch.type = "button";
            swatch.className = "saitriq-color-swatch";
            swatch.style.backgroundColor = col;
            swatch.addEventListener("click", () => {
              obj.set("fill", col);
              this.fabricCanvas.renderAll();
            });
            swatchesContainer.appendChild(swatch);
          });

          group.appendChild(label);
          group.appendChild(input);
          group.appendChild(fontSelect);
          group.appendChild(swatchesContainer);
          container.appendChild(group);

          controlIndex++;
        }

        // Photo Upload Zone
        if (obj.customType === "image_upload" || obj.name?.includes("Photo Upload") || obj.optionLabel?.includes("Photo")) {
          const group = document.createElement("div");
          group.className = "saitriq-control-group";

          const label = document.createElement("label");
          label.className = "saitriq-control-label";
          label.textContent = obj.optionLabel || "Upload Your Photo";

          const dropzone = document.createElement("div");
          dropzone.className = "saitriq-upload-dropzone";
          dropzone.innerHTML = `
            <div class="saitriq-upload-icon">📷</div>
            <p><strong>Click to browse</strong> or drag & drop photo</p>
            <p style="font-size: 11px; margin-top: 4px;">Supports JPG, PNG, WEBP</p>
            <input type="file" accept="image/*" style="display: none;" />
          `;

          const fileInput = dropzone.querySelector("input");
          dropzone.addEventListener("click", () => fileInput.click());

          fileInput.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (fEvent) => {
              const dataUrl = fEvent.target?.result;
              const imgEl = new Image();
              imgEl.src = dataUrl;
              imgEl.onload = () => {
                const fabricImg = new window.fabric.Image(imgEl, {
                  left: obj.left,
                  top: obj.top,
                  scaleX: (obj.width || 300) / imgEl.width,
                  scaleY: (obj.height || 200) / imgEl.height,
                  selectable: true,
                  name: "Customer Uploaded Image",
                });

                // Remove placeholder rect and add image
                this.fabricCanvas.remove(obj);
                this.fabricCanvas.add(fabricImg);
                this.fabricCanvas.renderAll();
              };
            };
            reader.readAsDataURL(file);
          });

          group.appendChild(label);
          group.appendChild(dropzone);
          container.appendChild(group);

          controlIndex++;
        }
      });
    }

    async handleAddToCart() {
      if (!this.fabricCanvas) return;

      const submitBtn = document.querySelector(".saitriq-submit-cart-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Processing Design...";
      }

      try {
        // 1. Generate snapshot preview PNG
        const previewDataUrl = this.fabricCanvas.toDataURL({
          format: "png",
          multiplier: 1,
        });

        const customizationId = "cust_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);

        // 2. Gather customer inputs for line item properties
        const properties = {
          _customization_id: customizationId,
          _template_id: this.templateData?.id || "default",
          _customization_preview: previewDataUrl,
        };

        const objects = this.fabricCanvas.getObjects();
        objects.forEach((obj, idx) => {
          if (obj.type === "i-text" || obj.type === "text") {
            properties[obj.optionLabel || `Custom Text ${idx + 1}`] = obj.text;
          }
        });

        // 3. Find variant ID from the active Shopify product form
        let variantId = null;
        const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
        if (formInput && formInput.value) {
          variantId = formInput.value;
        } else {
          // Look for any select or input name="id"
          const anyIdInput = document.querySelector('input[name="id"], select[name="id"]');
          if (anyIdInput && anyIdInput.value) {
            variantId = anyIdInput.value;
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

        // 4. Submit to Shopify Cart API (/cart/add.js)
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
          this.closeModal();
          // Redirect to cart or trigger cart drawer
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
})();
