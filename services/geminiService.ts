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
    以下のJSON形式で出力：
    1. "productName": 商品の正式名称（50文字以内）
    2. "specs": 主要スペック要約（300文字以内）
    3. "features": 主な特徴5つ（各50文字以内の配列）
    4. "customerReviews": 実際のユーザーの声を5〜7件程度まとめて（600文字以内）
    5. "benefits": ベネフィット要約（300文字以内）
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            productName: { type: Type.STRING },
            specs: { type: Type.STRING },
            features: { type: Type.ARRAY, items: { type: Type.STRING } },
            customerReviews: { type: Type.STRING },
            benefits: { type: Type.STRING }
          },
          required: ["productName", "specs"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      // Retry once if empty response
      console.log("Empty response, retrying...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING },
              specs: { type: Type.STRING },
              features: { type: Type.ARRAY, items: { type: Type.STRING } },
              customerReviews: { type: Type.STRING },
              benefits: { type: Type.STRING }
            },
            required: ["productName", "specs"]
          }
        }
      });
      const retryText = retryResponse.text;
      if (!retryText) throw new Error("AIからの応答がありません。品番を確認してください。");
      return JSON.parse(retryText) as SpecSearchResult;
    }
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
    ? "【最重要：背景は絶対に純白】背景色は必ず「純白（RGB: 255,255,255 / #FFFFFF）」のみを使用してください。青、グレー、クリーム色、その他いかなる色も絶対に使わないでください。グラデーション、模様、装飾、影も一切禁止です。商品と文字以外は全て真っ白にしてください。これは印刷用切り抜き素材のための必須条件です。"
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

  // Logo position instruction
  const logoPositionInstruction = settings.logoPosition === 'full-bottom'
    ? '【店名ロゴの配置】チラシの最下部に左右いっぱいに横長で配置してください。'
    : '【店名ロゴの配置】チラシの右下部分に適切なサイズで配置してください。';

  prompt += `\n
    ${characterImages.length > 0 ? clothingInstruction : ''}

    【画像の使用について】
    提供された画像は以下の順序で添付されています：
    1. 商品画像
    2. キャラクター画像（あれば、デザインのアクセントに使用）
    3. 参考チラシ画像${referenceImages.length > 0 ? '（★重要★下記の【参考デザインの模倣指示】を参照）' : ''}
    4. 店名ロゴ画像

    ${storeLogoImages.length > 0 ? `
    【★店名ロゴについて - 絶対厳守★】
    店名ロゴ画像が提供されています。以下のルールを必ず守ってください：
    1. ロゴは一切編集・加工・変形しないでください
    2. ロゴの色、フォント、デザインをそのまま忠実に再現してください
    3. ロゴのアスペクト比を維持してください
    4. ${logoPositionInstruction}
    5. ロゴの周りに十分な余白を確保し、他の要素と重ならないようにしてください
    ` : ''}
  `;

  if (referenceImages.length > 0) {
    prompt += `\n
    【★参考デザインの模倣指示★】
    参考チラシ画像が提供されています。以下の要素を詳細に分析し、可能な限り忠実に模倣してください：

    1. **全体レイアウト構成**
       - 商品の配置パターン（縦並び、横並び、グリッド配置など）
       - 余白の取り方、マージンのバランス
       - タイトルや見出しの位置関係
       - 全体の視線誘導の流れ

    2. **色使いとカラースキーム**
       - メインカラー、アクセントカラーの配色
       - 価格表示部分の背景色や装飾の色
       - グラデーションや影の使い方
       - 文字色と背景色のコントラスト

    3. **タイポグラフィとフォントスタイル**
       - タイトル、見出し、本文の文字サイズの比率
       - 太字、斜体、アウトラインなどの装飾の使い方
       - 価格表示の文字サイズと強調方法
       - 行間、文字間のスペーシング

    4. **装飾要素とデザインパーツ**
       - 枠線、吹き出し、リボン、バッジなどの装飾
       - アイコンやマークの使用パターン
       - 背景の模様やテクスチャ
       - 区切り線や囲み枠のスタイル

    5. **商品表示の手法**
       - 商品画像のサイズと配置方法
       - 商品名、スペック、価格の配置順序
       - 特価表示や割引表示の演出方法
       - キャッチコピーの配置とスタイル

    6. **視覚的な強調テクニック**
       - 注目を集めるための効果（スターバースト、フラッシュなど）
       - 価格の強調方法（大きさ、色、背景、枠など）
       - 「限定」「お買い得」などの訴求ポイントの表現
       - 影、光沢、立体感の演出

    【重要】参考デザインのスタイルを「参考にする」だけでなく、できるだけ「再現する」ことを目指してください。
    ただし、商品情報や店名ロゴなど、提供された固有の内容は正確に反映してください。
    `;
  }

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

