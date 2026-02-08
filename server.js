import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

const GEMINI_GENERATE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';
const REPLICATE_PREDICTIONS_ENDPOINT = 'https://api.replicate.com/v1/predictions';

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return Buffer.from(binary, 'binary').toString('base64');
};

const extractImageFromGeminiResponse = (payload) => {
  for (const part of payload?.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

const retryFetch = async (url, options, maxRetries = 3, initialDelayMs = 1000) => {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || ![429, 500, 503].includes(response.status)) {
        return response;
      }
      const errorText = await response.text();
      lastError = new Error(`HTTP ${response.status}: ${errorText}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxRetries - 1) {
      const delay = initialDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error('Request failed');
};

const normalizeImageDataToBase64 = async (imageData) => {
  if (!imageData) {
    throw new Error('Image data is required');
  }

  if (imageData.startsWith('http')) {
    const response = await fetch(imageData);
    if (!response.ok) {
      throw new Error(`Failed to fetch image URL: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }

  if (imageData.includes(',')) {
    return imageData.split(',')[1];
  }

  return imageData;
};

const requestGeminiImage = async (apiKey, contents, imageSize = '2K', aspectRatio = '3:4') => {
  const response = await retryFetch(
    GEMINI_GENERATE_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [contents],
        generationConfig: {
          responseModalities: ['Text', 'Image'],
          imageConfig: {
            imageSize,
            aspectRatio
          }
        }
      })
    },
    3,
    2000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const image = extractImageFromGeminiResponse(payload);
  if (!image) {
    throw new Error('No image in Gemini response');
  }
  return image;
};

const get4KRegeneratePrompt = () => `
【★最重要★ 高解像度再生成タスク - 内容変更禁止】
この画像を4K解像度で高精細に再生成してください。

【絶対厳守事項】
1. 画像の内容を一切変更しない
2. 文字・数字・ロゴ・配置を完全維持
3. 色・背景・装飾を完全維持
4. デザイン改変・要素追加・削除は禁止

【出力】
元画像と同じ内容の4K版を出力してください。
`;

// Batch image generation endpoint.
app.post('/api/batch-generate', async (req, res) => {
  try {
    const { apiKey, requests, imageSize, aspectRatio } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({ error: 'Requests array is required' });
    }

    const validImageSize = ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '2K';
    const validAspectRatio = aspectRatio === '4:3' ? '4:3' : '3:4';

    console.log(`Processing ${requests.length} generation request(s), imageSize=${validImageSize}, aspectRatio=${validAspectRatio}`);

    const generated = await Promise.all(
      requests.map(async (requestItem, index) => {
        try {
          return await requestGeminiImage(apiKey, requestItem.contents, validImageSize, validAspectRatio);
        } catch (error) {
          console.error(`Request ${index + 1} failed:`, error.message);
          return null;
        }
      })
    );

    const images = generated.filter(Boolean);
    if (images.length === 0) {
      return res.status(500).json({ error: 'All image generation requests failed' });
    }

    return res.json({ images });
  } catch (error) {
    console.error('Batch generation error:', error);
    return res.status(500).json({
      error: 'Image generation failed',
      message: error.message
    });
  }
});

// Edit image endpoint.
app.post('/api/edit-image', async (req, res) => {
  try {
    const { apiKey, imageData, editPrompt, imageSize, aspectRatio } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!editPrompt) return res.status(400).json({ error: 'Edit prompt is required' });

    const cleanBase64 = await normalizeImageDataToBase64(imageData);
    const validImageSize = ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '2K';
    const validAspectRatio = aspectRatio === '4:3' ? '4:3' : '3:4';

    const image = await requestGeminiImage(
      apiKey,
      {
        parts: [
          { text: editPrompt },
          { inlineData: { mimeType: 'image/png', data: cleanBase64 } }
        ]
      },
      validImageSize,
      validAspectRatio
    );

    return res.json({ image });
  } catch (error) {
    console.error('Edit image error:', error);
    return res.status(500).json({
      error: 'Image edit failed',
      message: error.message
    });
  }
});

// 4K regenerate endpoint.
app.post('/api/regenerate-4k', async (req, res) => {
  try {
    const { apiKey, imageData, aspectRatio } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key is required' });

    const cleanBase64 = await normalizeImageDataToBase64(imageData);
    const validAspectRatio = aspectRatio === '4:3' ? '4:3' : '3:4';

    const image = await requestGeminiImage(
      apiKey,
      {
        parts: [
          { text: get4KRegeneratePrompt() },
          { inlineData: { mimeType: 'image/png', data: cleanBase64 } }
        ]
      },
      '4K',
      validAspectRatio
    );

    return res.json({ success: true, image });
  } catch (error) {
    console.error('Regenerate 4K error:', error);
    return res.status(500).json({
      error: '4K regeneration failed',
      message: error.message
    });
  }
});

// Upscale endpoint.
app.post('/api/upscale', async (req, res) => {
  try {
    const { replicateApiKey, imageData, scale } = req.body;
    if (!replicateApiKey) {
      return res.status(400).json({ error: 'Replicate API key is required' });
    }
    if (!imageData) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const allowedScales = [2, 4, 8];
    const parsedScale = Number(scale);
    const upscaleScale = allowedScales.includes(parsedScale) ? parsedScale : 4;

    const predictionResponse = await fetch(REPLICATE_PREDICTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${replicateApiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait'
      },
      body: JSON.stringify({
        version: '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
        input: {
          image: imageData,
          scale: upscaleScale,
          face_enhance: false,
          tile: 400
        }
      })
    });

    if (!predictionResponse.ok) {
      const errorText = await predictionResponse.text();
      return res.status(predictionResponse.status).json({
        error: 'Replicate API error',
        message: errorText
      });
    }

    const prediction = await predictionResponse.json();
    const output = prediction?.output;
    const outputUrl = Array.isArray(output) ? output[0] : output;
    if (!outputUrl || prediction.status !== 'succeeded') {
      return res.status(500).json({
        error: 'Upscale failed',
        message: prediction?.error || 'No output URL'
      });
    }

    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      return res.status(502).json({
        error: 'Failed to fetch upscaled image',
        message: `HTTP ${imageResponse.status}`
      });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    return res.json({
      success: true,
      image: `data:image/png;base64,${base64}`,
      originalUrl: outputUrl
    });
  } catch (error) {
    console.error('Upscale error:', error);
    return res.status(500).json({
      error: 'Upscale failed',
      message: error.message
    });
  }
});

// Health check endpoint.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
