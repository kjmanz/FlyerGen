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
  customIllustrations: string[],
  apiKey: string
): Promise<string[]> => {
  // Background instruction logic
  let backgroundInstruction: string;
  if (settings.backgroundMode === 'white') {
    backgroundInstruction = "【最重要：背景は絶対に純白】背景色は必ず「純白（RGB: 255,255,255 / #FFFFFF）」のみを使用してください。青、グレー、クリーム色、その他いかなる色も絶対に使わないでください。グラデーション、模様、装飾、影も一切禁止です。商品と文字以外は全て真っ白にしてください。これは印刷用切り抜き素材のための必須条件です。";
  } else if (settings.backgroundMode === 'custom' && settings.customBackground) {
    backgroundInstruction = `【背景について - カスタム指定】以下の指定に沿った背景を作成してください：\n${settings.customBackground}`;
  } else {
    backgroundInstruction = "【背景について】背景は商品の魅力を引き立てる、明るく親しみやすいデザインにしてください。季節感や「街の電気屋さん」の温かみを感じさせる背景装飾を適度に入れてください。";
  }

  // Title instruction
  const titleInstruction = settings.flyerTitle
    ? `【チラシタイトル】チラシの上部に「${settings.flyerTitle}」というタイトルを大きく目立つように配置してください。`
    : '';

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
    ${titleInstruction ? `\n    ${titleInstruction}` : ''}

    【掲載商品】
  `;

  products.forEach((p, index) => {
    const priceLabel = p.salePriceLabel && p.salePriceLabel.trim() !== '' ? p.salePriceLabel : '特価';
    const originalPriceStr = typeof p.originalPrice === 'number'
      ? `${p.originalPrice.toLocaleString()}円（税込）`
      : '';

    let salePriceStr: string | number = p.salePrice;
    const cleanSalePrice = String(p.salePrice).replace(/[,，\s]/g, '');
    if (cleanSalePrice && /^\d+$/.test(cleanSalePrice)) {
      salePriceStr = `${parseInt(cleanSalePrice).toLocaleString()}円（税込）`;
    }

    prompt += `
    [商品 ${index + 1}]
    - 品番: ${p.productCode}
    - 商品名: ${p.productName}
    - スペック: ${p.specs}
    - 通常価格: ${originalPriceStr}
    - ${priceLabel}: ${salePriceStr} (赤字で大きく強調！金額の場合はカンマ区切りで表示。すべて税込価格)
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
    ? '【店名ロゴの配置】チラシの最下部に左右いっぱいに横長で配置してください。横幅100%を使用してください。'
    : '【店名ロゴの配置】チラシの最下部の右側半分に配置してください。横幅は約50%で、右端に寄せて配置してください。';

  prompt += `\n
    ${characterImages.length > 0 ? clothingInstruction : ''}

    【画像の使用について】
    提供された画像は以下の順序で添付されています：
    1. 商品画像
    2. キャラクター画像（あれば、デザインのアクセントに使用）
    3. 参考チラシ画像${referenceImages.length > 0 ? '（★重要★下記の【参考デザインの模倣指示】を参照）' : ''}
    4. 使用イラスト（チラシ内に配置して装飾に活用）
    5. 店名ロゴ画像

    ${customIllustrations.length > 0 ? `
    【★使用イラストについて - 配置と使用方法★】
    使用イラスト画像が提供されています。以下のルールに従って配置してください：
    1. イラストは一切編集・加工・変形しないでください
    2. イラストの色、デザインをそのまま忠実に再現してください
    3. イラストのアスペクト比を維持してください
    4. イラストは「添付画像をそのまま貼り付ける」前提で再現し、描き直し・推測・再生成は禁止
    5. 縁取り・影・ぼかし・質感追加などの装飾は禁止（元画像の透過は維持）
    6. イラストはチラシ内のデザインアクセントとして、商品や文字を邪魔しない位置に適切に配置してください
    7. 複数のイラストがある場合は、バランス良く配置し、チラシ全体の雰囲気を高めてください
    8. イラストは商品情報より目立たないようにしてください（装飾要素として使用）
    ` : ''}

    ${storeLogoImages.length > 0 ? `
    【★店名ロゴについて - 絶対厳守★】
    店名ロゴ画像が提供されています。以下のルールを必ず守ってください：
    1. ロゴは一切編集・加工・変形しないでください
    2. ロゴの色、フォント、デザインをそのまま忠実に再現してください
    3. ロゴのアスペクト比を維持してください
    4. ロゴは「添付画像をそのまま貼り付ける」前提で再現し、描き直し・推測・再生成は禁止
    5. 縁取り・影・ぼかし・質感追加などの装飾は禁止（元画像の透過は維持）
    6. ${logoPositionInstruction}
    7. ロゴの周りに十分な余白を確保し、他の要素と重ならないようにしてください
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
  imagesToProcess.push(...customIllustrations);
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
    // For area: provide exact pixel-like boundaries
    const x1 = Math.round(region.x);
    const y1 = Math.round(region.y);
    const x2 = Math.round(region.x + region.width);
    const y2 = Math.round(region.y + region.height);
    return `【厳密な範囲指定】画像の左から${x1}%〜${x2}%、上から${y1}%〜${y2}%の矩形範囲【この範囲内のみ編集可能、範囲外は絶対に変更禁止】`;
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

  const numEdits = regions.length;

  const editPrompt = `
【★最重要★ 画像編集タスク - ${numEdits}箇所すべてを編集してください】
あなたはプロの画像編集者です。この画像に対して、以下の【${numEdits}箇所すべて】を編集してください。

【編集指示 - 合計${numEdits}箇所】
${editInstructions}

【絶対に守るべきルール】
1. ★上記の${numEdits}箇所すべてを漏れなく編集してください - 1箇所でも漏れがあってはいけません★
2. 指定された${numEdits}箇所以外の部分は一切変更しないでください
3. 元の画像の構図、色調、スタイルを完全に維持してください
4. 編集箇所以外のテキスト、ロゴ、商品画像は絶対に変更しないでください
5. 高品質で自然な編集結果を生成してください

【チェックリスト - 出力前に確認】
${regions.map((r, i) => `□ 編集${i + 1}: ${r.prompt} → 完了したか？`).join('\n')}

【出力】
上記${numEdits}箇所すべての編集を反映した画像を出力してください。
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

// Remove all text from flyer image using Worker Batch API
export const removeTextFromImage = async (
  imageUrl: string,
  apiKey: string
): Promise<string> => {
  const removeTextPrompt = `
【★最重要★ テキスト削除タスク】
あなたはプロの画像編集者です。この画像からすべてのテキスト・文字・数字・記号を削除してください。

【削除対象】
- すべての日本語テキスト（ひらがな、カタカナ、漢字）
- すべての英字・数字
- 価格表示（¥、円など）
- 商品名、キャッチコピー、説明文
- ロゴに含まれる文字
- その他すべての読める文字

【絶対に保持するもの】
- 背景のデザイン、色、グラデーション、模様
- イラスト、キャラクター、人物
- 商品画像、写真
- 装飾的な図形、アイコン（文字を含まないもの）
- 全体の構図とレイアウト

【処理方法】
文字があった部分は、周囲の背景やデザインで自然に埋めてください。
インペインティング技術を使用し、文字を消した跡が不自然にならないようにしてください。

【出力】
テキストをすべて削除し、背景で自然に補完された高品質な画像を出力してください。
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
        editPrompt: removeTextPrompt,
        imageSize: '2K',
        aspectRatio: '3:4'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || 'Text removal failed');
    }

    const result = await response.json();

    if (result.image) {
      return result.image;
    }

    throw new Error('文字消去に失敗しました');
  } catch (error) {
    console.error("Text removal failed:", error);
    throw error;
  }
};
