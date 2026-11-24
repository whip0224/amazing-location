// 零外部依賴單檔 Vercel Serverless Function：直接以原生 fetch 呼叫 Gemini v1beta REST API
interface VercelRequest {
  method?: string;
  body?: {
    name?: string;
    address?: string;
    addressComponents?: { longText: string; types?: string[] }[];
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
            signal: AbortSignal.timeout(9000),
          }
        );

        const data = (await res.json().catch(() => ({}))) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          error?: { message?: string };
        };

        if (res.ok) {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          return { ok: true as const, text };
        }

        lastStatus = res.status;
        lastMessage = data?.error?.message || `HTTP ${res.status}`;

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          return { ok: false as const, status: lastStatus, message: lastMessage };
        }

        if (res.status === 404) {
          break; // 換下一個可用模型
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({ error: '尚未設定 GEMINI_API_KEY，請於 Vercel 環境變數中設定。' });
    return;
  }

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
    '2. 根據店名、地址與類型自動產生 2 到 4 個簡短實用的繁體中文旅遊標籤（tags，例如：燒肉、日本料理、深夜食堂、伴手禮、拉麵、咖啡廳、逛街、古蹟景點、居酒屋、甜點，不要加 # 符號）。';

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
