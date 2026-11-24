// 零外部依賴單檔 Vercel Serverless Function：直接以原生 fetch 呼叫 Gemini v1beta REST API
interface VercelRequest {
  method?: string;
  body?: {
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

const TAIWAN_VILLAGE_SUFFIX_REGEX = /[里村鄰]$/;

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
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"places":[]}';
          return { ok: true as const, text };
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
    '- tags：1 到 3 個繁體中文標籤（不含 # 符號）。' +
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
