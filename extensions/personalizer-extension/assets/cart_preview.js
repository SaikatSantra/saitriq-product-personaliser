/**
 * Saitriq Cart Preview Enhancer
 * Automatically swaps default product images with customer's personalized preview on /cart and cart drawers
 */
(function () {
  async function enhanceCartCustomizations() {
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
          customizedMap.set(String(item.variant_id), {
            preview,
            lineIndex: index + 1,
            key: item.key,
            title: item.title,
          });
        }
      });

      if (customizedMap.size === 0) return;

      // Selectors for Dawn, Spotlight, Sense, Refresh, Craft, and vintage themes
      const cartItemEls = document.querySelectorAll(
        "tr.cart-item, .cart-item, [id^='CartItem-'], .cart__item, .line-item, .cart-drawer__item"
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
    } catch (err) {
      console.warn("[Saitriq] Cart preview enhancer notice:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceCartCustomizations);
  } else {
    enhanceCartCustomizations();
  }

  document.addEventListener("cart:updated", enhanceCartCustomizations);
  document.addEventListener("cart:refresh", enhanceCartCustomizations);
  document.addEventListener("cart:change", enhanceCartCustomizations);
  window.addEventListener("pageshow", enhanceCartCustomizations);

  // Poll once briefly after navigation to catch dynamic cart drawer renders
  setTimeout(enhanceCartCustomizations, 400);
  setTimeout(enhanceCartCustomizations, 1200);
})();
