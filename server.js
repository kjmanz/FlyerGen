import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Image generation endpoint
app.post('/api/batch-generate', async (req, res) => {
    try {
        const { apiKey, requests } = req.body;

        if (!apiKey) {
            return res.status(400).json({ error: 'API key is required' });
        }

        if (!requests || !Array.isArray(requests) || requests.length === 0) {
            return res.status(400).json({ error: 'Requests array is required' });
        }

        const ai = new GoogleGenAI({ apiKey });

        console.log(`Processing ${requests.length} image generation request(s)...`);

        // Process requests in parallel using standard generateContent API
        const results = await Promise.all(
            requests.map(async (r, index) => {
                try {
                    console.log(`Starting request ${index + 1}...`);
                    const response = await ai.models.generateContent({
                        model: 'gemini-3-pro-image-preview',
                        contents: r.contents,
                        config: {
                            responseModalities: ['Text', 'Image'],
                        }
                    });

                    // Extract image from response
                    for (const part of response.candidates?.[0]?.content?.parts || []) {
                        if (part.inlineData) {
                            console.log(`Request ${index + 1} completed with image`);
                            return `data:image/png;base64,${part.inlineData.data}`;
                        }
                    }
                    console.log(`Request ${index + 1} completed without image`);
                    return null;
                } catch (e) {
                    console.error(`Request ${index + 1} failed:`, e.message);
                    return null;
                }
            })
        );

        const validResults = results.filter(r => r !== null);
        console.log(`Completed with ${validResults.length} image(s)`);

        if (validResults.length === 0) {
            return res.status(500).json({ error: 'All image generation requests failed' });
        }

        res.json({ images: validResults });

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({
            error: 'Image generation failed',
            message: error.message,
            details: error.toString()
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});
