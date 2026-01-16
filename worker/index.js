/**
 * FlyerGen API Worker
 * Cloudflare Workerで動作するGemini API Batch処理プロキシ
 */

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

        try {
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

            // Validate imageSize (must be uppercase K)
            const validImageSize = ['1K', '2K', '4K'].includes(imageSize) ? imageSize : '2K';
            const validAspectRatio = aspectRatio || '3:4';

            console.log(`Processing ${requests.length} request(s) with imageSize: ${validImageSize}, aspectRatio: ${validAspectRatio}...`);

            // 並列で画像生成リクエストを処理
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
                            // エラー詳細を返すために例外を投げる
                            throw new Error(`Google API Error (${response.status}): ${errorText}`);
                        }

                        const data = await response.json();

                        // 画像データを抽出
                        for (const part of data.candidates?.[0]?.content?.parts || []) {
                            if (part.inlineData) {
                                return `data:image/png;base64,${part.inlineData.data}`;
                            }
                        }
                        return null;
                    } catch (e) {
                        console.error(`Request ${index + 1} error:`, e.message);
                        return { error: e.message }; // エラーオブジェクトを返す
                    }
                })
            );

            // エラーチェック
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

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal Worker Error',
                message: error.message,
                stack: error.stack // デバッグ用にスタックトレースも含める
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
