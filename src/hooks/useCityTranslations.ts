// src/hooks/useCityTranslations.ts
import { useState, useEffect, useCallback } from 'react';
import { getCityTranslations, type TranslationsMap } from '../utils/cityTranslations';

interface UseCityTranslationsResult {
  translations: TranslationsMap;
  isLoading: boolean;
  /**
   * 翻譯輔助函式
   * @param key 城市識別碼 (例如: 'tokyo')
   * @param lang 語言代碼 (例如: 'zh-TW', 'en')
   * @param fallback 當找不到翻譯時回傳的預設文字 (未提供時預設回傳 key 本身)
   */
  t: (key: string, lang: string, fallback?: string) => string;
}

export function useCityTranslations(): UseCityTranslationsResult {
  const [translations, setTranslations] = useState<TranslationsMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    // 取得快取或遠端翻譯資料
    getCityTranslations()
      .then((data) => {
        if (isMounted) {
          setTranslations(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('取得城市翻譯失敗:', err);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 提供快捷查詢函式，自帶 fallback 避免 undefined
  const t = useCallback(
    (key: string, lang: string, fallback?: string): string => {
      return translations[key]?.[lang] ?? fallback ?? key;
    },
    [translations]
  );

  return { translations, isLoading, t };
}