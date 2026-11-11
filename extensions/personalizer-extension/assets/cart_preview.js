/**
 * Saitriq Cart Preview Enhancer
 * Automatically swaps default catalog product images with the customer's personalized preview on /cart and cart drawers
 * Strictly preserves default catalog images for uncustomized items!
 */
(function () {
  let isEnhancing = false;

  function getCustomPreviewUrl(item) {
    if (!item) return null;

    const props = item.properties;
    if (!props) return null;

    // Check if this line item has customization markers
    let isCustomized = false;
    let previewUrl = null;

    if (Array.isArray(props)) {
      for (const p of props) {
        const k = p.name || p.key || "";
        const v = p.value;
        if (k === "_customization_id" || k === "_template_id" || k === "Custom Design") {
          isCustomized = true;
        }
        if (
          (k === "Custom Design Preview" || k === "_customization_preview" || k.includes("preview")) &&
          v &&
          typeof v === "string" &&
          (v.startsWith("http") || v.startsWith("/") || v.startsWith("data:image"))
        ) {
          previewUrl = v;
          isCustomized = true;
        }
      }
    } else if (typeof props === "object") {
      if (props._customization_id || props._template_id || props["Custom Design"]) {
        isCustomized = true;
      }
      const v = props["Custom Design Preview"] || props._customization_preview || props["preview"];
      if (
        v &&
        typeof v === "string" &&
        (v.startsWith("http") || v.startsWith("/") || v.startsWith("data:image"))
      ) {
        previewUrl = v;
        isCustomized = true;
      }
    }

    // STRICT GUARD: If this item was NOT customized, NEVER touch it!
    if (!isCustomized) {
      return null;
    }

    // If previewUrl found in properties, use it
    if (previewUrl) {
      return previewUrl;
    }

    // Fallback: only check variant-specific sessionStorage if item was proven to be customized
    const variantId = String(item.variant_id || item.id || "");
    const storedPreview = sessionStorage.getItem("saitriq_preview_" + variantId);
    if (
      storedPreview &&
      (storedPreview.startsWith("http") ||
        storedPreview.startsWith("/") ||
        storedPreview.startsWith("data:image"))
    ) {
      return storedPreview;
    }

    return null;
  }

  async function enhanceCart() {
    if (isEnhancing) return;
    isEnhancing = true;

    try {
      const res = await fetch("/cart.js", { headers: { Accept: "application/json" } });
      if (!res.ok) {
        isEnhancing = false;
        return;
      }
      const cart = await res.json();
      if (!cart || !cart.items || cart.items.length === 0) {
        isEnhancing = false;
        return;
      }

      // Collect ONLY items that were actually customized
      const customItemsMap = new Map();
      cart.items.forEach((item, idx) => {
        const previewUrl = getCustomPreviewUrl(item);
        if (previewUrl) {
          const vId = String(item.variant_id || item.id);
          customItemsMap.set(vId, {
            index: idx,
            lineIndex: idx + 1,
            variantId: vId,
            key: String(item.key || ""),
            handle: item.handle || "",
            title: item.title || "",
            previewUrl: previewUrl,
          });
        }
      });

      // If no items in cart are customized, do not touch any cart images
      if (customItemsMap.size === 0) {
        isEnhancing = false;
        return;
      }

      // Find cart item containers across Dawn, Spotlight, Sense, Refresh, Craft, and classic themes
      const rowSelectors = [
        "tr.cart-item",
        ".cart-item",
        "[id^='CartItem-']",
        ".cart__item",
        ".line-item",
        ".cart-drawer__item",
        "cart-drawer-item",
        ".cart-drawer .cart-item",
      ];
      const cartItemEls = Array.from(document.querySelectorAll(rowSelectors.join(", ")));
      const elementsToProcess =
        cartItemEls.length > 0
          ? cartItemEls
          : Array.from(document.querySelectorAll("table.cart-items tr, .cart__items > *"));

      elementsToProcess.forEach((el, elIdx) => {
        // STRICT MATCH: Must match this specific customized variant
        let matched = null;
        for (const [vId, cItem] of customItemsMap.entries()) {
          const elHtml = el.innerHTML || "";
          if (
            el.id.includes(vId) ||
            elHtml.includes(vId) ||
            (cItem.key && elHtml.includes(cItem.key)) ||
            (cItem.handle && el.querySelector(`a[href*="${cItem.handle}"]`))
          ) {
            matched = cItem;
            break;
          }
        }

        if (!matched || !matched.previewUrl) return;

        // Locate image element within the matched cart row
        const img = el.querySelector(
          ".cart-item__image-container img, .cart-item__media img, .cart__image img, .cart-item img, img"
        );
        if (!img) return;

        // Prevent repeated swap if already applied
        if (img.getAttribute("data-saitriq-replaced") === matched.previewUrl) {
          return;
        }

        // Apply custom preview
        img.removeAttribute("srcset");
        img.removeAttribute("loading");
        img.src = matched.previewUrl;
        img.setAttribute("data-saitriq-replaced", matched.previewUrl);
        img.style.objectFit = "contain";
        img.style.borderRadius = "8px";
        img.style.backgroundColor = "#ffffff";
        img.style.border = "1px solid #e1e3e5";

        // Remove source tags if wrapped in <picture>
        const pic = img.closest("picture");
        if (pic) {
          pic.querySelectorAll("source").forEach((s) => s.remove());
        }

        // Add visual badge
        if (!el.querySelector(".saitriq-cart-badge")) {
          const badge = document.createElement("div");
          badge.className = "saitriq-cart-badge";
          badge.innerHTML = `
            <span style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 11px;
              background: #e3f1df;
              color: #108043;
              padding: 2px 8px;
              border-radius: 12px;
              font-weight: 600;
              margin-top: 6px;
            ">
              ✨ Personalized Design
            </span>
          `;
          const textContainer = el.querySelector(
            ".cart-item__details, .cart-item__info, .cart-item__name, .product-title, .cart__item-title, td"
          );
          if (textContainer) {
            textContainer.appendChild(badge);
          }
        }
      });
    } catch (err) {
      console.warn("[Saitriq Cart Preview] Notice:", err);
    } finally {
      isEnhancing = false;
    }
  }

  // Run on initial page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceCart);
  } else {
    enhanceCart();
  }

  // Run on standard Shopify storefront cart events
  const cartEvents = ["cart:updated", "cart:refresh", "cart:change", "cart:build", "pageshow"];
  cartEvents.forEach((ev) => {
    document.addEventListener(ev, () => {
      setTimeout(enhanceCart, 50);
      setTimeout(enhanceCart, 300);
    });
    window.addEventListener(ev, () => {
      setTimeout(enhanceCart, 50);
    });
  });

  // Observe DOM for dynamic cart drawer opening/updates
  let observerTimeout = null;
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    if (shouldCheck) {
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(enhanceCart, 150);
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  setTimeout(enhanceCart, 500);
  setTimeout(enhanceCart, 1500);
})();
