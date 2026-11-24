import { checkGeminiConnectionStatus } from '../../server/geminiService.ts';

interface VercelRequest {
  method?: string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const status = await checkGeminiConnectionStatus();
  res.status(200).json(status);
}
