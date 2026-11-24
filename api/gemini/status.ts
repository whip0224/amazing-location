// 零外部依賴單檔 Vercel Serverless Function：直接以原生 fetch 呼叫 Gemini v1beta REST API
interface VercelRequest {
  method?: string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader?: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'GET') {
    res.status(405).json({ online: false, error: 'Method Not Allowed' });
    return;
  }

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
      models?: Array<{ name?: string }>;
      error?: { message?: string; status?: string };
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
