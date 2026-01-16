/**
 * Upscale Service - Replicate Real-ESRGAN API
 */

// API endpoint: use Worker URL in production, localhost in development
const getApiUrl = () => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return baseUrl.replace('/api/batch-generate', '') + '/api/upscale';
};

export interface UpscaleResult {
    success: boolean;
    image: string;
    originalUrl?: string;
    error?: string;
}

export const upscaleImage = async (
    imageData: string,
    replicateApiKey: string,
    scale: number = 2
): Promise<UpscaleResult> => {
    const apiUrl = getApiUrl();

    console.log(`Upscaling image with ${scale}x scale...`);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            replicateApiKey,
            imageData,
            scale
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Upscale API error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.image) {
        throw new Error(result.error || 'アップスケールに失敗しました');
    }

    console.log('Upscale completed successfully');
    return result;
};
