/**
 * FlyerGen API Worker
 * Cloudflare Workerで動作するGemini API & Replicate API プロキシ
 */

/**
 * Convert ArrayBuffer to Base64 string (handles large files without stack overflow)
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 32768; // Process in 32KB chunks to avoid stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

export default {
    async fetch(request, env) {
        // CORS設定
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // OPTIONSリクエスト（プリフライト）
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // POSTリクエストのみ受け付け
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // URLルーティング
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // アップスケールエンドポイント
            if (path === '/api/upscale') {
                return await handleUpscale(request, corsHeaders);
            }

            // デフォルト: バッチ生成エンドポイント（後方互換性）
            return await handleBatchGenerate(request, corsHeaders);

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal Worker Error',
                message: error.message,
                stack: error.stack
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

/**
 * アップスケール処理（Replicate Real-ESRGAN）
 */
async function handleUpscale(request, corsHeaders) {
    const { replicateApiKey, imageData, scale } = await request.json();

    if (!replicateApiKey) {
        return new Response(JSON.stringify({ error: 'Replicate API key is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (!imageData) {
        return new Response(JSON.stringify({ error: 'Image data is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const upscaleScale = scale || 2;

    console.log(`Starting upscale with scale: ${upscaleScale}x...`);

    // Replicate API呼び出し（Real-ESRGAN）
    const predictionResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${replicateApiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'  // 同期的に結果を待つ
        },
        body: JSON.stringify({
            version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
            input: {
                image: imageData,
                scale: upscaleScale,
                face_enhance: false
            }
        })
    });

    if (!predictionResponse.ok) {
        const errorText = await predictionResponse.text();
        console.error('Replicate API error:', errorText);
        return new Response(JSON.stringify({
            error: 'Replicate API Error',
            message: errorText
        }), {
            status: predictionResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const prediction = await predictionResponse.json();

    // 処理完了を待つ（Prefer: waitを使用しているが、念のためポーリング対応）
    if (prediction.status === 'succeeded' && prediction.output) {
        // 出力画像URLを取得
        const outputUrl = prediction.output;

        // 画像をBase64に変換してフロントに返す
        const imageResponse = await fetch(outputUrl);
        const imageBlob = await imageResponse.arrayBuffer();
        const base64 = arrayBufferToBase64(imageBlob);

        console.log('Upscale completed successfully');

        return new Response(JSON.stringify({
            success: true,
            image: `data:image/png;base64,${base64}`,
            originalUrl: outputUrl
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // ステータスが処理中の場合はポーリングが必要
    if (prediction.status === 'processing' || prediction.status === 'starting') {
        // 最大60秒待機してポーリング
        const predictionId = prediction.id;
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;

            const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: {
                    'Authorization': `Bearer ${replicateApiKey}`
                }
            });

            const status = await statusResponse.json();

            if (status.status === 'succeeded' && status.output) {
                const outputUrl = status.output;
                const imageResponse = await fetch(outputUrl);
                const imageBlob = await imageResponse.arrayBuffer();
                const base64 = arrayBufferToBase64(imageBlob);

                console.log('Upscale completed after polling');

                return new Response(JSON.stringify({
                    success: true,
                    image: `data:image/png;base64,${base64}`,
                    originalUrl: outputUrl
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (status.status === 'failed') {
                return new Response(JSON.stringify({
                    error: 'Upscale failed',
                    message: status.error || 'Unknown error'
                }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response(JSON.stringify({
            error: 'Upscale timeout',
            message: 'Processing took too long'
        }), {
            status: 504,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
        error: 'Upscale failed',
        message: prediction.error || 'Unknown error',
        status: prediction.status
    }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * バッチ画像生成処理（Gemini API）
 */
async function handleBatchGenerate(request, corsHeaders) {
    const { apiKey, requests, imageSize, aspectRatio } = await request.json();

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
        return new Response(JSON.stringify({ error: 'Requests array is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const validImageSize = ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '2K';
    const validAspectRatio = aspectRatio || '3:4';

    console.log(`Processing ${requests.length} request(s) with imageSize: ${validImageSize}, aspectRatio: ${validAspectRatio}...`);

    const results = await Promise.all(
        requests.map(async (r, index) => {
            try {
                const response = await fetch(
                    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': apiKey
                        },
                        body: JSON.stringify({
                            contents: [r.contents],
                            generationConfig: {
                                responseModalities: ['Text', 'Image'],
                                imageConfig: {
                                    imageSize: validImageSize,
                                    aspectRatio: validAspectRatio
                                }
                            }
                        })
                    }
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Request ${index + 1} failed:`, errorText);
                    throw new Error(`Google API Error (${response.status}): ${errorText}`);
                }

                const data = await response.json();

                for (const part of data.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData) {
                        return `data:image/png;base64,${part.inlineData.data}`;
                    }
                }
                return null;
            } catch (e) {
                console.error(`Request ${index + 1} error:`, e.message);
                return { error: e.message };
            }
        })
    );

    const errors = results.filter(r => r && r.error);
    if (errors.length > 0) {
        return new Response(JSON.stringify({
            error: 'Generation failed',
            details: errors
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const validResults = results.filter(r => r && !r.error);

    if (validResults.length === 0) {
        return new Response(JSON.stringify({ error: 'All requests failed', details: errors }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ images: validResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
