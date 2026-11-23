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

export async function classifyPlaceWithGemini(input: ClassifyPlaceInput): Promise<ClassifyPlaceResult> {
  const ai = getGeminiClient();

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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        '你是專精日本、韓國、台灣與全球旅遊的繁體中文（台灣／香港用語）旅遊資料整理專家。' +
        '任務：1. 將複雜的日文、韓文或英文地址精準轉換為簡潔好辨識的城市名（city，例如：大阪、東京、京都、福岡、首爾、釜山、台北、台中）與商圈或行政區名（area，例如：難波／心齋橋、梅田、道頓堀、澀谷、新宿、表參道、祇園／河原町、弘大、聖水洞、西門町；若為日本行政區也可直覺寫出繁體中文區名或知名商圈，不要保留英文如 Chuo Ward）。' +
        '2. 根據店名、地址與類型自動產生 2 到 4 個簡短實用的繁體中文旅遊標籤（tags，例如：燒肉、深夜食堂、伴手禮、拉麵、咖啡廳、逛街、古蹟景點、居酒屋、甜點，不要加 # 符號）。',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          city: {
            type: Type.STRING,
            description: '台灣或香港旅人習慣的繁體中文城市名稱，例如：大阪、東京、台北、首爾。',
          },
          area: {
            type: Type.STRING,
            description: '台灣或香港旅人習慣的繁體中文商圈或行政區名稱，例如：難波／心齋橋、梅田、澀谷、弘大、西門町。',
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
  });

  const jsonStr = (response.text ?? '{}').trim();
  const parsed = JSON.parse(jsonStr) as Partial<ClassifyPlaceResult>;

  return {
    city: (parsed.city || '').trim() || '未分類城市',
    area: (parsed.area || '').trim() || '未分類區域',
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        '你是旅遊清單擷取助手。請從使用者貼上的遊記、IG／Threads 貼文、備忘錄文字或截圖中，精準抓出所有明確提到的餐廳、美食店家、商店、咖啡廳或旅遊景點（排除純行政地名如「日本」「大阪市」本身，除非它是具體景點如「大阪城」）。' +
        '針對每個地點輸出：' +
        '- name：店家或景點名稱。' +
        '- searchQuery：最適合拿去 Google Maps Places API 搜尋的精準關鍵字（若上下文有提到城市或商圈，請一併加上，例如「大阪 難波 燒肉力丸」或「京都 宇治 中村藤吉」）。' +
        '- hintCity：推測城市（繁體中文，若無法判斷則填空字串）。' +
        '- hintArea：推測商圈或區域（繁體中文，若無法判斷則填空字串）。' +
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
                hintArea: { type: Type.STRING, description: '繁體中文商圈或區域名' },
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
  });

  const jsonStr = (response.text ?? '{"places":[]}').trim();
  const parsed = JSON.parse(jsonStr) as { places?: ExtractedPlaceCandidate[] };

  if (!Array.isArray(parsed.places)) return [];

  return parsed.places
    .filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
    .map(p => ({
      name: p.name.trim(),
      searchQuery: (p.searchQuery || p.name).trim(),
      hintCity: (p.hintCity || '').trim(),
      hintArea: (p.hintArea || '').trim(),
      tags: Array.isArray(p.tags)
        ? p.tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 4)
        : [],
      note: (p.note || '').trim(),
    }));
}
