import { GoogleGenAI, Type } from "@google/genai";
import { Product, FlyerSettings, SpecSearchResult } from "../types";

// Helper to get client instance with provided API key
const getClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

export const searchProductSpecs = async (productCode: string, apiKey: string): Promise<SpecSearchResult> => {
  const ai = getClient(apiKey);

  const prompt = `
    家電製品の品番 "${productCode}" のスペック情報を検索してください。
    以下のJSON形式で出力してください：
    1. "productName": 商品の正式名称（日本語）
    2. "specs": 主要スペックの簡潔な要約（畳数、サイズ、消費電力など、日本語）
    3. "features": 3〜5つの主なセールスポイント（箇条書き配列、日本語）
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.0-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            productName: { type: Type.STRING },
            specs: { type: Type.STRING },
            features: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["productName", "specs"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AIからの応答がありません");
    return JSON.parse(text) as SpecSearchResult;

  } catch (error) {
    console.error("Spec search failed:", error);
    throw error;
  }
};

export const generateFlyerImage = async (
  products: Product[],
  settings: FlyerSettings,
  characterImages: string[],
  characterClothingMode: 'fixed' | 'match',
  referenceImages: string[],
  storeLogoImages: string[],
  apiKey: string
): Promise<string[]> => {
  // Background instruction logic
  const backgroundInstruction = settings.backgroundMode === 'white'
    ? "【重要：背景について】背景は必ず「完全な白（#FFFFFF）」にしてください。商品画像やテキストを切り抜きやすくするため、余計な装飾背景や模様は一切入れないでください。シンプルでクリーンな白背景の商品一覧チラシにします。"
    : "【背景について】背景は商品の魅力を引き立てる、明るく親しみやすいデザインにしてください。季節感や「街の電気屋さん」の温かみを感じさせる背景装飾を適度に入れてください。";

  // 1. Construct the text prompt
  let prompt = `
    【役割】
    あなたは日本の家電量販店のプロのチラシデザイナーです。

    【タスク】
    以下の情報をもとに、高品質でリアルな販促チラシ画像を生成してください。
    
    【出力仕様】
    - レイアウト: ${settings.orientation === 'vertical' ? 'A4縦 (210mm × 297mm)' : 'A4横 (297mm × 210mm)'}
    - 出力解像度: ${settings.imageSize}（1K=約1024px、2K=約2048px、4K=約4096px。A4比率を維持して高解像度で生成）
    - 言語: 日本語（自然で正確な表現）
    - 雰囲気: 地域密着の信頼できる「街の電気屋さん」。元気で親しみやすく、信頼感のあるデザイン。
    - ${backgroundInstruction}
    
    【掲載商品】
  `;

  products.forEach((p, index) => {
    const priceLabel = p.salePriceLabel && p.salePriceLabel.trim() !== '' ? p.salePriceLabel : '特価';
    const originalPriceStr = typeof p.originalPrice === 'number'
      ? `${p.originalPrice.toLocaleString()}円`
      : '';

    let salePriceStr: string | number = p.salePrice;
    const cleanSalePrice = String(p.salePrice).replace(/[,，\s]/g, '');
    if (cleanSalePrice && /^\d+$/.test(cleanSalePrice)) {
      salePriceStr = `${parseInt(cleanSalePrice).toLocaleString()}円`;
    }

    prompt += `
    [商品 ${index + 1}]
    - 品番: ${p.productCode}
    - 商品名: ${p.productName}
    - スペック: ${p.specs}
    - 通常価格: ${originalPriceStr}
    - ${priceLabel}: ${salePriceStr} (赤字で大きく強調！金額の場合はカンマ区切りで表示)
    - キャッチコピー: ${p.catchCopy}
    `;
  });

  if (settings.additionalInstructions) {
    prompt += `\n【追加指示】\n${settings.additionalInstructions}`;
  }

  // Character clothing instruction
  const clothingInstruction = characterClothingMode === 'fixed'
    ? "【キャラクターの服装について】キャラクター画像の服装はそのまま維持してください。元のデザインを変更せずに使用してください。"
    : "【キャラクターの服装について】キャラクターの服装はチラシのテーマや季節に合わせて適切に変更してください。例えば、冬のチラシなら暖かい服装、夏のチラシなら涼しげな服装にしてください。";

  prompt += `\n
    ${characterImages.length > 0 ? clothingInstruction : ''}
    
    【画像の使用について】
    提供された画像は以下の順序で添付されています：
    1. 商品画像
    2. キャラクター画像（あれば、デザインのアクセントに使用）
    3. 参考チラシ画像（デザインスタイルの参考にのみ使用）
    4. 店名ロゴ画像（チラシの最下部に配置してください）
  `;

  // 2. Prepare content parts (Text + Images)
  // 2. Prepare content parts (Text + Images)
  const parts: any[] = [{ text: prompt }];

  const processImage = async (imgData: string) => {
    let base64Data = imgData;

    // If it's a URL, fetch it and convert to base64
    if (imgData.startsWith('http')) {
      try {
        const resp = await fetch(imgData);
        const blob = await resp.blob();
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error('Failed to fetch image from URL:', e);
        return null;
      }
    }

    const cleanBase64 = base64Data.split(',')[1] || base64Data;
    return {
      inlineData: {
        mimeType: 'image/png',
        data: cleanBase64
      }
    };
  };

  // Collect all images to process
  const imagesToProcess: string[] = [];
  products.forEach((p) => imagesToProcess.push(...p.images));
  imagesToProcess.push(...characterImages);
  imagesToProcess.push(...referenceImages);
  imagesToProcess.push(...storeLogoImages);

  // Process all images concurrently
  const processedImages = await Promise.all(imagesToProcess.map(processImage));

  // Add valid images to parts
  processedImages.forEach(img => {
    if (img) parts.push(img);
  });

  // Determine aspect ratio based on orientation (A4 ratio)
  const aspectRatio = settings.orientation === 'vertical' ? '3:4' : '4:3';

  // 3. Create batch requests (one per pattern)
  const batchRequests = Array.from({ length: settings.patternCount }).map(() => ({
    contents: { parts }
  }));

  console.log(`Sending ${batchRequests.length} request(s) to API with imageSize: ${settings.imageSize}, aspectRatio: ${aspectRatio}...`);

  // API endpoint: use Worker URL in production, localhost in development
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/batch-generate';

  // Call API server
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiKey,
      requests: batchRequests,
      imageSize: settings.imageSize,
      aspectRatio: aspectRatio
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let errorMessage = errorData.message || errorData.error || `Batch API error: ${response.status}`;

    // Append details if available
    if (errorData.details && Array.isArray(errorData.details)) {
      errorMessage += '\nDetails:\n' + errorData.details.map((d: any) => d.error || JSON.stringify(d)).join('\n');
    }

    throw new Error(errorMessage);
  }

  const result = await response.json();

  if (!result.images || result.images.length === 0) {
    throw new Error("画像の生成に失敗しました。");
  }

  console.log(`Received ${result.images.length} image(s) from Batch API`);
  return result.images;
};
