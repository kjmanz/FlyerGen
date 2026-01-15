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
            const { apiKey, requests } = await request.json();

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

            console.log(`Processing ${requests.length} request(s)...`);

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
                                        responseModalities: ['Text', 'Image']
                                    }
                                })
                            }
                        );

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.error(`Request ${index + 1} failed:`, errorText);
                            return null;
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
                        return null;
                    }
                })
            );

            const validResults = results.filter(r => r !== null);

            if (validResults.length === 0) {
                return new Response(JSON.stringify({ error: 'All requests failed' }), {
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
                error: 'Internal error',
                message: error.message
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
