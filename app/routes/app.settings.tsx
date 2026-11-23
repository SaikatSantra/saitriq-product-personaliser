import { useState, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../models/shop.server";

export interface LanguageDefinition {
  name: string;
  isDefault: boolean;
  strings: Record<string, string>;
}

export const PRESET_LANGUAGES: Record<string, { name: string; strings: Record<string, string> }> = {
  en: {
    name: "English",
    strings: {
      button_text: "🎨 Customize This Product",
      modal_title: "Customize Your Design",
      modal_subtitle: "Personalize text, upload photos & preview live",
      front_side: "Front Side",
      back_side: "Back Side",
      custom_text_title: "Add Custom Text",
      your_message: "Your Message / Text",
      text_placeholder: "Line 1\nLine 2...",
      font_family: "Font Family",
      print_ink_color: "Print Ink Color",
      upload_title: "Upload Photo or Logo",
      upload_hint: "High-res PNG, JPG, or WEBP",
      change_photo: "Change",
      remove_photo: "Remove",
      cancel: "Cancel",
      add_to_cart: "Add to Cart with Design",
      adding_to_cart: "Adding to Cart...",
    },
  },
  es: {
    name: "Spanish (Español)",
    strings: {
      button_text: "🎨 Personalizar este producto",
      modal_title: "Personaliza tu diseño",
      modal_subtitle: "Personaliza texto, sube fotos y previsualiza en vivo",
      front_side: "Lado frontal",
      back_side: "Lado posterior",
      custom_text_title: "Añadir texto personalizado",
      your_message: "Tu mensaje / texto",
      text_placeholder: "Línea 1\nLínea 2...",
      font_family: "Tipo de letra",
      print_ink_color: "Color de tinta",
      upload_title: "Subir foto o logotipo",
      upload_hint: "Alta resolución PNG, JPG o WEBP",
      change_photo: "Cambiar",
      remove_photo: "Eliminar",
      cancel: "Cancelar",
      add_to_cart: "Añadir al carrito con diseño",
      adding_to_cart: "Añadiendo al carrito...",
    },
  },
  fr: {
    name: "French (Français)",
    strings: {
      button_text: "🎨 Personnaliser ce produit",
      modal_title: "Personnalisez votre design",
      modal_subtitle: "Personnalisez le texte, importez des photos et prévisualisez en direct",
      front_side: "Côté avant",
      back_side: "Côté arrière",
      custom_text_title: "Ajouter un texte personnalisé",
      your_message: "Votre message / texte",
      text_placeholder: "Ligne 1\nLigne 2...",
      font_family: "Police d'écriture",
      print_ink_color: "Couleur d'impression",
      upload_title: "Importer une photo ou un logo",
      upload_hint: "Haute résolution PNG, JPG ou WEBP",
      change_photo: "Modifier",
      remove_photo: "Supprimer",
      cancel: "Annuler",
      add_to_cart: "Ajouter au panier avec le design",
      adding_to_cart: "Ajout au panier...",
    },
  },
  de: {
    name: "German (Deutsch)",
    strings: {
      button_text: "🎨 Produkt personalisieren",
      modal_title: "Design personalisieren",
      modal_subtitle: "Text anpassen, Fotos hochladen und live vorschauen",
      front_side: "Vorderseite",
      back_side: "Rückseite",
      custom_text_title: "Eigenen Text hinzufügen",
      your_message: "Ihre Nachricht / Text",
      text_placeholder: "Zeile 1\nZeile 2...",
      font_family: "Schriftart",
      print_ink_color: "Druckfarbe",
      upload_title: "Foto oder Logo hochladen",
      upload_hint: "Hohe Auflösung PNG, JPG oder WEBP",
      change_photo: "Ändern",
      remove_photo: "Entfernen",
      cancel: "Abbrechen",
      add_to_cart: "Mit Design in den Warenkorb",
      adding_to_cart: "Wird zum Warenkorb hinzugefügt...",
    },
  },
  it: {
    name: "Italian (Italiano)",
    strings: {
      button_text: "🎨 Personalizza questo prodotto",
      modal_title: "Personalizza il tuo design",
      modal_subtitle: "Personalizza il testo, carica foto e guarda l'anteprima in tempo reale",
      front_side: "Lato frontale",
      back_side: "Lato posteriore",
      custom_text_title: "Aggiungi testo personalizzato",
      your_message: "Il tuo messaggio / testo",
      text_placeholder: "Riga 1\nRiga 2...",
      font_family: "Carattere tipografico",
      print_ink_color: "Colore inchiostro",
      upload_title: "Carica foto o logo",
      upload_hint: "Alta risoluzione PNG, JPG o WEBP",
      change_photo: "Modifica",
      remove_photo: "Rimuovi",
      cancel: "Annulla",
      add_to_cart: "Aggiungi al carrello con design",
      adding_to_cart: "Aggiunta al carrello...",
    },
  },
};

export const DEFAULT_LANGUAGES: Record<string, LanguageDefinition> = {
  en: {
    name: "English",
    isDefault: true,
    strings: { ...PRESET_LANGUAGES.en.strings },
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  let settings = {
    defaultDpi: 300,
    primaryColor: "#008060",
    languages: DEFAULT_LANGUAGES,
  };

  try {
    const parsed = JSON.parse(shop.settings || "{}");
    let loadedLangs = parsed.languages;
    if (!loadedLangs || Object.keys(loadedLangs).length === 0) {
      loadedLangs = DEFAULT_LANGUAGES;
      if (parsed.storefrontText) {
        loadedLangs.en = {
          name: "English",
          isDefault: true,
          strings: { ...PRESET_LANGUAGES.en.strings, ...parsed.storefrontText },
        };
      }
    }
    settings = {
      ...settings,
      ...parsed,
      languages: loadedLangs,
    };
  } catch {}

  return { shop: session.shop, settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  let languages = DEFAULT_LANGUAGES;
  const languagesJson = formData.get("languages") as string;
  try {
    if (languagesJson) {
      languages = JSON.parse(languagesJson);
    }
  } catch {}

  const defaultDpi = parseInt(formData.get("defaultDpi") as string) || 300;
  const primaryColor = (formData.get("primaryColor") as string)?.trim() || "#008060";

  // Preserve existing settings while cleaning out obsolete keys
  const shop = await ensureShop(session.shop);
  let currentSettings: any = {};
  try {
    currentSettings = JSON.parse(shop.settings || "{}");
  } catch {}

  const newSettings = {
    ...currentSettings,
    defaultDpi,
    primaryColor,
    languages,
  };

  // Remove obsolete keys
  delete newSettings.storageProvider;
  delete newSettings.enableAiBackgroundRemoval;
  delete newSettings.s3Bucket;
  delete newSettings.s3Region;
  delete newSettings.printfulApiKey;
  delete newSettings.printifyApiKey;

  await prisma.shop.update({
    where: { shopifyDomain: session.shop },
    data: {
      settings: JSON.stringify(newSettings),
      updatedAt: new Date(),
    },
  });

  return { success: true, message: "Settings and multi-language translations saved successfully!" };
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [defaultDpi, setDefaultDpi] = useState(settings.defaultDpi || 300);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || "#008060");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Multilingual state
  const [languages, setLanguages] = useState<Record<string, LanguageDefinition>>(
    settings.languages || DEFAULT_LANGUAGES,
  );
  const [activeLangCode, setActiveLangCode] = useState<string>("en");
  const [newLangPreset, setNewLangPreset] = useState<string>("es");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const activeLang = languages[activeLangCode] || languages["en"] || {
    name: "English",
    isDefault: true,
    strings: PRESET_LANGUAGES.en.strings,
  };

  const updateActiveString = (key: string, val: string) => {
    setLanguages((prev) => {
      const cur = prev[activeLangCode] || {
        name: activeLangCode,
        isDefault: false,
        strings: {},
      };
      return {
        ...prev,
        [activeLangCode]: {
          ...cur,
          strings: {
            ...cur.strings,
            [key]: val,
          },
        },
      };
    });
  };

  const handleAddLanguage = () => {
    setErrorMessage(null);
    if (languages[newLangPreset]) {
      setActiveLangCode(newLangPreset);
      return;
    }
    const preset = PRESET_LANGUAGES[newLangPreset];
    const newEntry: LanguageDefinition = {
      name: preset ? preset.name : newLangPreset.toUpperCase(),
      isDefault: false,
      strings: preset ? { ...preset.strings } : { ...PRESET_LANGUAGES.en.strings },
    };
    setLanguages((prev) => ({
      ...prev,
      [newLangPreset]: newEntry,
    }));
    setActiveLangCode(newLangPreset);
  };

  const handleRemoveLanguage = (code: string) => {
    if (code === "en" || languages[code]?.isDefault) {
      setErrorMessage("Cannot remove the default store language. Set another language as default first.");
      return;
    }
    setErrorMessage(null);
    setLanguages((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    setActiveLangCode("en");
  };

  const handleSetDefaultLanguage = (code: string) => {
    setErrorMessage(null);
    setLanguages((prev) => {
      const next: Record<string, LanguageDefinition> = {};
      Object.keys(prev).forEach((k) => {
        next[k] = {
          ...prev[k],
          isDefault: k === code,
        };
      });
      return next;
    });
  };

  const handleSave = () => {
    setErrorMessage(null);
    fetcher.submit(
      {
        defaultDpi: defaultDpi.toString(),
        primaryColor,
        languages: JSON.stringify(languages),
      },
      { method: "POST" },
    );
  };

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

  const languageFlags: Record<string, string> = {
    en: "🇬🇧",
    es: "🇪🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    it: "🇮🇹",
  };

  // Human-readable labels and descriptions for all translation keys
  const stringDefinitions: Array<{ key: string; label: string; desc: string; icon: string }> = [
    { key: "button_text", label: "Customize Button Text", desc: "Text on the main storefront product page trigger button", icon: "🔘" },
    { key: "modal_title", label: "Modal Header Title", desc: "Main title shown at the top of the personalizer studio window", icon: "🎨" },
    { key: "modal_subtitle", label: "Modal Subtitle", desc: "Helper subtitle explaining customization capabilities", icon: "💬" },
    { key: "front_side", label: "Front Side Tab", desc: "Label for the front-view switcher tab", icon: "👕" },
    { key: "back_side", label: "Back Side Tab", desc: "Label for the back-view switcher tab", icon: "🔄" },
    { key: "custom_text_title", label: "Text Section Title", desc: "Header for the text customization card", icon: "✏️" },
    { key: "your_message", label: "Text Input Label", desc: "Label above the customer text input area", icon: "✍️" },
    { key: "text_placeholder", label: "Text Placeholder", desc: "Hint shown inside the empty text area", icon: "📝" },
    { key: "font_family", label: "Font Selector Label", desc: "Label for the font dropdown menu", icon: "🔤" },
    { key: "print_ink_color", label: "Ink Color Label", desc: "Label above the ink swatch palette", icon: "🌈" },
    { key: "upload_title", label: "Upload Card Title", desc: "Header for the customer photo/logo upload zone", icon: "📷" },
    { key: "upload_hint", label: "Upload File Hint", desc: "Explains allowed file formats (PNG, JPG, WEBP)", icon: "💡" },
    { key: "change_photo", label: "Change Photo Button", desc: "Button shown when replacing an uploaded image", icon: "🔁" },
    { key: "remove_photo", label: "Remove Photo Button", desc: "Button to clear an uploaded image from canvas", icon: "🗑️" },
    { key: "cancel", label: "Cancel Button", desc: "Closes the studio without saving changes", icon: "✕" },
    { key: "add_to_cart", label: "Add to Cart Button", desc: "Main checkout button with customized print files", icon: "🛒" },
    { key: "adding_to_cart", label: "Adding to Cart State", desc: "Temporary state shown while uploading & adding to cart", icon: "⏳" },
  ];

  const filteredStrings = useMemo(() => {
    if (!searchFilter.trim()) return stringDefinitions;
    const q = searchFilter.toLowerCase().trim();
    return stringDefinitions.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        (activeLang.strings[s.key] || "").toLowerCase().includes(q),
    );
  }, [searchFilter, activeLang.strings]);

  const presetColors = [
    { label: "Shopify Emerald", hex: "#008060" },
    { label: "Royal Blue", hex: "#2563eb" },
    { label: "Modern Black", hex: "#111111" },
    { label: "Crimson Red", hex: "#dc2626" },
    { label: "Elegant Purple", hex: "#9333ea" },
    { label: "Sunset Amber", hex: "#d97706" },
  ];

  return (
    <s-page heading="Settings">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Save settings"}
      </s-button>

      {/* Success Notification Banner */}
      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">{fetcher.data.message}</s-banner>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMessage && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="critical" dismissible onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </s-banner>
        </div>
      )}

      {/* Polaris Info Banner */}
      <div style={{ marginBottom: "16px" }}>
        <s-banner tone="info" heading="Shopify Files CDN & 300 DPI print output">
          Customer mockups and print-ready files are automatically stored on your Shopify store's native CDN with zero external configuration required.
        </s-banner>
      </div>

      {/* Main Grid: 2 Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "16px",
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN: Multilingual Management */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              padding: "16px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            {/* Header & Add Language */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "18px",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  🌐 Multi-Language Translations
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  Edit all storefront texts in any language. Shoppers see the matching translation automatically.
                </p>
              </div>

              {/* Add Language Dropdown */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                  value={newLangPreset}
                  onChange={(e) => setNewLangPreset(e.target.value)}
                  style={{
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    background: "#fff",
                  }}
                >
                  <option value="es">🇪🇸 Spanish (Español)</option>
                  <option value="fr">🇫🇷 French (Français)</option>
                  <option value="de">🇩🇪 German (Deutsch)</option>
                  <option value="it">🇮🇹 Italian (Italiano)</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddLanguage}
                  style={{
                    background: "#008060",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "7px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Language Selection Tabs */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: "12px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              {Object.keys(languages).map((code) => {
                const lang = languages[code];
                const isActive = activeLangCode === code;
                const flag = languageFlags[code] || "🌐";

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setActiveLangCode(code)}
                    style={{
                      background: isActive ? "#008060" : "#f8fafc",
                      color: isActive ? "#ffffff" : "#334155",
                      border: `1px solid ${isActive ? "#008060" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>{flag}</span>
                    <span>{lang.name}</span>
                    {lang.isDefault && (
                      <span
                        style={{
                          fontSize: "10px",
                          background: isActive ? "rgba(255,255,255,0.25)" : "#e2e8f0",
                          padding: "1px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        Default
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Language Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f8fafc",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                Editing: {activeLang.name} {activeLang.isDefault ? "(Default Store Language)" : ""}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {!activeLang.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefaultLanguage(activeLangCode)}
                    style={{
                      background: "#fff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      color: "#334155",
                    }}
                  >
                    ⭐ Set as Default
                  </button>
                )}
                {activeLangCode !== "en" && !activeLang.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLanguage(activeLangCode)}
                    style={{
                      background: "#fff5f5",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      color: "#dc2626",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Search Filter for Translation Keys */}
            <div style={{ marginBottom: "16px" }}>
              <input
                type="text"
                placeholder="🔍 Filter translation fields (e.g., button, upload, cart)..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Translation Inputs List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {filteredStrings.map((item) => {
                const currentVal = activeLang.strings[item.key] ?? "";

                return (
                  <div
                    key={item.key}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span>{item.icon}</span>
                      <label style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                        {item.label}
                      </label>
                      <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>
                        ({item.key})
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                      {item.desc}
                    </div>
                    <input
                      type="text"
                      value={currentVal}
                      onChange={(e) => updateActiveString(item.key, e.target.value)}
                      placeholder={PRESET_LANGUAGES.en.strings[item.key] || item.label}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Button Styling & Production Specs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Storefront Button Appearance Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              padding: "22px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              🎨 Storefront Button Styling
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
              Control the primary accent color and preview how the trigger button renders on your product pages.
            </p>

            {/* Live Button Preview Mockup */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                padding: "20px",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "10px" }}>
                Live Button Preview
              </div>
              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "14px 20px",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#ffffff",
                  backgroundColor: primaryColor,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "default",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
                }}
              >
                {activeLang.strings["button_text"] || "🎨 Customize This Product"}
              </button>
            </div>

            {/* Accent Color Picker & Swatches */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>
                Primary Accent Color
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: "42px", height: "36px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              {/* Preset Swatches */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {presetColors.map((col) => (
                  <button
                    key={col.hex}
                    type="button"
                    onClick={() => setPrimaryColor(col.hex)}
                    title={col.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      border: primaryColor.toLowerCase() === col.hex.toLowerCase() ? "2px solid #0f172a" : "1px solid #cbd5e1",
                      background: "#fff",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: col.hex,
                      }}
                    />
                    <span>{col.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Production Print Specifications Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              padding: "22px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              🖨️ Production &amp; Print Output
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
              Configure global default print resolution for production files generated upon order checkout.
            </p>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px" }}>
                Default Print Resolution
              </label>
              <select
                value={defaultDpi}
                onChange={(e) => setDefaultDpi(parseInt(e.target.value) || 300)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  background: "#fff",
                }}
              >
                <option value={300}>300 DPI (Commercial Print Ready - Recommended)</option>
                <option value={150}>150 DPI (Standard Web Preview / Draft)</option>
              </select>
            </div>

            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "8px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
                color: "#64748b",
                lineHeight: 1.4,
              }}
            >
              💡 <strong>Production Note:</strong> When orders are placed, the personalizer renders high-resolution transparent PNG print files and saves them directly into your Shopify Files CDN. You can download and print them directly from the <strong>Customized Orders</strong> page.
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}
