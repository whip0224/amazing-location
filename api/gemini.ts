// 零外部依賴單檔 Vercel Serverless Function：統一處理 /api/gemini（GET 連線狀態 / POST 分類與擷取）
interface AddressComponent {
  longText: string;
  types?: string[];
}

interface VercelRequest {
  method?: string;
  body?: {
    action?: 'classify' | 'extract';
    name?: string;
    address?: string;
    addressComponents?: AddressComponent[];
    text?: string;
    imageBase64?: string;
    mimeType?: string;
  };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader?: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

const TAIWAN_CITY_REGEX =
  /(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/;
const TAIWAN_VILLAGE_SUFFIX_REGEX = /[里村鄰]$/;

function isTaiwanPlace(address?: string, addressComponents?: AddressComponent[]): boolean {
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
  addressComponents?: AddressComponent[]
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

async function callGeminiV1Beta(apiKey: string, payload: Record<string, unknown>) {
  const models = Array.from(
    new Set(
      [
        process.env.GEMINI_MODEL?.trim(),
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-4-hydrogen',
        'gemini-3.8-flash',
      ].filter((m): m is string => Boolean(m))
    )
  );

  let lastStatus = 500;
  let lastMessage = 'Gemini API 呼叫失敗';

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(9500),
          }
        );

        const data = (await res.json().catch(() => ({}))) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          error?: { message?: string };
        };

        if (res.ok) {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          return { ok: true as const, text, model };
        }

        lastStatus = res.status;
        lastMessage = data?.error?.message || `HTTP ${res.status}`;

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          return { ok: false as const, status: lastStatus, message: lastMessage };
        }

        if (res.status === 404) {
          break;
        }

        if ((res.status === 429 || res.status === 503) && attempt === 0) {
          await sleep(600);
          continue;
        }
        break;
      } catch (err) {
        lastStatus = 504;
        lastMessage = err instanceof Error ? err.message : '網路連線逾時';
        if (attempt === 0) {
          await sleep(400);
          continue;
        }
      }
    }
  }

  return { ok: false as const, status: lastStatus, message: lastMessage };
}

async function handleStatus(res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(200).json({
      online: false,
      configured: false,
      reason: '尚未設定 GEMINI_API_KEY（請於 Vercel Environment Variables 設定後 Redeploy）',
    });
    return;
  }

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=5', {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    const data = (await upstream.json().catch(() => ({}))) as {
      error?: { message?: string };
    };

    if (upstream.ok) {
      res.status(200).json({
        online: true,
        configured: true,
        endpoint: 'v1beta',
      });
      return;
    }

    const upstreamMsg = data?.error?.message || `HTTP ${upstream.status}`;
    res.status(200).json({
      online: false,
      configured: true,
      status: upstream.status,
      reason:
        upstream.status === 400 || upstream.status === 401 || upstream.status === 403
          ? `API 金鑰驗證失敗 (${upstream.status})：請確認 Google Cloud 金鑰「應用程式限制」設為「無」且已啟用 Generative Language API`
          : upstreamMsg,
    });
  } catch (error) {
    res.status(200).json({
      online: false,
      configured: true,
      reason: error instanceof Error ? error.message : '無法連線至 Gemini v1beta 服務',
    });
  }
}

async function handleClassify(req: VercelRequest, res: VercelResponse, apiKey: string) {
  const input = req.body || {};
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

  const systemPrompt =
    '你是專精台灣、日本、韓國與全球旅遊的繁體中文（台灣／香港用語）旅遊資料整理專家。' +
    '任務：1. 將地址精準轉換為簡潔好辨識的城市名（city，例如：臺北市、新北市、臺中市、高雄市、大阪、東京、京都、福岡、首爾、釜山）與商圈或行政區名（area，例如：大同區、信義區、西門町、難波／心齋橋、梅田、道頓堀、澀谷、新宿、表參道、祇園／河原町、弘大、聖水洞；若為日本行政區請寫繁體中文區名或知名商圈，不要保留英文如 Chuo Ward）。' +
    '【台灣地址重要規則】：若為台灣地點，city 請填縣市（如臺北市、新北市、宜蘭縣）；area 必須優先填寫「鄉／鎮／市／區」行政區層級（如：大同區、中山區、大安區、板橋區、西屯區、羅東鎮）或該店著名的台灣商圈名（如：西門町、逢甲夜市、東區），絕對不可回傳「XX里」、「XX村」、「XX鄰」（例如地址為「103台灣臺北市大同區建明里太原路19號1樓」，area 必須是「大同區」，絕不可寫「建明里」）。' +
    '2. 根據店名、地址與類型自動產生 2 到 4 個簡短實用的繁體中文旅遊標籤（tags，不要加 # 符號）。【重要】：tags 陣列第 1 個標籤請優先從大分類「飲食」、「景點」、「購物」中挑選最貼切的一項（例如餐廳／咖啡廳／小吃選「飲食」，觀光名勝／公園／神社／博物館選「景點」，百貨／伴手禮／藥妝／市場選「購物」），後面再接 1 到 3 個具體細分類標籤（如：燒肉、日本料理、深夜食堂、伴手禮、拉麵、咖啡廳、古蹟、甜點）。';

  const result = await callGeminiV1Beta(apiKey, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          city: { type: 'STRING' },
          area: { type: 'STRING' },
          tags: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
        },
        required: ['city', 'area', 'tags'],
      },
    },
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      city?: string;
      area?: string;
      tags?: string[];
    };

    let finalCity = (parsed.city || '').trim();
    let finalArea = (parsed.area || '').trim();

    if (isTaiwan && taiwanAdmin) {
      if (!finalCity || finalCity.includes('台灣省') || finalCity.includes('臺灣省')) {
        finalCity = taiwanAdmin.city || finalCity;
      }
      if (!finalArea || finalArea === '未分類區域' || TAIWAN_VILLAGE_SUFFIX_REGEX.test(finalArea)) {
        finalArea = taiwanAdmin.district || finalArea;
      }
    }

    res.status(200).json({
      city: finalCity || '未分類城市',
      area: finalArea || '未分類區域',
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 5)
        : [],
    });
  } catch {
    res.status(502).json({ error: 'Gemini 回傳 JSON 解析失敗' });
  }
}

