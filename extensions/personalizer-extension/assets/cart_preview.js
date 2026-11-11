/**
 * Saitriq Cart Preview Enhancer
 * Automatically swaps default catalog product images with the customer's personalized preview on /cart and cart drawers
 */
(function () {
  let isEnhancing = false;
  let lastProcessedCartHash = "";

  function getPreviewUrl(item) {
    if (!item) return null;

    // 1. Check properties object or array
    if (item.properties) {
      if (Array.isArray(item.properties)) {
        for (const p of item.properties) {
          const k = p.name || p.key || "";
          if (
            (k === "_customization_preview" || k === "Custom Design Preview" || k.includes("preview")) &&
            p.value &&
            typeof p.value === "string" &&
            (p.value.startsWith("http") || p.value.startsWith("/") || p.value.startsWith("data:image"))
          ) {
            return p.value;
          }
        }
      } else if (typeof item.properties === "object") {
        const val =
          item.properties["Custom Design Preview"] ||
          item.properties._customization_preview ||
          item.properties["preview"];
        if (
          val &&
          typeof val === "string" &&
          (val.startsWith("http") || val.startsWith("/") || val.startsWith("data:image"))
        ) {
          return val;
        }
      }
    }

    // 2. Check client-side session storage fallback
    const storedPreview =
      sessionStorage.getItem("saitriq_preview_" + item.variant_id) ||
      sessionStorage.getItem("saitriq_preview_" + item.id) ||
      sessionStorage.getItem("saitriq_latest_preview");

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

      // Build a map of line items with custom previews
      const customItems = [];
      cart.items.forEach((item, idx) => {
        const previewUrl = getPreviewUrl(item);
        if (previewUrl) {
          customItems.push({
            index: idx,
            lineIndex: idx + 1,
            variantId: String(item.variant_id || item.id),
            key: String(item.key || ""),
            handle: item.handle || "",
            title: item.title || "",
            previewUrl: previewUrl,
          });
        }
      });

      if (customItems.length === 0) {
        isEnhancing = false;
        return;
      }

      // Find all cart item containers across Dawn, Spotlight, Sense, Refresh, Craft, and classic themes
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

      // If no explicit row elements found, attempt table row search
      const elementsToProcess =
        cartItemEls.length > 0
          ? cartItemEls
          : Array.from(document.querySelectorAll("table.cart-items tr, .cart__items > *"));

      elementsToProcess.forEach((el, elIdx) => {
        // Find matching customized item
        let matched = null;
        for (const cItem of customItems) {
          if (
            el.id.includes(cItem.variantId) ||
            el.innerHTML.includes(cItem.variantId) ||
            (cItem.key && el.innerHTML.includes(cItem.key)) ||
            (cItem.handle && el.querySelector(`a[href*="${cItem.handle}"]`)) ||
            elementsToProcess.length === 1 ||
            cItem.index === elIdx
          ) {
            matched = cItem;
            break;
          }
        }

        if (!matched || !matched.previewUrl) return;

        // Locate image element
        const img = el.querySelector(
          ".cart-item__image-container img, .cart-item__media img, .cart__image img, .cart-item img, img"
        );
        if (!img) return;

        // Check if already replaced
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
      setTimeout(enhanceCart, 350);
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

  // Backup check after 500ms and 1500ms
  setTimeout(enhanceCart, 500);
  setTimeout(enhanceCart, 1500);
})();
