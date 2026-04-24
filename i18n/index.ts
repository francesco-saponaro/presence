import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";

const SUPPORTED = ["en", "es", "fr", "it", "pt"] as const;
type SupportedLang = typeof SUPPORTED[number];

/**
 * Derive the best supported language from the device locale list.
 * Tries exact match first ("pt-BR" → "pt"), then language-only prefix.
 * Falls back to "en" if nothing matches.
 */
function detectDeviceLanguage(): SupportedLang {
  const locales = Localization.getLocales();
  for (const locale of locales) {
    const tag = locale.languageTag ?? "";           // e.g. "pt-BR"
    const lang = locale.languageCode ?? tag.split("-")[0]; // e.g. "pt"
    if ((SUPPORTED as readonly string[]).includes(lang)) {
      return lang as SupportedLang;
    }
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    pt: { translation: pt },
  },
  lng: detectDeviceLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
