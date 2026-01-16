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

// Max pixels for Replicate Real-ESRGAN (about 2M pixels, safe margin)
const MAX_PIXELS = 1800000;
const MAX_DIMENSION = 1440;

/**
 * Resize image if too large for the upscale API
 */
const resizeImageIfNeeded = async (imageData: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const pixels = img.width * img.height;

            // If image is small enough, return as-is
            if (pixels <= MAX_PIXELS && img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
                resolve(imageData);
                return;
            }

            // Calculate new dimensions
            let newWidth = img.width;
            let newHeight = img.height;

            const scale = Math.min(
                MAX_DIMENSION / Math.max(img.width, img.height),
                Math.sqrt(MAX_PIXELS / pixels)
            );

            newWidth = Math.floor(img.width * scale);
            newHeight = Math.floor(img.height * scale);

            console.log(`Resizing image from ${img.width}x${img.height} to ${newWidth}x${newHeight} before upscale`);

            // Create canvas and resize
            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;
            const ctx = canvas.getContext('2d');

            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                resolve(canvas.toDataURL('image/png'));
            } else {
                resolve(imageData);
            }
        };
        img.onerror = () => resolve(imageData);
        img.src = imageData;
    });
};

export const upscaleImage = async (
    imageData: string,
    replicateApiKey: string,
    scale: number = 2
): Promise<UpscaleResult> => {
    const apiUrl = getApiUrl();

    console.log(`Upscaling image with ${scale}x scale...`);

    // Resize if needed to avoid GPU memory errors
    const resizedImage = await resizeImageIfNeeded(imageData);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            replicateApiKey,
            imageData: resizedImage,
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

