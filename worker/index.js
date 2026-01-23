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

/**
 * Retry fetch with exponential backoff for transient errors (503, 429, etc.)
 */
async function retryFetch(url, options, maxRetries = 3, initialDelayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);

            // If success or non-retryable error, return immediately
            if (response.ok || (response.status !== 503 && response.status !== 429 && response.status !== 500)) {
                return response;
            }

            // Retryable error - log and continue
            const errorText = await response.text();
            console.log(`Attempt ${attempt + 1}/${maxRetries} failed with ${response.status}: ${errorText.substring(0, 200)}`);
            lastError = new Error(`${response.status}: ${errorText}`);

        } catch (fetchError) {
            console.log(`Attempt ${attempt + 1}/${maxRetries} network error: ${fetchError.message}`);
            lastError = fetchError;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries - 1) {
            const delay = initialDelayMs * Math.pow(2, attempt);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All retries exhausted
    throw lastError || new Error('All retry attempts failed');
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

            // 画像編集エンドポイント（Batch API - 50%コスト削減）
            if (path === '/api/edit-image') {
                return await handleEditImage(request, corsHeaders);
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

    const upscaleScale = 8;

    if (scale && scale !== upscaleScale) {
        console.log(`Requested upscale scale ${scale}x overridden to ${upscaleScale}x`);
    }

    console.log(`Starting upscale with scale: ${upscaleScale}x...`);

    // Replicate API呼び出し（Real-ESRGAN with tile processing for large images）
    // Using model version that supports tiled processing for large images
    const predictionResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${replicateApiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'  // 同期的に結果を待つ
        },
        body: JSON.stringify({
            // Using nightmareai/real-esrgan which supports larger images with tiling
            version: '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
            input: {
                image: imageData,
                scale: upscaleScale,
                face_enhance: false,
                tile: 400  // Enable tiled processing for large images
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
 * バッチ画像生成処理（Gemini Batch API - 50%コスト削減）
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

    console.log(`Starting Batch API with ${requests.length} request(s), imageSize: ${validImageSize}, aspectRatio: ${validAspectRatio}...`);

    // Batch APIのインラインリクエストを構築
    const inlineRequests = requests.map((r, index) => ({
        key: `request_${index}`,
        request: {
            contents: [r.contents],
            generationConfig: {
                responseModalities: ['Text', 'Image'],
                imageConfig: {
                    imageSize: validImageSize,
                    aspectRatio: validAspectRatio
                }
            }
        }
    }));

    try {
        // Step 1: バッチジョブを作成
        const batchResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:batchGenerateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    requests: inlineRequests.map(r => r.request)
                })
            }
        );

        if (!batchResponse.ok) {
            const errorText = await batchResponse.text();
            console.error('Batch API creation failed:', errorText);

            // Batch APIが利用できない場合は同期APIにフォールバック
            console.log('Falling back to synchronous API...');
            return await handleSyncGenerate(apiKey, requests, validImageSize, validAspectRatio, corsHeaders);
        }

        const batchResult = await batchResponse.json();

        // batchGenerateContentは即座に結果を返す場合がある
        if (batchResult.responses) {
            console.log('Batch API returned immediate results');
            const images = [];

            for (const response of batchResult.responses) {
                if (response.candidates?.[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData) {
                            images.push(`data:image/png;base64,${part.inlineData.data}`);
                        }
                    }
                }
            }

            if (images.length > 0) {
                return new Response(JSON.stringify({ images }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // 非同期ジョブの場合はジョブ名を取得してポーリング
        if (batchResult.name) {
            console.log('Batch job created:', batchResult.name);

            // ポーリングで結果を待つ（最大5分）
            const maxAttempts = 60;
            let attempts = 0;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機
                attempts++;

                const statusResponse = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/${batchResult.name}`,
                    {
                        headers: { 'x-goog-api-key': apiKey }
                    }
                );

                if (!statusResponse.ok) {
                    console.error('Status check failed:', await statusResponse.text());
                    continue;
                }

                const status = await statusResponse.json();
                console.log(`Batch job status: ${status.state}`);

                if (status.state === 'JOB_STATE_SUCCEEDED') {
                    // 結果を取得
                    const images = [];
                    if (status.response?.responses) {
                        for (const response of status.response.responses) {
                            if (response.candidates?.[0]?.content?.parts) {
                                for (const part of response.candidates[0].content.parts) {
                                    if (part.inlineData) {
                                        images.push(`data:image/png;base64,${part.inlineData.data}`);
                                    }
                                }
                            }
                        }
                    }

                    return new Response(JSON.stringify({ images }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                if (status.state === 'JOB_STATE_FAILED') {
                    throw new Error(`Batch job failed: ${status.error?.message || 'Unknown error'}`);
                }
            }

            throw new Error('Batch job timeout after 5 minutes');
        }

        // 結果が空の場合は同期APIにフォールバック
        console.log('No results from Batch API, falling back to synchronous API...');
        return await handleSyncGenerate(apiKey, requests, validImageSize, validAspectRatio, corsHeaders);

    } catch (error) {
        console.error('Batch API error:', error.message);
        // エラー時は同期APIにフォールバック
        console.log('Error occurred, falling back to synchronous API...');
        return await handleSyncGenerate(apiKey, requests, validImageSize, validAspectRatio, corsHeaders);
    }
}

/**
 * 同期画像生成処理（フォールバック用）
 */
async function handleSyncGenerate(apiKey, requests, imageSize, aspectRatio, corsHeaders) {
    console.log(`Sync generation: ${requests.length} request(s)...`);

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
                                    imageSize: imageSize,
                                    aspectRatio: aspectRatio
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

/**
 * 画像編集処理（Batch API - 50%コスト削減）
 */
async function handleEditImage(request, corsHeaders) {
    const { apiKey, imageData, editPrompt, imageSize, aspectRatio } = await request.json();

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key is required' }), {
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

    if (!editPrompt) {
        return new Response(JSON.stringify({ error: 'Edit prompt is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const validImageSize = ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '2K';
    const validAspectRatio = aspectRatio || '3:4';

    console.log(`Starting image edit with Batch API, imageSize: ${validImageSize}...`);

    // Base64データを抽出
    let cleanBase64 = imageData;
    if (imageData.includes(',')) {
        cleanBase64 = imageData.split(',')[1];
    }

    try {
        // Batch API呼び出し
        const batchResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:batchGenerateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    requests: [{
                        contents: [{
                            parts: [
                                { text: editPrompt },
                                {
                                    inlineData: {
                                        mimeType: 'image/png',
                                        data: cleanBase64
                                    }
                                }
                            ]
                        }],
                        generationConfig: {
                            responseModalities: ['Text', 'Image'],
                            imageConfig: {
                                imageSize: validImageSize,
                                aspectRatio: validAspectRatio
                            }
                        }
                    }]
                })
            }
        );

        if (!batchResponse.ok) {
            const errorText = await batchResponse.text();
            console.error('Batch API edit failed:', errorText);

            // フォールバック: 同期API
            console.log('Falling back to synchronous API for edit...');
            return await handleSyncEdit(apiKey, editPrompt, cleanBase64, validImageSize, validAspectRatio, corsHeaders);
        }

        const batchResult = await batchResponse.json();

        // 結果を取得
        if (batchResult.responses) {
            for (const response of batchResult.responses) {
                if (response.candidates?.[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData) {
                            return new Response(JSON.stringify({
                                image: `data:image/png;base64,${part.inlineData.data}`
                            }), {
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                            });
                        }
                    }
                }
            }
        }

        // 結果がない場合はフォールバック
        return await handleSyncEdit(apiKey, editPrompt, cleanBase64, validImageSize, validAspectRatio, corsHeaders);

    } catch (error) {
        console.error('Edit API error:', error.message);
        return await handleSyncEdit(apiKey, editPrompt, cleanBase64, validImageSize, validAspectRatio, corsHeaders);
    }
}

/**
 * 同期画像編集処理（フォールバック用）
 */
async function handleSyncEdit(apiKey, editPrompt, base64Data, imageSize, aspectRatio, corsHeaders) {
    console.log('Sync edit generation with retry...');

    try {
        const response = await retryFetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: editPrompt },
                            {
                                inlineData: {
                                    mimeType: 'image/png',
                                    data: base64Data
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ['Text', 'Image'],
                        imageConfig: {
                            imageSize: imageSize,
                            aspectRatio: aspectRatio
                        }
                    }
                })
            },
            3,   // maxRetries
            2000 // initialDelayMs (2 seconds)
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Sync edit failed:', errorText);
            return new Response(JSON.stringify({
                error: 'Image edit failed',
                message: errorText
            }), {
                status: response.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        for (const part of data.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return new Response(JSON.stringify({
                    image: `data:image/png;base64,${part.inlineData.data}`
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response(JSON.stringify({
            error: 'No image in response'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Sync edit failed after retries:', error.message);
        return new Response(JSON.stringify({
            error: 'Image edit failed',
            message: error.message
        }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
