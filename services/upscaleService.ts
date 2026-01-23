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
 * Optimized with createImageBitmap for better performance
 */
const resizeImageIfNeeded = async (
    imageData: string,
    limits?: { maxPixels?: number; maxDimension?: number }
): Promise<string> => {
    try {
        const maxPixels = limits?.maxPixels ?? MAX_PIXELS;
        const maxDimension = limits?.maxDimension ?? MAX_DIMENSION;

        // Convert base64 to blob for createImageBitmap
        const response = await fetch(imageData);
        const blob = await response.blob();

        // createImageBitmap is faster and more efficient than new Image()
        const bitmap = await createImageBitmap(blob);

        const pixels = bitmap.width * bitmap.height;

        // If image is small enough, return as-is
        if (pixels <= maxPixels && bitmap.width <= maxDimension && bitmap.height <= maxDimension) {
            bitmap.close();
            return imageData;
        }

        // Calculate new dimensions
        const scale = Math.min(
            maxDimension / Math.max(bitmap.width, bitmap.height),
            Math.sqrt(maxPixels / pixels)
        );

        const newWidth = Math.floor(bitmap.width * scale);
        const newHeight = Math.floor(bitmap.height * scale);

        console.log(`Resizing image from ${bitmap.width}x${bitmap.height} to ${newWidth}x${newHeight} before upscale`);

        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
        }

        // Release bitmap memory
        bitmap.close();

        return canvas.toDataURL('image/png');
    } catch (error) {
        console.error('Error resizing image:', error);
        return imageData;
    }
};

export const upscaleImage = async (
    imageData: string,
    replicateApiKey: string,
    scale: number = 8,
    resizeLimits?: { maxPixels?: number; maxDimension?: number }
): Promise<UpscaleResult> => {
    const apiUrl = getApiUrl();

    console.log(`Upscaling image with ${scale}x scale...`);

    // Resize if needed to avoid GPU memory errors
    const resizedImage = await resizeImageIfNeeded(imageData, resizeLimits);

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