async function handleExtract(req: VercelRequest, res: VercelResponse, apiKey: string) {
  const input = req.body || {};
  const trimmedText = (input.text || '').trim();
  const hasImage = Boolean(input.imageBase64 && input.mimeType);

  if (!trimmedText && !hasImage) {
    res.status(400).json({ error: '請貼上旅遊文字或上傳截圖。' });
    return;
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

  const systemPrompt =
    '你是旅遊清單擷取助手。請從使用者貼上的遊記、IG／Threads 貼文、備忘錄文字或截圖中，精準抓出所有明確提到的餐廳、美食店家、商店、咖啡廳或旅遊景點（排除純行政地名如「日本」「大阪市」本身，除非它是具體景點如「大阪城」）。' +
    '針對每個地點輸出：' +
    '- name：店家或景點名稱。' +
    '- searchQuery：最適合拿去 Google Maps Places API 搜尋的精準關鍵字（若上下文有提到城市或商圈，請一併加上，例如「大阪 難波 燒肉力丸」或「台北 大同區 三多屋爸爸嘴」）。' +
    '- hintCity：推測城市（繁體中文，台灣地點填縣市名如臺北市、臺中市；若無法判斷則填空字串）。' +
    '- hintArea：推測商圈或行政區（繁體中文，台灣地點請填區／鄉／鎮／市如大同區、信義區或知名商圈，絕不可填里／村／鄰；若無法判斷則填空字串）。' +
    '- tags：2 到 4 個繁體中文標籤（不含 # 符號），第 1 個標籤請優先從大分類「飲食」、「景點」、「購物」中擇一，後面再接具體類型標籤。' +
    '- note：從內容中擷取的實用備註（例如必吃餐點、公休日、預約提醒、營業時間提示，若無則填空字串）。';

  const result = await callGeminiV1Beta(apiKey, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          places: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                searchQuery: { type: 'STRING' },
                hintCity: { type: 'STRING' },
                hintArea: { type: 'STRING' },
                tags: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                },
                note: { type: 'STRING' },
              },
              required: ['name', 'searchQuery', 'hintCity', 'hintArea', 'tags', 'note'],
            },
          },
        },
        required: ['places'],
      },
    },
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      places?: Array<{
        name?: string;
        searchQuery?: string;
        hintCity?: string;
        hintArea?: string;
        tags?: string[];
        note?: string;
      }>;
    };

    const places = Array.isArray(parsed.places)
      ? parsed.places
          .filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
          .map(p => {
            const rawHintArea = (p.hintArea || '').trim();
            return {
              name: p.name!.trim(),
              searchQuery: (p.searchQuery || p.name!).trim(),
              hintCity: (p.hintCity || '').trim(),
              hintArea: TAIWAN_VILLAGE_SUFFIX_REGEX.test(rawHintArea) ? '' : rawHintArea,
              tags: Array.isArray(p.tags)
                ? p.tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 4)
                : [],
              note: (p.note || '').trim(),
            };
          })
      : [];

    res.status(200).json({ places });
  } catch {
    res.status(502).json({ error: 'Gemini 回傳 JSON 解析失敗' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'GET') {
    await handleStatus(res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({ error: '尚未設定 GEMINI_API_KEY，請於 Vercel 環境變數中設定。' });
    return;
  }

  const action = req.body?.action;
  if (action === 'extract') {
    await handleExtract(req, res, apiKey);
    return;
  }

  await handleClassify(req, res, apiKey);
}