// Generate category tags from product information using Gemini Flash
export const generateTagsFromProducts = async (
  products: Product[],
  apiKey: string
): Promise<string[]> => {
  const ai = getClient(apiKey);

  // Create a summary of products for tag generation
  const productSummary = products.map(p =>
    `${p.productName} ${p.productCode} ${p.specs}`
  ).join('\n');

  const prompt = `
    以下の商品情報から、大きなカテゴリのタグを抽出してください。
    
    【商品情報】
    ${productSummary}
    
    【ルール】
    - 商品カテゴリ名のみ（例: エアコン, テレビ, 冷蔵庫, 洗濯機, 掃除機）
    - 品番や型番は含めない
    - ブランド名は含めない
    - 最大5個まで
    - 重複禁止
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "商品カテゴリのタグ配列"
            }
          },
          required: ["tags"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      console.warn("Tag generation returned empty response");
      return [];
    }

    const result = JSON.parse(text);
    return result.tags || [];
  } catch (error) {
    console.error("Tag generation failed:", error);
    return []; // Return empty array on error to not block the main flow
  }
};

// Generate category tags from flyer image using Gemini Flash Vision
export const generateTagsFromImage = async (
  imageUrl: string,
  apiKey: string
): Promise<string[]> => {
  const ai = getClient(apiKey);

  const prompt = `
    このチラシ画像を見て、掲載されている商品のカテゴリを抽出してください。
    
    【ルール】
    - 商品カテゴリ名のみ（例: エアコン, テレビ, 冷蔵庫, 洗濯機, 掃除機）
    - 品番や型番は含めない
    - ブランド名は含めない
    - 最大5個まで
    - 重複禁止
  `;

  try {
    // Fetch image and convert to base64 if it's a URL
    let imageData = imageUrl;
    if (imageUrl.startsWith('http')) {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      imageData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }

    const cleanBase64 = imageData.split(',')[1] || imageData;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/png',
            data: cleanBase64
          }
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "商品カテゴリのタグ配列"
            }
          },
          required: ["tags"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      console.warn("Image tag generation returned empty response");
      return [];
    }

    const result = JSON.parse(text);
    return result.tags || [];
  } catch (error) {
    console.error("Image tag generation failed:", error);
    return [];
  }
};

// Edit region types for image editing
interface EditPoint {
  id: string;
  type: 'point';
  x: number;
  y: number;
  prompt: string;
}

interface EditArea {
  id: string;
  type: 'area';
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
}

type EditRegion = EditPoint | EditArea;

// Generate position description for prompt
const getPositionDescription = (region: EditRegion): string => {
  if (region.type === 'point') {
    const xDesc = region.x < 33 ? '左側' : region.x > 66 ? '右側' : '中央';
    const yDesc = region.y < 33 ? '上部' : region.y > 66 ? '下部' : '中央';
    return `画像の${yDesc}${xDesc}（約${Math.round(region.x)}%, ${Math.round(region.y)}%の位置）`;
  } else {
    return `画像の範囲（${Math.round(region.x)}%〜${Math.round(region.x + region.width)}%, ${Math.round(region.y)}%〜${Math.round(region.y + region.height)}%）`;
  }
};

// API URL for worker
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/batch-generate';

// Edit image using Worker Batch API (50% cost reduction)
export const editImage = async (
  imageUrl: string,
  regions: EditRegion[],
  apiKey: string
): Promise<string> => {
  // Build edit prompt from regions
  const editInstructions = regions.map((region, idx) => {
    const position = getPositionDescription(region);
    return `${idx + 1}. ${position}: ${region.prompt}`;
  }).join('\n');

  const editPrompt = `
【★最重要★ 画像編集タスク】
あなたはプロの画像編集者です。この画像に対して、以下の指定箇所のみを編集してください。

【編集指示】
${editInstructions}

【絶対に守るべきルール】
1. 指定された箇所のみを編集し、それ以外の部分は一切変更しないでください
2. 元の画像の構図、色調、スタイルを完全に維持してください
3. 編集箇所以外のテキスト、ロゴ、商品画像は絶対に変更しないでください
4. 高品質で自然な編集結果を生成してください
5. 元の画像と編集箇所以外は1ピクセルも変わらないようにしてください

【出力】
編集後の画像を出力してください。
`;

  try {
    // Fetch image and convert to base64 if it's a URL
    let imageData = imageUrl;
    if (imageUrl.startsWith('http')) {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      imageData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }

    // Call Worker API for edit (uses Batch API - 50% cost reduction)
    const workerUrl = API_URL.replace('/api/batch-generate', '/api/edit-image');

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        imageData,
        editPrompt,
        imageSize: '2K',
        aspectRatio: '3:4'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || 'Edit failed');
    }

    const result = await response.json();

    if (result.image) {
      return result.image;
    }

    throw new Error('画像の生成に失敗しました');
  } catch (error) {
    console.error("Image edit failed:", error);
    throw error;
  }
};
