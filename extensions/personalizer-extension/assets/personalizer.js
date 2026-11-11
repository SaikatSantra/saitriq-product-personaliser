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
      const maxW = canvasW * 0.94;
      const maxH = canvasH * 0.94;
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
      const targetWidth = Math.min(460, window.innerWidth - 60);
      const canvasW = tpl.canvasWidth || 800;
      const canvasH = tpl.canvasHeight || 800;
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

      // If template has NO uploaded mockup underlay, load the current product's real catalog image!
      const baseImgUrl = this.detectPageProductImage();
      if (!templateHasUnderlay && baseImgUrl) {
        await this.addBaseProductImage(baseImgUrl, canvasW, canvasH);
      }

      if (this.fabricCanvas.requestRenderAll) {
        this.fabricCanvas.requestRenderAll();
      } else {
        this.fabricCanvas.renderAll();
      }

      this.buildDynamicControls();
    }

    buildDynamicControls() {
      const container = document.getElementById("saitriq-dynamic-controls");
      if (!container || !this.fabricCanvas) return;

      container.innerHTML = "";
      const objects = this.fabricCanvas.getObjects();

      let controlIndex = 1;
      let hasTextControl = false;
      let hasUploadControl = false;

      // Find any dashed print area rect if present
      const printRect = objects.find((o) => {
        const type = (o.type || "").toLowerCase();
        return type === "rect" && (o.strokeDashArray || o.customType === "image_upload" || o.name?.includes("Upload"));
      });

      objects.forEach((obj) => {
        const type = (obj.type || "").toLowerCase();

        // Customer Editable Text Layer
        if (
          type === "i-text" ||
          type === "itext" ||
          type === "text" ||
          obj.customType === "text" ||
          (obj.text !== undefined && !obj.name?.toLowerCase().includes("mockup") && !obj.name?.toLowerCase().includes("base"))
        ) {
          hasTextControl = true;
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
            if (this.fabricCanvas.requestRenderAll) {
              this.fabricCanvas.requestRenderAll();
            } else {
              this.fabricCanvas.renderAll();
            }
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
            if (this.fabricCanvas.requestRenderAll) {
              this.fabricCanvas.requestRenderAll();
            } else {
              this.fabricCanvas.renderAll();
            }
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
              if (this.fabricCanvas.requestRenderAll) {
                this.fabricCanvas.requestRenderAll();
              } else {
                this.fabricCanvas.renderAll();
              }
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
        if (
          obj.customType === "image_upload" ||
          obj.name?.toLowerCase().includes("upload") ||
          obj.name?.toLowerCase().includes("photo") ||
          obj.optionLabel?.toLowerCase().includes("photo") ||
          (type === "rect" && obj.strokeDashArray)
        ) {
          hasUploadControl = true;
          const group = document.createElement("div");
          group.className = "saitriq-control-group";

          const label = document.createElement("label");
          label.className = "saitriq-control-label";
          label.textContent = obj.optionLabel || "Upload Your Photo / Logo";

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
                const ImageClass = window.fabric.FabricImage || window.fabric.Image;
                const targetW = (obj.width || 300) * (obj.scaleX || 1);
                const targetH = (obj.height || 300) * (obj.scaleY || 1);
                const bestScale = Math.min(targetW / imgEl.width, targetH / imgEl.height);

                const fabricImg = new ImageClass(imgEl, {
                  left: obj.left,
                  top: obj.top,
                  originX: obj.originX || "center",
                  originY: obj.originY || "center",
                  scaleX: bestScale,
                  scaleY: bestScale,
                  selectable: true,
                  name: "Customer Uploaded Image",
                });

                // Remove placeholder rect and add image
                this.fabricCanvas.remove(obj);
                this.fabricCanvas.add(fabricImg);
                this.fabricCanvas.setActiveObject(fabricImg);
                if (this.fabricCanvas.requestRenderAll) {
                  this.fabricCanvas.requestRenderAll();
                } else {
                  this.fabricCanvas.renderAll();
                }
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

      // Fallback: If no editable text controls exist, provide Add Custom Text
      if (!hasTextControl) {
        const textGroup = document.createElement("div");
        textGroup.className = "saitriq-control-group";

        const label = document.createElement("label");
        label.className = "saitriq-control-label";
        label.textContent = "✏️ Add Custom Text";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "saitriq-text-input";
        input.placeholder = "Type your custom text here...";

        let activeAddedText = null;

        input.addEventListener("input", (e) => {
          const val = e.target.value;
          const ITextClass = window.fabric.IText || window.fabric.Text;
          if (!activeAddedText) {
            const targetLeft = printRect ? printRect.left : 400;
            const targetTop = printRect ? (printRect.top - 60) : 340;
            activeAddedText = new ITextClass(val, {
              left: targetLeft,
              top: targetTop,
              originX: "center",
              originY: "center",
              fontFamily: "Roboto",
              fontSize: 44,
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

        // Font selector
        const fontSelect = document.createElement("select");
        fontSelect.className = "saitriq-select-input";
        fontSelect.style.marginTop = "6px";
        ["Roboto", "Montserrat", "Playfair Display", "Pacifico", "Oswald"].forEach((f) => {
          const opt = document.createElement("option");
          opt.value = f;
          opt.textContent = f;
          fontSelect.appendChild(opt);
        });
        fontSelect.addEventListener("change", (e) => {
          if (activeAddedText) {
            activeAddedText.set("fontFamily", e.target.value);
            this.fabricCanvas.requestRenderAll ? this.fabricCanvas.requestRenderAll() : this.fabricCanvas.renderAll();
          }
        });

        // Color swatches
        const swatchesContainer = document.createElement("div");
        swatchesContainer.className = "saitriq-swatches-grid";
        swatchesContainer.style.marginTop = "6px";
        ["#111111", "#ffffff", "#d72c0d", "#008060", "#005bd3", "#ffc453"].forEach((col) => {
          const swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "saitriq-color-swatch";
          swatch.style.backgroundColor = col;
          swatch.addEventListener("click", () => {
            if (activeAddedText) {
              activeAddedText.set("fill", col);
              this.fabricCanvas.requestRenderAll ? this.fabricCanvas.requestRenderAll() : this.fabricCanvas.renderAll();
            }
          });
          swatchesContainer.appendChild(swatch);
        });

        textGroup.appendChild(label);
        textGroup.appendChild(input);
        textGroup.appendChild(fontSelect);
        textGroup.appendChild(swatchesContainer);
        container.appendChild(textGroup);
      }

      // Fallback: If no upload controls exist, provide Upload Photo / Logo
      if (!hasUploadControl) {
        const uploadGroup = document.createElement("div");
        uploadGroup.className = "saitriq-control-group";

        const label = document.createElement("label");
        label.className = "saitriq-control-label";
        label.textContent = "📷 Upload Photo / Logo";

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
              const ImageClass = window.fabric.FabricImage || window.fabric.Image;
              const targetLeft = printRect ? printRect.left : 400;
              const targetTop = printRect ? printRect.top : 480;
              const targetW = printRect ? (printRect.width * (printRect.scaleX || 1)) : 260;

              const fabricImg = new ImageClass(imgEl, {
                left: targetLeft,
                top: targetTop,
                originX: "center",
                originY: "center",
                scaleX: targetW / imgEl.width,
                scaleY: targetW / imgEl.width,
                selectable: true,
                name: "Customer Uploaded Image",
              });

              this.fabricCanvas.add(fabricImg);
              this.fabricCanvas.setActiveObject(fabricImg);
              if (this.fabricCanvas.requestRenderAll) {
                this.fabricCanvas.requestRenderAll();
              } else {
                this.fabricCanvas.renderAll();
              }
            };
          };
          reader.readAsDataURL(file);
        });

        uploadGroup.appendChild(label);
        uploadGroup.appendChild(dropzone);
        container.appendChild(uploadGroup);
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

        // 4. Find variant ID from the active Shopify product form
        let variantId = null;
        const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
        if (formInput && formInput.value) {
          variantId = formInput.value;
        } else {
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
