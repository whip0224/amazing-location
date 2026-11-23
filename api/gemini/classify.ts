import { classifyPlaceWithGemini, extractApiErrorDetails } from '../../server/geminiService.ts';

interface VercelRequest {
  method?: string;
  body?: Record<string, unknown>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const result = await classifyPlaceWithGemini(req.body || {});
    res.status(200).json(result);
  } catch (error) {
    const { status, message } = extractApiErrorDetails(error);
    console.error('[Vercel Gemini Classify Error]', error);
    res.status(status).json({ error: message });
  }
}
