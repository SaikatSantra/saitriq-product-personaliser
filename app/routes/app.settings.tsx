import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
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
      modal_subtitle: "Personalizza il testo, carica foto e visualizza l'anteprima dal vivo",
      front_side: "Fronte",
      back_side: "Retro",
      custom_text_title: "Aggiungi testo personalizzato",
      your_message: "Il tuo messaggio / testo",
      text_placeholder: "Riga 1\nRiga 2...",
      font_family: "Carattere",
      print_ink_color: "Colore di stampa",
      upload_title: "Carica foto o logo",
      upload_hint: "Alta risoluzione PNG, JPG o WEBP",
      change_photo: "Modifica",
      remove_photo: "Rimuovi",
      cancel: "Annulla",
      add_to_cart: "Aggiungi al carrello con il design",
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
    storageProvider: "local",
    enableAiBackgroundRemoval: true,
    s3Bucket: "",
    s3Region: "us-east-1",
    printfulApiKey: "",
    printifyApiKey: "",
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

  return { shop, settings };
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

  const settings = {
    defaultDpi: parseInt(formData.get("defaultDpi") as string) || 300,
    storageProvider: (formData.get("storageProvider") as string) || "local",
    enableAiBackgroundRemoval: formData.get("enableAiBackgroundRemoval") === "true",
    s3Bucket: (formData.get("s3Bucket") as string) || "",
    s3Region: (formData.get("s3Region") as string) || "us-east-1",
    printfulApiKey: (formData.get("printfulApiKey") as string) || "",
    printifyApiKey: (formData.get("printifyApiKey") as string) || "",
    languages,
  };

  await prisma.shop.update({
    where: { shopifyDomain: session.shop },
    data: {
      settings: JSON.stringify(settings),
      updatedAt: new Date(),
    },
  });

  return { success: true, message: "Languages and settings saved successfully" };
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [defaultDpi, setDefaultDpi] = useState(settings.defaultDpi);
  const [storageProvider, setStorageProvider] = useState(settings.storageProvider);
  const [enableAi, setEnableAi] = useState(settings.enableAiBackgroundRemoval);
  const [s3Bucket, setS3Bucket] = useState(settings.s3Bucket);
  const [s3Region, setS3Region] = useState(settings.s3Region);
  const [printfulKey, setPrintfulKey] = useState(settings.printfulApiKey);
  const [printifyKey, setPrintifyKey] = useState(settings.printifyApiKey);

  // Multilingual state
  const [languages, setLanguages] = useState<Record<string, LanguageDefinition>>(
    settings.languages || DEFAULT_LANGUAGES,
  );
  const [activeLangCode, setActiveLangCode] = useState<string>("en");
  const [newLangPreset, setNewLangPreset] = useState<string>("es");

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
      alert("Cannot remove default language.");
      return;
    }
    setLanguages((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    setActiveLangCode("en");
  };

  const handleSetDefaultLanguage = (code: string) => {
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
    fetcher.submit(
      {
        defaultDpi: defaultDpi.toString(),
        storageProvider,
        enableAiBackgroundRemoval: enableAi.toString(),
        s3Bucket,
        s3Region,
        printfulApiKey: printfulKey,
        printifyApiKey: printifyKey,
        languages: JSON.stringify(languages),
      },
      { method: "POST" },
    );
  };

  const isSaving = fetcher.state === "submitting";

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #c9cccf",
    borderRadius: "6px",
    marginTop: "4px",
    fontSize: "13px",
  };

  const labelStyle = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#202223",
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  };

  const hintStyle = {
    fontSize: "12px",
    color: "#6d7175",
    fontWeight: 400,
  };

  const languageFlags: Record<string, string> = {
    en: "🇬🇧",
    es: "🇪🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    it: "🇮🇹",
  };

  return (
    <s-page heading="App Settings & Multi-Language Translations">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Save Settings"}
      </s-button>

      {fetcher.data?.message && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner tone="success">
            {fetcher.data.message}
          </s-banner>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "840px" }}>
        
        {/* In-App Multi-Language & Storefront Translations */}
        <s-section heading="In-App Multi-Language & Translations">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#202223" }}>
                  Storefront Languages & Translations
                </h4>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6d7175" }}>
                  Manage and customize all text in every language directly here. The storefront automatically detects customer language (or language switcher) and displays the matching translation!
                </p>
              </div>

              {/* Add Language Dropdown */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                  value={newLangPreset}
                  onChange={(e) => setNewLangPreset(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "13px" }}
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
                  + Add Language
                </button>
              </div>
            </div>

            {/* Language Tabs */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e1e3e5", paddingBottom: "12px", flexWrap: "wrap" }}>
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
                      background: isActive ? "#008060" : "#f1f2f3",
                      color: isActive ? "#fff" : "#202223",
                      border: "none",
                      borderRadius: "6px",
                      padding: "8px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{flag}</span>
                    <span>{lang.name}</span>
                    {lang.isDefault && (
                      <span style={{ fontSize: "10px", background: isActive ? "rgba(255,255,255,0.25)" : "#e1e3e5", padding: "1px 5px", borderRadius: "4px" }}>
                        Default
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Language Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", padding: "10px 14px", borderRadius: "6px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#202223" }}>
                Editing Translations: <span style={{ color: "#008060" }}>{activeLang.name} ({activeLangCode.toUpperCase()})</span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                {!activeLang.isDefault && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSetDefaultLanguage(activeLangCode)}
                      style={{ background: "none", border: "1px solid #c9cccf", borderRadius: "4px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
                    >
                      Set as Default
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveLanguage(activeLangCode)}
                      style={{ background: "none", border: "1px solid #d82c0d", color: "#d82c0d", borderRadius: "4px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
                    >
                      Delete Language
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Translation Input Fields */}
            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                1. Button & Studio Titles
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Customize Button Text:
                  <input
                    type="text"
                    value={activeLang.strings?.button_text || ""}
                    onChange={(e) => updateActiveString("button_text", e.target.value)}
                    style={inputStyle}
                  />
                  <span style={hintStyle}>Shown on the product page next to Add to Cart</span>
                </label>
                <label style={labelStyle}>
                  Studio Modal Header:
                  <input
                    type="text"
                    value={activeLang.strings?.modal_title || ""}
                    onChange={(e) => updateActiveString("modal_title", e.target.value)}
                    style={inputStyle}
                  />
                  <span style={hintStyle}>Main title at top of the personalization modal</span>
                </label>
              </div>

              <div style={{ marginTop: "10px" }}>
                <label style={labelStyle}>
                  Modal Subtitle:
                  <input
                    type="text"
                    value={activeLang.strings?.modal_subtitle || ""}
                    onChange={(e) => updateActiveString("modal_subtitle", e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                2. Multi-Side Switcher Tabs
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Front Side Tab Label:
                  <input
                    type="text"
                    value={activeLang.strings?.front_side || ""}
                    onChange={(e) => updateActiveString("front_side", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Back Side Tab Label:
                  <input
                    type="text"
                    value={activeLang.strings?.back_side || ""}
                    onChange={(e) => updateActiveString("back_side", e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                3. Custom Text Controls
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Text Card Title:
                  <input
                    type="text"
                    value={activeLang.strings?.custom_text_title || ""}
                    onChange={(e) => updateActiveString("custom_text_title", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Message Field Label:
                  <input
                    type="text"
                    value={activeLang.strings?.your_message || ""}
                    onChange={(e) => updateActiveString("your_message", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Font Family Label:
                  <input
                    type="text"
                    value={activeLang.strings?.font_family || ""}
                    onChange={(e) => updateActiveString("font_family", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Print Ink Color Label:
                  <input
                    type="text"
                    value={activeLang.strings?.print_ink_color || ""}
                    onChange={(e) => updateActiveString("print_ink_color", e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                4. Photo & Logo Upload Controls
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Upload Card Title:
                  <input
                    type="text"
                    value={activeLang.strings?.upload_title || ""}
                    onChange={(e) => updateActiveString("upload_title", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Upload Hint / File Types:
                  <input
                    type="text"
                    value={activeLang.strings?.upload_hint || ""}
                    onChange={(e) => updateActiveString("upload_hint", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Change Photo Button:
                  <input
                    type="text"
                    value={activeLang.strings?.change_photo || ""}
                    onChange={(e) => updateActiveString("change_photo", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Remove Photo Button:
                  <input
                    type="text"
                    value={activeLang.strings?.remove_photo || ""}
                    onChange={(e) => updateActiveString("remove_photo", e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: "14px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px", color: "#1a1a1a" }}>
                5. Actions & Buttons
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={labelStyle}>
                  Cancel Button:
                  <input
                    type="text"
                    value={activeLang.strings?.cancel || ""}
                    onChange={(e) => updateActiveString("cancel", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Add to Cart Button:
                  <input
                    type="text"
                    value={activeLang.strings?.add_to_cart || ""}
                    onChange={(e) => updateActiveString("add_to_cart", e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Adding to Cart (Loading State):
                  <input
                    type="text"
                    value={activeLang.strings?.adding_to_cart || ""}
                    onChange={(e) => updateActiveString("adding_to_cart", e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          </div>
        </s-section>

        {/* Print Standards */}
        <s-section heading="Print Specifications">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Default Print Resolution (DPI):
              <input
                type="number"
                value={defaultDpi}
                onChange={(e) => setDefaultDpi(parseInt(e.target.value) || 300)}
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              />
              <span style={{ fontSize: "12px", color: "#6d7175" }}>
                300 DPI is the industry gold standard for physical commercial printing.
              </span>
            </label>
          </div>
        </s-section>

        {/* AI Processing */}
        <s-section heading="AI Image Processing">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={enableAi}
                onChange={(e) => setEnableAi(e.target.checked)}
              />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>Enable AI Background Removal on Customer Uploads</div>
                <div style={{ fontSize: "12px", color: "#6d7175" }}>
                  Automatically isolates subject portraits from customer-uploaded photos using Rembg / PhotoRoom pipeline.
                </div>
              </div>
            </label>
          </div>
        </s-section>

        {/* Storage Provider */}
        <s-section heading="Asset & Print Storage Provider">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Storage Destination:
              <select
                value={storageProvider}
                onChange={(e) => setStorageProvider(e.target.value)}
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              >
                <option value="local">Local Development Storage (App Filesystem)</option>
                <option value="s3">Amazon AWS S3 Bucket</option>
                <option value="r2">Cloudflare R2 (Zero Egress Fees)</option>
              </select>
            </label>

            {storageProvider !== "local" && (
              <>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>
                  Bucket Name:
                  <input
                    type="text"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="e.g. my-store-customizer-prints"
                    style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>
                  Region:
                  <input
                    type="text"
                    value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)}
                    placeholder="us-east-1"
                    style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
                  />
                </label>
              </>
            )}
          </div>
        </s-section>

        {/* POD Automation */}
        <s-section heading="Print on Demand (POD) Integrations">
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Printful API Key (Optional):
              <input
                type="password"
                value={printfulKey}
                onChange={(e) => setPrintfulKey(e.target.value)}
                placeholder="Bearer token..."
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: 500 }}>
              Printify API Token (Optional):
              <input
                type="password"
                value={printifyKey}
                onChange={(e) => setPrintifyKey(e.target.value)}
                placeholder="API token..."
                style={{ width: "100%", padding: "8px", border: "1px solid #c9cccf", borderRadius: "4px", marginTop: "4px" }}
              />
            </label>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}
