// src/utils/cityTranslations.ts

export interface CityTranslation {
  [lang: string]: string;
}

// 👉 確保有 export 這個型別，Hook 才抓得到
export type TranslationsMap = Record<string, CityTranslation>;

// 替換為你在 Google Apps Script 取得的 Web App 網址
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycby9fyB9wNBiXM_bndnmtDezRstQ8UqKKQM9pStxaxw8wcvtoJRZMBUbCEj5blZBcaVW/exec";
const STORAGE_KEY = "pwa_city_translations_cache";

// 備底資料：保留少數重要城市，確保首次安裝且完全斷網時不會崩潰
const FALLBACK_TRANSLATIONS: TranslationsMap = {
  tokyo: { "zh-TW": "東京", en: "Tokyo", ja: "東京" },
  taipei: { "zh-TW": "台北", en: "Taipei" },
  hong_kong: { "zh-TW": "香港", en: "Hong Kong" }
};

/**
 * 核心函式：取得城市翻譯
 * 👉 確保有 export 這個函式，Hook 才抓得到
 */
export async function getCityTranslations(): Promise<TranslationsMap> {
  const cached = localStorage.getItem(STORAGE_KEY);
  const currentData: TranslationsMap = cached ? JSON.parse(cached) : FALLBACK_TRANSLATIONS;

  // 背景自動嘗試更新（不阻礙當前畫面渲染）
  fetchFreshTranslations().catch((err) => {
    console.warn("無法取得最新 Google Sheet 翻譯，繼續使用現有快取:", err);
  });

  return currentData;
}

/**
 * 實際向 Google Apps Script 請求最新資料並更新快取
 */
async function fetchFreshTranslations(): Promise<TranslationsMap> {
  // redirect: "follow" 非常關鍵，因為 GAS 會進行 302 重新導向
  const res = await fetch(`${GAS_BASE_URL}?sheet=Cities`, { redirect: "follow" });
  
  if (!res.ok) {
    throw new Error(`GAS 請求失敗: ${res.status}`);
  }

  const freshData: TranslationsMap = await res.json();

  if (freshData && Object.keys(freshData).length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData));
  }

  return freshData;
}