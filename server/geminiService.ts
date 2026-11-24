import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

export interface ClassifyPlaceInput {
  name?: string;
  address?: string;
  addressComponents?: { longText: string; types?: string[] }[];
}

export interface ClassifyPlaceResult {
  city: string;
  area: string;
  tags: string[];
}

export interface ExtractPlacesInput {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface ExtractedPlaceCandidate {
  name: string;
  searchQuery: string;
  hintCity: string;
  hintArea: string;
  tags: string[];
  note: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error('尚未設定 GEMINI_API_KEY，請於環境變數或 Settings > Secrets 中設定。') as Error & {
      status?: number;
    };
    err.status = 500;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function extractApiErrorDetails(error: unknown): { status: number; message: string } {
  const errObj = error as { status?: number; statusCode?: number; message?: string };
  const rawMessage = errObj?.message || 'Gemini API 呼叫失敗';
  let status = errObj?.status || errObj?.statusCode || 500;

  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('400')) {
    status = status === 500 ? 400 : status;
  } else if (rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('403')) {
    status = 403;
  } else if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429')) {
    status = 429;
  } else if (rawMessage.includes('NOT_FOUND') || rawMessage.includes('404')) {
    status = 404;
  }

  return { status, message: rawMessage };
}

export interface GeminiConnectionStatus {
  online: boolean;
  reason?: string;
}

export async function checkGeminiConnectionStatus(): Promise<GeminiConnectionStatus> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      online: false,
      reason: '尚未設定 GEMINI_API_KEY',
    };
  }

  try {
    const ai = getGeminiClient();
    await ai.models.get({
      model: 'gemini-4-hydrogen',
      config: {
        httpOptions: {
          timeout: 8000,
        },
      },
    });
    return { online: true };
  } catch (error) {
    const { message } = extractApiErrorDetails(error);
    return {
      online: false,
      reason: message || '無法連線至 Gemini 服務',
    };
  }
}

const TAIWAN_CITY_REGEX =
  /(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/;

const TAIWAN_VILLAGE_SUFFIX_REGEX = /[里村鄰]$/;

function isTaiwanPlace(
  address?: string,
  addressComponents?: { longText: string; types?: string[] }[]
): boolean {
  const safeComponents = Array.isArray(addressComponents) ? addressComponents : [];
  const country = safeComponents.find(c => c.types?.includes('country'))?.longText || '';
  if (country.includes('台灣') || country.includes('臺灣') || country.toLowerCase() === 'taiwan') {
    return true;
  }
  const addr = address || '';
  return addr.includes('台灣') || addr.includes('臺灣') || /\bTaiwan\b/i.test(addr) || TAIWAN_CITY_REGEX.test(addr);
}

function extractTaiwanAdminFromInput(
  address?: string,
  addressComponents?: { longText: string; types?: string[] }[]
): { city: string; district: string } {
  const safeComponents = Array.isArray(addressComponents) ? addressComponents : [];
  let city: string;
  let district = '';

  const level1 = safeComponents.find(c => c.types?.includes('administrative_area_level_1'))?.longText?.trim() || '';
  const level2 = safeComponents.find(c => c.types?.includes('administrative_area_level_2'))?.longText?.trim() || '';

  if (level1 && !level1.includes('台灣省') && !level1.includes('臺灣省') && !level1.includes('福建省')) {
    city = level1;
  } else if (level2) {
    city = level2;
  } else {
    city = safeComponents.find(c => c.types?.includes('locality'))?.longText?.trim() || '';
  }

  const candidateTypes = [
    'administrative_area_level_2',
    'administrative_area_level_3',
    'sublocality_level_1',
    'locality',
  ];

  for (const type of candidateTypes) {
    const match = safeComponents.find(c => c.types?.includes(type))?.longText?.trim();
    if (
      match &&
      match !== city &&
      !TAIWAN_VILLAGE_SUFFIX_REGEX.test(match) &&
      !match.includes('省') &&
      /[區鎮鄉市]$/.test(match)
    ) {
      district = match;
      break;
    }
  }

  const addr = (address || '').trim();
  if (addr) {
    const cityMatch = addr.match(TAIWAN_CITY_REGEX);
    if (!city && cityMatch) {
      city = cityMatch[1];
    }
    if (!district) {
      const distMatch = addr.match(
        /(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)\s*([^\d\s號樓路街巷弄里村鄰]{1,5}?[區鎮鄉市])/
      );
      if (distMatch && distMatch[1]) {
        district = distMatch[1].trim();
      }
    }
  }

  return { city, district };
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  buildParams: (model: string) => Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent(buildParams(model));
      } catch (error) {
        lastError = error;
        const { status } = extractApiErrorDetails(error);
        if (status === 400 || status === 401 || status === 403) {
          throw error;
        }
        if (status === 404) {
          break;
        }
        if ((status === 429 || status === 503) && attempt === 0) {
          await sleep(600);
          continue;
        }
        break;
      }
    }
  }

  throw lastError;
}

