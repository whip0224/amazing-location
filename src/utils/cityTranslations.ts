// src/utils/cityTranslations.ts

export interface CityTranslation {
  [lang: string]: string;
}

export type TranslationsMap = Record<string, CityTranslation>;

// Anata no GAS Web App URL ni okikaete kudasai
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbzlwzSkBqWzZueIh3CwdEtYXwjmrXZUXD3uA5AMnA4-lAMVHYIZ-cWJf2-pXBUsv7BX/exec";
const STORAGE_KEY = "pwa_city_translations_cache";

const FALLBACK_TRANSLATIONS: TranslationsMap = {
  tokyo: { "zh-TW": "東京", en: "Tokyo", ja: "東京" },
  taipei: { "zh-TW": "台北", en: "Taipei" },
  hong_kong: { "zh-TW": "香港", en: "Hong Kong" }
};

export async function getCityTranslations(): Promise<TranslationsMap> {
  const cached = localStorage.getItem(STORAGE_KEY);
  const currentData: TranslationsMap = cached ? JSON.parse(cached) : FALLBACK_TRANSLATIONS;

  fetchFreshTranslations().catch((err) => {
    console.warn("GAS API yomikomi error:", err);
  });

  return currentData;
}

async function fetchFreshTranslations(): Promise<TranslationsMap> {
  // Promise.all wo tsukatte, Cities to Stations wo douji ni shutoku shimasu
  const [citiesRes, stationsRes] = await Promise.all([
    fetch(`${GAS_BASE_URL}?sheet=Cities`, { redirect: "follow" }),
    fetch(`${GAS_BASE_URL}?sheet=Stations`, { redirect: "follow" })
  ]);
  
  if (!citiesRes.ok || !stationsRes.ok) {
    throw new Error(`GAS API error`);
  }

  const citiesData: TranslationsMap = await citiesRes.json();
  const stationsData: TranslationsMap = await stationsRes.json();

  // 2-tsu no data wo hitotsu no object ni gattai (merge) shimasu
  const mergedData: TranslationsMap = { ...citiesData, ...stationsData };

  if (mergedData && Object.keys(mergedData).length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedData));
  }

  return mergedData;
}