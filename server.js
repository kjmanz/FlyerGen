import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

const OPENAI_IMAGE_MODEL = 'gpt-image-2';
const OPENAI_GENERATE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const OPENAI_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const GEMINI_GENERATE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent';
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

const normalizeImageData = async (imageData) => {
  if (!imageData) {
    throw new Error('Image data is required');
  }

  if (imageData.startsWith('http')) {
    const response = await fetch(imageData);
    if (!response.ok) {
      throw new Error(`Failed to fetch image URL: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return {
      data: arrayBufferToBase64(buffer),
      mimeType: response.headers.get('content-type') || 'image/png'
    };
  }

  const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { data: dataUrlMatch[2], mimeType: dataUrlMatch[1] };
  }

  return { data: imageData, mimeType: 'image/png' };
};

const getOpenAIImageSize = (imageSize = '1K', aspectRatio = '3:4') => {
  const portraitSizes = {
    '1K': '768x1024',
    '2K': '1536x2048',
    '4K': '2448x3264'
  };
  const portrait = portraitSizes[imageSize] || portraitSizes['1K'];
  if (aspectRatio === '4:3') {
    const [width, height] = portrait.split('x');
    return `${height}x${width}`;
  }
  return portrait;
};

const parseImageRequest = (contents) => {
  const promptParts = [];
  const images = [];
  for (const part of contents?.parts || []) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      promptParts.push(part.text.trim());
    }
    if (part?.inlineData?.data) {
      images.push({
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'image/png'
      });
    }
  }
  return { prompt: promptParts.join('\n\n'), images };
};

const requestOpenAIImage = async (apiKey, contents, imageSize = '1K', aspectRatio = '3:4') => {
  const { prompt, images } = parseImageRequest(contents);
  if (!prompt) throw new Error('Image prompt is required');

  const size = getOpenAIImageSize(imageSize, aspectRatio);
  let response;

  if (images.length > 0) {
    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', 'high');
    form.append('output_format', 'png');
    images.forEach((image, index) => {
      const bytes = Buffer.from(image.data, 'base64');
      form.append('image[]', new Blob([bytes], { type: image.mimeType }), `reference-${index + 1}.png`);
    });
    response = await retryFetch(OPENAI_EDIT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    }, 3, 2000);
  } else {
    response = await retryFetch(OPENAI_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        size,
        quality: 'high',
        output_format: 'png',
        n: 1
      })
    }, 3, 2000);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Image API error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const base64 = payload?.data?.[0]?.b64_json;
  if (!base64) throw new Error('No image in OpenAI response');
  return `data:image/png;base64,${base64}`;
};

const requestGeminiImage = async (apiKey, contents, _imageSize = '1K', aspectRatio = '3:4') => {
  const response = await retryFetch(GEMINI_GENERATE_ENDPOINT, {
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
          imageSize: '1K',
          aspectRatio
        }
      }
    })
  }, 3, 2000);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Image API error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const image = extractImageFromGeminiResponse(payload);
  if (!image) throw new Error('No image in Gemini response');
  return image;
};

const normalizeImageProvider = (provider) => provider === 'gemini' ? 'gemini' : 'openai';

const requestImage = (provider, apiKey, contents, imageSize, aspectRatio) => (
  provider === 'gemini'
    ? requestGeminiImage(apiKey, contents, imageSize, aspectRatio)
    : requestOpenAIImage(apiKey, contents, imageSize, aspectRatio)
);

// Batch image generation endpoint.
app.post('/api/batch-generate', async (req, res) => {
  try {
    const { apiKey, requests, imageSize, aspectRatio } = req.body;
    const provider = normalizeImageProvider(req.body.provider);

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({ error: 'Requests array is required' });
    }

    const validImageSize = provider === 'gemini'
      ? '1K'
      : ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '1K';
    const validAspectRatio = aspectRatio === '4:3' ? '4:3' : '3:4';

    console.log(`Processing ${requests.length} ${provider} generation request(s), imageSize=${validImageSize}, aspectRatio=${validAspectRatio}`);

    const results = await Promise.allSettled(
      requests.map((requestItem) => (
        requestImage(provider, apiKey, requestItem.contents, validImageSize, validAspectRatio)
      ))
    );
    const images = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || 'Unknown error');
    if (images.length === 0) {
      return res.status(502).json({ error: 'All image generation requests failed', details: errors });
    }

    return res.json({ images, errors });
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
    const provider = normalizeImageProvider(req.body.provider);
    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!editPrompt) return res.status(400).json({ error: 'Edit prompt is required' });

    const normalizedImage = await normalizeImageData(imageData);
    const validImageSize = provider === 'gemini'
      ? '1K'
      : ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '1K';
    const validAspectRatio = aspectRatio === '4:3' ? '4:3' : '3:4';

    const image = await requestImage(
      provider,
      apiKey,
      {
        parts: [
          { text: editPrompt },
          { inlineData: normalizedImage }
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