export async function classifyPlaceWithGemini(input: ClassifyPlaceInput): Promise<ClassifyPlaceResult> {
  const ai = getGeminiClient();
  const isTaiwan = isTaiwanPlace(input.address, input.addressComponents);
  const taiwanAdmin = isTaiwan ? extractTaiwanAdminFromInput(input.address, input.addressComponents) : null;

  const componentsSummary = (input.addressComponents || [])
    .map(c => `${c.longText} (${(c.types || []).join(',')})`)
    .join(' | ');

  const prompt = [
    '請根據以下旅遊地點資訊，轉換為台灣／香港旅人最習慣的繁體中文分類與標籤：',
    `店名／景點名稱：${input.name || '未知'}`,
    `完整地址：${input.address || '未知'}`,
    componentsSummary ? `地址組成結構：${componentsSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await generateWithRetryAndFallback(ai, model => ({
    model,
    contents: prompt,
    config: {
      ...(model.includes('lite') ? {} : { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
      systemInstruction:
        '你是專精台灣、日本、韓國與全球旅遊的繁體中文（台灣／香港用語）旅遊資料整理專家。' +
        '任務：1. 將地址精準轉換為簡潔好辨識的城市名（city，例如：臺北市、新北市、臺中市、高雄市、大阪、東京、京都、福岡、首爾、釜山）與商圈或行政區名（area，例如：大同區、信義區、西門町、難波／心齋橋、梅田、道頓堀、澀谷、新宿、表參道、祇園／河原町、弘大、聖水洞；若為日本行政區請寫繁體中文區名或知名商圈，不要保留英文如 Chuo Ward）。' +
        '【台灣地址重要規則】：若為台灣地點，city 請填縣市（如臺北市、新北市、宜蘭縣）；area 必須優先填寫「鄉／鎮／市／區」行政區層級（如：大同區、中山區、大安區、板橋區、西屯區、羅東鎮）或該店著名的台灣商圈名（如：西門町、逢甲夜市、東區），**絕對不可回傳「XX里」、「XX村」、「XX鄰」**（例如地址為「103台灣臺北市大同區建明里太原路19號1樓」，area 必須是「大同區」，絕不可寫「建明里」）。' +
        '2. 根據店名、地址與類型自動產生 2 到 4 個簡短實用的繁體中文旅遊標籤（tags，例如：燒肉、日本料理、深夜食堂、伴手禮、拉麵、咖啡廳、逛街、古蹟景點、居酒屋、甜點，不要加 # 符號）。',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          city: {
            type: Type.STRING,
            description: '台灣或香港旅人習慣的繁體中文城市名稱，例如：臺北市、大阪、東京、首爾。',
          },
          area: {
            type: Type.STRING,
            description:
              '台灣或香港旅人習慣的繁體中文行政區（區/鄉/鎮/市）或商圈名稱，例如：大同區、西門町、難波／心齋橋、梅田、澀谷、弘大。台灣地點絕不可填里、村、鄰。',
          },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 到 4 個繁體中文旅遊標籤（不含 # 符號）。',
          },
        },
        required: ['city', 'area', 'tags'],
      },
    },
  }));

  const jsonStr = stripJsonFence(response.text ?? '{}') || '{}';
  const parsed = JSON.parse(jsonStr) as Partial<ClassifyPlaceResult>;

  let finalCity = (parsed.city || '').trim();
  let finalArea = (parsed.area || '').trim();

  if (isTaiwan && taiwanAdmin) {
    if (!finalCity || finalCity.includes('台灣省') || finalCity.includes('臺灣省')) {
      finalCity = taiwanAdmin.city || finalCity;
    }
    if (
      !finalArea ||
      finalArea === '未分類區域' ||
      TAIWAN_VILLAGE_SUFFIX_REGEX.test(finalArea)
    ) {
      finalArea = taiwanAdmin.district || finalArea;
    }
  }

  return {
    city: finalCity || '未分類城市',
    area: finalArea || '未分類區域',
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}

export async function extractPlacesWithGemini(input: ExtractPlacesInput): Promise<ExtractedPlaceCandidate[]> {
  const ai = getGeminiClient();

  const trimmedText = (input.text || '').trim();
  const hasImage = Boolean(input.imageBase64 && input.mimeType);

  if (!trimmedText && !hasImage) {
    const err = new Error('請貼上旅遊文字或上傳截圖。') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (hasImage && input.imageBase64 && input.mimeType) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType,
        data: input.imageBase64,
      },
    });
  }

  parts.push({
    text: trimmedText
      ? `請從以下內容（與附圖，若有）中擷取所有提到的餐廳、咖啡廳、商店或景點：\n\n${trimmedText}`
      : '請辨識並擷取這張圖片／截圖中提到的所有餐廳、咖啡廳、商店或旅遊景點。',
  });

  const response = await generateWithRetryAndFallback(ai, model => ({
    model,
    contents: { parts },
    config: {
      ...(model.includes('lite') ? {} : { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
      systemInstruction:
        '你是旅遊清單擷取助手。請從使用者貼上的遊記、IG／Threads 貼文、備忘錄文字或截圖中，精準抓出所有明確提到的餐廳、美食店家、商店、咖啡廳或旅遊景點（排除純行政地名如「日本」「大阪市」本身，除非它是具體景點如「大阪城」）。' +
        '針對每個地點輸出：' +
        '- name：店家或景點名稱。' +
        '- searchQuery：最適合拿去 Google Maps Places API 搜尋的精準關鍵字（若上下文有提到城市或商圈，請一併加上，例如「大阪 難波 燒肉力丸」或「台北 大同區 三多屋爸爸嘴」）。' +
        '- hintCity：推測城市（繁體中文，台灣地點填縣市名如臺北市、臺中市；若無法判斷則填空字串）。' +
        '- hintArea：推測商圈或行政區（繁體中文，台灣地點請填區／鄉／鎮／市如大同區、信義區或知名商圈，絕不可填里／村／鄰；若無法判斷則填空字串）。' +
        '- tags：1 到 3 個繁體中文標籤（不含 # 符號）。' +
        '- note：從內容中擷取的實用備註（例如必吃餐點、公休日、預約提醒、營業時間提示，若無則填空字串）。',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          places: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: '店家或景點名稱' },
                searchQuery: { type: Type.STRING, description: '用於 Google Places 搜尋的關鍵字（含城市／區域更佳）' },
                hintCity: { type: Type.STRING, description: '繁體中文城市名' },
                hintArea: { type: Type.STRING, description: '繁體中文商圈或行政區名（台灣不可填里／村／鄰）' },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '1 到 3 個繁體中文標籤（不含 #）',
                },
                note: { type: Type.STRING, description: '內容中提到的必吃、公休或攻略備註' },
              },
              required: ['name', 'searchQuery', 'hintCity', 'hintArea', 'tags', 'note'],
            },
          },
        },
        required: ['places'],
      },
    },
  }));

  const jsonStr = stripJsonFence(response.text ?? '{"places":[]}') || '{"places":[]}';
  const parsed = JSON.parse(jsonStr) as { places?: ExtractedPlaceCandidate[] };

  if (!Array.isArray(parsed.places)) return [];

  return parsed.places
    .filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
    .map(p => {
      const rawHintArea = (p.hintArea || '').trim();
      return {
        name: p.name.trim(),
        searchQuery: (p.searchQuery || p.name).trim(),
        hintCity: (p.hintCity || '').trim(),
        hintArea: TAIWAN_VILLAGE_SUFFIX_REGEX.test(rawHintArea) ? '' : rawHintArea,
        tags: Array.isArray(p.tags)
          ? p.tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 4)
          : [],
        note: (p.note || '').trim(),
      };
    });
}
