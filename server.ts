import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPlaceWithGemini,
  extractPlacesWithGemini,
  extractApiErrorDetails,
} from './server/geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Gemini API: 自動繁體中文城市 + 商圈分類與標籤建議
  app.post('/api/gemini/classify', async (req, res) => {
    try {
      const result = await classifyPlaceWithGemini(req.body || {});
      res.json(result);
    } catch (error) {
      const { status, message } = extractApiErrorDetails(error);
      console.error('[Gemini Classify Error]', error);
      res.status(status).json({ error: message });
    }
  });

  // Gemini API: 從文字或截圖智能擷取景點清單
  app.post('/api/gemini/extract', async (req, res) => {
    try {
      const places = await extractPlacesWithGemini(req.body || {});
      res.json({ places });
    } catch (error) {
      const { status, message } = extractApiErrorDetails(error);
      console.error('[Gemini Extract Error]', error);
      res.status(status).json({ error: message });
    }
  });

  // Google Places API (New) Text Search 開發預覽代理
  app.post('/api/places/searchText', async (req, res) => {
    try {
      const apiKey =
        (req.headers['x-goog-api-key'] as string) || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
      const fieldMask =
        (req.headers['x-goog-fieldmask'] as string) ||
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours,places.location';

      const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
          Referer: 'http://localhost:5173/',
        },
        body: JSON.stringify(req.body),
      });

      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (error) {
      console.error('[Places Proxy Error]', error);
      res.status(500).json({ error: { message: 'Places API 代理請求失敗' } });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Amazing Location server running at http://localhost:${port}`);
  });
}

startServer();
