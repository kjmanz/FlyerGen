import { GoogleGenAI, Type } from "@google/genai";
import { Product, FlyerSettings, SpecSearchResult, CampaignInfo, ProductServiceInfo, ContentSections, ReviewSearchResult, SalesLetterInfo, SalesFramework } from "../types";

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
    - ${priceLabel}: ${salePriceStr} (赤字で大きく強調！金額の場合はカンマ区切りで表示。【重要】税込表記は必ず価格の後ろに配置すること。「228,000円（税込）」が正しく、「（税込）228,000円」は絶対NG)
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
    【★★★ 店名ロゴについて - 絶対厳守事項 ★★★】
    店名ロゴ画像が提供されています。以下のルールは絶対に違反してはいけません：

    ⚠️ 重要：ロゴは企業・店舗のブランドアイデンティティです。一切の変更・省略・改変は禁止です ⚠️

    【絶対厳守ルール】
    1. ロゴは一切編集・加工・変形してはいけません（これは厳命です）
    2. ロゴの一部を省略したり、簡略化したりすることは絶対に禁止です
    3. ロゴの色を変更してはいけません - 元の色を100%忠実に再現してください
    4. ロゴのフォント・書体を変更してはいけません - 完全にそのまま使用してください
    5. ロゴのデザイン要素（形状、配置、サイズ比率）を一切変更してはいけません
    6. ロゴのアスペクト比は厳密に維持してください - 縦横比を変えることは禁止です
    7. ロゴは「添付画像をそのまま完全にコピーして貼り付ける」という前提で扱ってください
    8. ロゴを描き直したり、推測で再生成したり、類似のものを作成することは絶対に禁止です
    9. 縁取り・影・ぼかし・グラデーション・質感追加などのいかなる装飾も追加してはいけません
       （ただし、元画像に含まれる透過・影・効果は完全に維持してください）
    10. ${logoPositionInstruction}
    11. ロゴの周りに十分な余白を確保し、他の要素と重ならないようにしてください
    12. ロゴの鮮明さ・解像度は維持し、ぼやけたり不鮮明になってはいけません

    ⚠️ 再度強調：ロゴは省略せず、改変せず、完全に忠実にそのまま使用してください ⚠️
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

// Generate campaign headline and name from description using Gemini
export const generateCampaignContent = async (
  campaignDescription: string,
  apiKey: string
): Promise<{ headline: string; campaignName: string }> => {
  const ai = getClient(apiKey);

  const prompt = `
あなたは日本の家電量販店のマーケティング専門家です。
以下のキャンペーン説明から、魅力的なヘッドライン（お客様の悩み訴求）とキャンペーン名を生成してください。

【キャンペーン説明】
${campaignDescription}

【出力ルール】
1. headline: お客様の悩みや課題を問いかける形式で作成（例: 「まだ10年前のエアコン使っていませんか？」）
   - 疑問形または課題提起の形式
   - お客様が「自分のことだ」と感じる表現
   - 30文字以内

2. campaignName: イベント名・フェア名として使える名称（例: 「夏の省エネ家電 買い替え応援フェア」）
   - 季節感や緊急性を含める
   - 25文字以内
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
            headline: { type: Type.STRING },
            campaignName: { type: Type.STRING }
          },
          required: ["headline", "campaignName"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("AIからの応答がありません。");
    }
    return JSON.parse(text) as { headline: string; campaignName: string };

  } catch (error) {
    console.error("Campaign content generation failed:", error);
    throw error;
  }
};

// Generate front flyer image (campaign-focused)
export const generateFrontFlyerImage = async (
  campaignInfo: CampaignInfo,
  settings: FlyerSettings,
  staffImages: string[],        // 店側スタッフ（キャラクター画像）
  customerImages: string[],     // お客様画像
  storeLogoImages: string[],
  customIllustrations: string[],
  referenceImages: string[],
  apiKey: string
): Promise<string[]> => {
  // Background instruction logic
  let backgroundInstruction: string;
  if (settings.backgroundMode === 'white') {
    backgroundInstruction = "【最重要：背景は絶対に純白】背景色は必ず「純白（RGB: 255,255,255 / #FFFFFF）」のみを使用してください。";
  } else if (settings.backgroundMode === 'custom' && settings.customBackground) {
    backgroundInstruction = `【背景について - カスタム指定】以下の指定に沿った背景を作成してください：\n${settings.customBackground}`;
  } else {
    backgroundInstruction = "【背景について】背景はキャンペーンの魅力を引き立てる、明るく親しみやすいデザインにしてください。";
  }

  // Format benefits list
  const benefitsList = campaignInfo.benefits.filter(b => b.trim()).map((b, i) => `  ${i + 1}. ${b}`).join('\n');

  // Format campaign period
  const periodStr = campaignInfo.startDate && campaignInfo.endDate
    ? `${campaignInfo.startDate} 〜 ${campaignInfo.endDate}`
    : (campaignInfo.startDate || campaignInfo.endDate || '期間限定');

  // Logo position instruction
  const logoPositionInstruction = settings.logoPosition === 'full-bottom'
    ? '【店名ロゴの配置】チラシの最下部に左右いっぱいに横長で配置してください。'
    : '【店名ロゴの配置】チラシの最下部の右側半分に配置してください。';

  let prompt = `
【役割】
あなたは日本の家電量販店のプロのチラシデザイナーです。

【タスク】
キャンペーン訴求用の「表面チラシ」を作成してください。お客様の目を引き、キャンペーンへの興味を喚起するデザインにしてください。

【出力仕様】
- レイアウト: ${settings.orientation === 'vertical' ? 'A4縦 (210mm × 297mm)' : 'A4横 (297mm × 210mm)'}
- 出力解像度: ${settings.imageSize}
- 言語: 日本語
- 雰囲気: 地域密着の信頼できる「街の電気屋さん」。元気で親しみやすく、信頼感のあるデザイン。
- ${backgroundInstruction}

【★キャンペーン情報★】
■ ヘッドライン（大きく目立たせる）:
「${campaignInfo.headline}」

■ キャンペーン名:
「${campaignInfo.campaignName}」

■ キャンペーン期間:
${periodStr}

■ キャンペーン内容:
${campaignInfo.content || 'お得なキャンペーン実施中！'}

${benefitsList ? `■ 特典リスト:\n${benefitsList}` : ''}

【デザイン指示】
1. ヘッドラインは画像の上部1/3に大きく配置し、お客様の悩みに共感を促す
2. キャンペーン名はヘッドラインの下に目立つように配置
3. キャンペーン期間は分かりやすい場所に配置（リボンやバッジ装飾推奨）
4. 特典は箇条書きまたはアイコン付きで見やすく配置
5. ${staffImages.length > 0 ? '店員スタッフ画像を笑顔で親しみやすく配置（右下または左下推奨）' : ''}
6. ${customerImages.length > 0 ? 'お客様画像は「悩んでいる様子」または「喜んでいる様子」として配置（ヘッドライン近くに配置推奨）' : ''}

【画像の使用について】
提供された画像は以下の順序で添付されています：
1. 店員スタッフ画像（チラシ内で店員として配置）
2. お客様画像（チラシ内でお客様として配置）
3. 参考チラシ画像${referenceImages.length > 0 ? '（★重要★デザインを参考に）' : ''}
4. 使用イラスト（チラシ内に配置して装飾に活用）
5. 店名ロゴ画像
${campaignInfo.useProductImage && campaignInfo.productImage ? '6. メイン商品画像（目立つ位置に配置）' : ''}

${storeLogoImages.length > 0 ? `
【★★★ 店名ロゴについて - 絶対厳守事項 ★★★】
店名ロゴ画像が提供されています。以下のルールは絶対に違反してはいけません：
1. ロゴは一切編集・加工・変形してはいけません
2. ロゴの色、フォント、デザインを変更してはいけません
3. ${logoPositionInstruction}
` : `
【重要：店名・連絡先について】
店名ロゴが提供されていません。以下のルールを必ず守ってください：
1. 店舗名、会社名を一切掲載しないでください
2. 電話番号、住所、連絡先を一切掲載しないでください
3. 架空の店舗名や連絡先を作成しないでください
4. チラシ下部には店舗情報を入れず、キャンペーン情報のみを掲載してください
`}

${customIllustrations.length > 0 ? `
【使用イラストについて】
使用イラスト画像が提供されています：
1. イラストは一切編集・加工しないでください
2. チラシ内のデザインアクセントとして適切に配置してください
` : ''}

${referenceImages.length > 0 ? `
【★参考デザインの模倣指示★】
参考チラシ画像が提供されています。レイアウト、色使い、タイポグラフィ、装飾要素を参考にしてください。
` : ''}
`;

  if (settings.additionalInstructions) {
    prompt += `\n【追加指示】\n${settings.additionalInstructions}`;
  }

  // Prepare content parts
  const parts: any[] = [{ text: prompt }];

  const processImage = async (imgData: string) => {
    let base64Data = imgData;

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
  imagesToProcess.push(...staffImages);
  imagesToProcess.push(...customerImages);
  imagesToProcess.push(...referenceImages);
  imagesToProcess.push(...customIllustrations);
  imagesToProcess.push(...storeLogoImages);
  if (campaignInfo.useProductImage && campaignInfo.productImage) {
    imagesToProcess.push(campaignInfo.productImage);
  }

  // Process all images concurrently
  const processedImages = await Promise.all(imagesToProcess.map(processImage));
  processedImages.forEach(img => {
    if (img) parts.push(img);
  });

  // Determine aspect ratio
  const aspectRatio = settings.orientation === 'vertical' ? '3:4' : '4:3';

  // Create batch requests
  const batchRequests = Array.from({ length: settings.patternCount }).map(() => ({
    contents: { parts }
  }));

  console.log(`Sending ${batchRequests.length} front flyer request(s) to API...`);

  // API endpoint
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/batch-generate';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    if (errorData.details && Array.isArray(errorData.details)) {
      errorMessage += '\nDetails:\n' + errorData.details.map((d: any) => d.error || JSON.stringify(d)).join('\n');
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  if (!result.images || result.images.length === 0) {
    throw new Error("画像の生成に失敗しました。");
  }

  console.log(`Received ${result.images.length} front flyer image(s) from Batch API`);
  return result.images;
};

// Generate product/service content from title using AI
export const generateProductServiceContent = async (
  title: string,
  apiKey: string
): Promise<Partial<ProductServiceInfo>> => {
  const ai = getClient(apiKey);

  const prompt = `
あなたは日本の家電量販店のマーケティング専門家です。
以下の商品・サービスについて、チラシ用のコンテンツを生成してください。

【商品・サービス】
${title}

【生成項目】
1. catchCopy: 目を引くキャッチコピー（30文字以内）
2. specs: スペック・仕様の要約（100文字以内）
3. features: 特徴・機能リスト（5つ、各30文字以内）
4. benefits: お客様へのメリットリスト（5つ、各30文字以内）
5. targetAudience: おすすめの方リスト（3つ、各20文字以内）
6. energySaving: 省エネ性能（50文字以内）
7. ecoContribution: 環境貢献（50文字以内）

家電量販店のお客様向けに、分かりやすく魅力的な表現を使ってください。
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
            catchCopy: { type: Type.STRING },
            specs: { type: Type.STRING },
            features: { type: Type.ARRAY, items: { type: Type.STRING } },
            benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
            targetAudience: { type: Type.ARRAY, items: { type: Type.STRING } },
            energySaving: { type: Type.STRING },
            ecoContribution: { type: Type.STRING }
          },
          required: ["catchCopy", "features", "benefits"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("AIからの応答がありません。");
    }
    return JSON.parse(text) as Partial<ProductServiceInfo>;

  } catch (error) {
    console.error("Product service content generation failed:", error);
    throw error;
  }
};

// Search for product reviews using Google Search Grounding
export const searchProductReviews = async (
  title: string,
  apiKey: string
): Promise<ReviewSearchResult> => {
  const ai = getClient(apiKey);

  const prompt = `
以下の商品・サービスについて、お客様のレビューや口コミをインターネットで検索し、まとめてください。

【検索対象】
${title} レビュー 口コミ 評判 メリット デメリット

【出力形式】
1. merits: よく挙げられるメリット（5つ、各30文字以内）
2. satisfactionPoints: 満足ポイント（3つ、各30文字以内）
3. purchaseReasons: 導入・購入のきっかけ（3つ、各30文字以内）
4. concerns: 気になる点・注意点（3つ、各30文字以内）

実際のユーザーの声を参考に、具体的で信頼性のある情報をまとめてください。
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
            merits: { type: Type.ARRAY, items: { type: Type.STRING } },
            satisfactionPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            purchaseReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
            concerns: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["merits", "satisfactionPoints", "purchaseReasons"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("検索結果がありません。");
    }
    return JSON.parse(text) as ReviewSearchResult;

  } catch (error) {
    console.error("Review search failed:", error);
    throw error;
  }
};

// Generate product/service introduction flyer image
export const generateProductServiceFlyer = async (
  info: ProductServiceInfo,
  settings: FlyerSettings,
  staffImages: string[],
  customerImages: string[],
  storeLogoImages: string[],
  customIllustrations: string[],
  referenceImages: string[],
  apiKey: string
): Promise<string[]> => {
  // Background instruction logic
  let backgroundInstruction: string;
  if (settings.backgroundMode === 'white') {
    backgroundInstruction = "【最重要：背景は絶対に純白】背景色は必ず「純白（RGB: 255,255,255 / #FFFFFF）」のみを使用してください。";
  } else if (settings.backgroundMode === 'custom' && settings.customBackground) {
    backgroundInstruction = `【背景について - カスタム指定】以下の指定に沿った背景を作成してください：\n${settings.customBackground}`;
  } else {
    backgroundInstruction = "【背景について】商品・サービスの魅力を引き立てる、明るく親しみやすいデザインにしてください。";
  }

  // Logo position instruction
  const logoPositionInstruction = settings.logoPosition === 'full-bottom'
    ? '【店名ロゴの配置】チラシの最下部に左右いっぱいに横長で配置してください。'
    : '【店名ロゴの配置】チラシの最下部の右側半分に配置してください。';

  // Build content sections based on enabled flags
  const sections = info.sections;
  let contentBlock = "";

  if (sections.catchCopy && info.catchCopy) {
    contentBlock += `\n■ キャッチコピー（大きく目立たせる）:\n「${info.catchCopy}」\n`;
  }
  if (sections.specs && info.specs) {
    contentBlock += `\n■ スペック・仕様:\n${info.specs}\n`;
  }
  if (sections.features && info.features.length > 0) {
    contentBlock += `\n■ 特徴・機能:\n${info.features.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }
  if (sections.benefits && info.benefits.length > 0) {
    contentBlock += `\n■ お客様へのメリット:\n${info.benefits.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n`;
  }
  if (sections.targetAudience && info.targetAudience.length > 0) {
    contentBlock += `\n■ こんな方におすすめ:\n${info.targetAudience.map(t => `・${t}`).join('\n')}\n`;
  }
  if (sections.beforeAfter && info.beforeAfter) {
    contentBlock += `\n■ Before/After:\n${info.beforeAfter}\n`;
  }
  if (sections.customerReviews && info.customerReviews.length > 0) {
    contentBlock += `\n■ お客様の声:\n${info.customerReviews.map(r => `「${r}」`).join('\n')}\n`;
  }
  if (sections.caseStudies && info.caseStudies) {
    contentBlock += `\n■ 施工事例・実績:\n${info.caseStudies}\n`;
  }
  if (sections.warranty && info.warranty) {
    contentBlock += `\n■ 保証・アフターサービス:\n${info.warranty}\n`;
  }
  if (sections.pricing && info.pricing) {
    contentBlock += `\n■ 価格・料金目安:\n${info.pricing}\n`;
  }
  if (sections.subsidies && info.subsidies) {
    contentBlock += `\n■ 補助金・助成金情報:\n${info.subsidies}\n`;
  }
  if (sections.limitedOffer && info.limitedOffer) {
    contentBlock += `\n■ 期間限定特典:\n${info.limitedOffer}\n`;
  }
  if (sections.energySaving && info.energySaving) {
    contentBlock += `\n■ 省エネ性能:\n${info.energySaving}\n`;
  }
  if (sections.ecoContribution && info.ecoContribution) {
    contentBlock += `\n■ 環境貢献:\n${info.ecoContribution}\n`;
  }
  if (sections.faq && info.faq.length > 0) {
    contentBlock += `\n■ よくある質問:\n${info.faq.map(qa => `Q: ${qa.q}\nA: ${qa.a}`).join('\n\n')}\n`;
  }
  if (sections.cta && info.cta) {
    contentBlock += `\n■ お問い合わせ:\n${info.cta}\n`;
  }

  let prompt = `
【役割】
あなたは日本の家電量販店のプロのチラシデザイナーです。

【タスク】
商品・サービス紹介用の「表面チラシ」を作成してください。商品やサービスの魅力を最大限に伝え、お客様の興味を引くデザインにしてください。

【出力仕様】
- レイアウト: ${settings.orientation === 'vertical' ? 'A4縦 (210mm × 297mm)' : 'A4横 (297mm × 210mm)'}
- 出力解像度: ${settings.imageSize}
- 言語: 日本語
- 雰囲気: 地域密着の信頼できる「街の電気屋さん」。親しみやすく、信頼感のあるデザイン。
- ${backgroundInstruction}

【★紹介する商品・サービス★】
${info.title}

【掲載内容】
${contentBlock}

【デザイン指示】
1. タイトル「${info.title}」は画像の上部に大きく配置
2. キャッチコピーは目立つ位置に強調表示
3. 特徴・メリットは読みやすくリスト形式で配置
4. ${staffImages.length > 0 ? '店員スタッフ画像を笑顔で親しみやすく配置' : ''}
5. ${customerImages.length > 0 ? 'お客様画像を適切に配置' : ''}
6. 商品画像があれば中央に大きく配置

【画像の使用について】
提供された画像は以下の順序で添付されています：
1. 商品画像
2. 店員スタッフ画像
3. お客様画像
4. 参考チラシ画像${referenceImages.length > 0 ? '（★デザインを参考に）' : ''}
5. 使用イラスト
6. 店名ロゴ画像

${storeLogoImages.length > 0 ? `
【★★★ 店名ロゴについて - 絶対厳守事項 ★★★】
店名ロゴ画像が提供されています。以下のルールは絶対に違反してはいけません：
1. ロゴは一切編集・加工・変形してはいけません
2. ロゴの色、フォント、デザインを変更してはいけません
3. ${logoPositionInstruction}
` : `
【重要：店名・連絡先について】
店名ロゴが提供されていません。以下のルールを必ず守ってください：
1. 店舗名、会社名を一切掲載しないでください
2. 電話番号、住所、連絡先を一切掲載しないでください
3. 架空の店舗名や連絡先を作成しないでください
4. チラシ下部には店舗情報を入れず、商品・サービス情報のみを掲載してください
`}

${customIllustrations.length > 0 ? `
【使用イラストについて】
使用イラスト画像が提供されています：
1. イラストは一切編集・加工しないでください
2. チラシ内のデザインアクセントとして適切に配置してください
` : ''}

${referenceImages.length > 0 ? `
【★参考デザインの模倣指示★】
参考チラシ画像が提供されています。レイアウト、色使い、タイポグラフィ、装飾要素を参考にしてください。
` : ''}
`;

  if (settings.additionalInstructions) {
    prompt += `\n【追加指示】\n${settings.additionalInstructions}`;
  }

  // Prepare content parts
  const parts: any[] = [{ text: prompt }];

  const processImage = async (imgData: string) => {
    let base64Data = imgData;

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
  imagesToProcess.push(...info.productImages);
  imagesToProcess.push(...staffImages);
  imagesToProcess.push(...customerImages);
  imagesToProcess.push(...referenceImages);
  imagesToProcess.push(...customIllustrations);
  imagesToProcess.push(...storeLogoImages);

  // Process all images concurrently
  const processedImages = await Promise.all(imagesToProcess.map(processImage));
  processedImages.forEach(img => {
    if (img) parts.push(img);
  });

  // Determine aspect ratio
  const aspectRatio = settings.orientation === 'vertical' ? '3:4' : '4:3';

  // Create batch requests
  const batchRequests = Array.from({ length: settings.patternCount }).map(() => ({
    contents: { parts }
  }));

  console.log(`Sending ${batchRequests.length} product service flyer request(s) to API...`);

  // API endpoint
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/batch-generate';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    if (errorData.details && Array.isArray(errorData.details)) {
      errorMessage += '\nDetails:\n' + errorData.details.map((d: any) => d.error || JSON.stringify(d)).join('\n');
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  if (!result.images || result.images.length === 0) {
    throw new Error("画像の生成に失敗しました。");
  }

  console.log(`Received ${result.images.length} product service flyer image(s) from Batch API`);
  return result.images;
};

// セールスレター用フィールド別AI検索（具体的な数値を含む）
export const searchSalesFieldData = async (
  productName: string,
  fieldType: 'problems' | 'benefits' | 'affinity' | 'solution' | 'offer' | 'desire' | 'socialProof',
  apiKey: string
): Promise<{
  suggestions: string[];
  specificData?: { value: string; unit: string; context: string }[];
}> => {
  const ai = getClient(apiKey);

  const fieldPrompts: Record<string, string> = {
    problems: `
「${productName}」を検討するお客様が抱える悩み・問題点を5つ調査してください。
具体的な生活シーンや状況を含めて、共感できる表現で記述してください。
例：「夏の電気代が気になる」「古いエアコンの効きが悪い」
`,
    benefits: `
「${productName}」を導入することで得られるメリット・ベネフィットを5つ調査してください。
【重要】具体的な数値を必ず含めてください（年間○○円節約、○○%削減、○○分で完了など）。
例：「年間約24,000円の電気代削減」「室温を10分で快適温度に」
`,
    affinity: `
「${productName}」に悩むお客様への共感・寄り添いのメッセージを生成してください。
「私も同じでした」「多くのお客様が同じ悩みを抱えています」のような、理解者としてのポジションを示す内容を3パターン作成してください。
`,
    solution: `
「${productName}」がお客様の悩みをどう解決するか、分かりやすく説明する文章を生成してください。
機能だけでなく、お客様の生活がどう変わるかを具体的に描写してください。
`,
    offer: `
「${productName}」を販売する際のオファー（特典・提案）のアイデアを5つ提案してください。
価格、特典、保証、期間限定などのアイデアを含めてください。
例：「今なら工事費込み」「10年保証付き」「先着○名様限定」
`,
    desire: `
「${productName}」を使った後の「得られる未来」を具体的に描写してください。
お客様の欲求を刺激する、魅力的な未来像を3パターン作成してください。
`,
    socialProof: `
「${productName}」の信頼性を示す情報を調査してください：
1. 導入実績の傾向（年間○○件など）
2. お客様の声の例（3つ）
3. 一般的な保証内容
4. 業界での評価
`
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: fieldPrompts[fieldType] }] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseModalities: ["TEXT"],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            specificData: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  context: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    console.error("Field search error:", e);
    return { suggestions: [] };
  }
};

// セールスレター用一括AI検索（商品名から全フィールドを自動生成）
export const searchAllSalesFields = async (
  productName: string,
  framework: 'aida' | 'pasona',
  apiKey: string
): Promise<{
  headline: string;
  problems: string[];
  benefits: string[];
  affinity: string;
  solution: string;
  offer: string;
  narrowing: string;
  desire: string;
  cta: string;
  socialProof: {
    experience: string;
    cases: string;
    customerVoices: string[];
  };
}> => {
  const ai = getClient(apiKey);

  const frameworkPrompt = framework === 'pasona' ? `
【新PASONAフレームワーク】で「${productName}」のセールスレター素材を生成してください。

P（Problem）問題提起: お客様が抱える悩みを端的に表現するヘッドラインを1つ
問題点の詳細: 具体的な悩み・問題を5つ（生活シーン付き）
A（Affinity）共感: 「私も同じでした」「多くのお客様が同じ悩みを抱えています」などの寄り添いメッセージ
S（Solution）解決策: この商品でどう解決するかを具体的に（お客様の生活がどう変わるか）
O（Offer）提案・特典: 価格、特典、保証などのオファーアイデア
N（Narrowing）絞り込み: 「先着○名様」「今月限定」などの限定性
A（Action）行動喚起: 「今すぐお電話」などのCTA

ベネフィット: 具体的な数値入りのメリット5つ（年間○○円節約、○○%削減など）
証拠・信頼性: 実績年数、施工件数、お客様の声3つ
` : `
【AIDAフレームワーク】で「${productName}」のセールスレター素材を生成してください。

A（Attention）注意喚起: お客様の目を引くキャッチコピーを1つ
I（Interest）興味喚起: 具体的な悩み・問題を5つ（生活シーン付き）
D（Desire）欲求喚起: 商品を使った後の魅力的な未来像
A（Action）行動喚起: 「今すぐお電話」などのCTA

ベネフィット: 具体的な数値入りのメリット5つ（年間○○円節約、○○%削減など）
証拠・信頼性: 実績年数、施工件数、お客様の声3つ
`;

  const prompt = `
あなたは日本の住宅設備・リフォーム業界のマーケティング専門家です。
インターネットで「${productName}」について調査し、実際のデータに基づいて以下の情報を生成してください。

${frameworkPrompt}

【重要】
- 具体的な数値データを必ず含めてください
- 日本の消費者に響く表現を使ってください
- 信頼性のある情報を心がけてください
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseModalities: ["TEXT"],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            problems: { type: Type.ARRAY, items: { type: Type.STRING } },
            benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
            affinity: { type: Type.STRING },
            solution: { type: Type.STRING },
            offer: { type: Type.STRING },
            narrowing: { type: Type.STRING },
            desire: { type: Type.STRING },
            cta: { type: Type.STRING },
            socialProof: {
              type: Type.OBJECT,
              properties: {
                experience: { type: Type.STRING },
                cases: { type: Type.STRING },
                customerVoices: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          required: ['headline', 'problems', 'benefits', 'cta', 'socialProof']
        }
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);

    // デフォルト値を設定
    return {
      headline: result.headline || '',
      problems: result.problems || [],
      benefits: result.benefits || [],
      affinity: result.affinity || '',
      solution: result.solution || '',
      offer: result.offer || '',
      narrowing: result.narrowing || '',
      desire: result.desire || '',
      cta: result.cta || '',
      socialProof: {
        experience: result.socialProof?.experience || '',
        cases: result.socialProof?.cases || '',
        customerVoices: result.socialProof?.customerVoices || []
      }
    };
  } catch (e) {
    console.error("All fields search error:", e);
    throw e;
  }
};

// セールスレター用チラシ画像生成
export const generateSalesLetterFlyer = async (
  salesLetterInfo: SalesLetterInfo,
  settings: FlyerSettings,
  staffImages: string[],
  customerImages: string[],
  storeLogoImages: string[],
  customIllustrations: string[],
  referenceImages: string[],
  apiKey: string
): Promise<string[]> => {
  // Background instruction
  let backgroundInstruction: string;
  if (settings.backgroundMode === 'white') {
    backgroundInstruction = "【背景】純白（#FFFFFF）のみ使用";
  } else if (settings.backgroundMode === 'custom' && settings.customBackground) {
    backgroundInstruction = `【背景】${settings.customBackground}`;
  } else {
    backgroundInstruction = "【背景】商品の魅力を引き立てる、信頼感のあるデザイン";
  }

  // Logo instruction
  const logoPositionInstruction = settings.logoPosition === 'full-bottom'
    ? 'チラシ最下部に左右いっぱいに横長で配置'
    : 'チラシ最下部の右側半分に配置';

  // Framework-specific layout
  const frameworkInstruction = salesLetterInfo.framework === 'pasona' ? `
【構成：新PASONAの法則】
1. P（Problem）: 問題提起 - 上部に大きく配置
   「${salesLetterInfo.headline}」
   
2. A（Affinity）: 共感・寄り添い - ヘッドライン直下
   「${salesLetterInfo.affinity}」
   ※ 売り手でなく理解者として語る。ストーリー調が効果的。
   
3. S（Solution）: 解決策 - 中央部
   「${salesLetterInfo.solution}」
   商品画像と共に配置。お客様の声も含めると効果的。
   
4. O（Offer）: 提案 - 中下部
   「${salesLetterInfo.offer}」
   価格、特典、保証などを明確に。
   
5. N（Narrowing）: 絞り込み - 下部
   「${salesLetterInfo.narrowing}」
   限定性で行動を促す。
   
6. A（Action）: 行動喚起 - 最下部
   「${salesLetterInfo.cta}」
` : `
【構成：AIDAの法則】
1. A（Attention）: 注意喚起 - 上部に大きく配置
   「${salesLetterInfo.headline}」
   
2. I（Interest）: 興味喚起 - ヘッドライン直下
   問題提起: ${salesLetterInfo.problems.join('、 ')}
   
3. D（Desire）: 欲求喚起 - 中央部
   「${salesLetterInfo.desire}」
   ベネフィット: ${salesLetterInfo.benefits.join('、 ')}
   
4. A（Action）: 行動喚起 - 最下部
   「${salesLetterInfo.cta}」
`;

  // Social proof section
  const socialProofSection = `
【証拠・信頼性】
${salesLetterInfo.socialProof.experience ? `・実績: ${salesLetterInfo.socialProof.experience}` : ''}
${salesLetterInfo.socialProof.cases ? `・施工件数: ${salesLetterInfo.socialProof.cases}` : ''}
${salesLetterInfo.socialProof.customerVoices.length > 0 ? `・お客様の声:\n  ${salesLetterInfo.socialProof.customerVoices.map(v => `「${v}」`).join('\n  ')}` : ''}
`;

  const prompt = `
【役割】
あなたは日本の家電量販店のプロのチラシデザイナーです。

【タスク】
セールスレター形式の効果的な「表面チラシ」を作成してください。

【出力仕様】
- レイアウト: ${settings.orientation === 'vertical' ? 'A4縦' : 'A4横'}
- 解像度: ${settings.imageSize}
- 言語: 日本語
- ${backgroundInstruction}

【紹介商品】
${salesLetterInfo.productName}

${frameworkInstruction}

${socialProofSection}

【画像の使用順序】
1. 商品画像
2. 店員スタッフ画像
3. お客様画像
4. 参考チラシ画像
5. 使用イラスト
6. 店名ロゴ画像

${storeLogoImages.length > 0 ? `
【店名ロゴ】
提供されたロゴを${logoPositionInstruction}。編集・加工禁止。
` : `
【重要：店名・連絡先について】
店名ロゴが提供されていません。店舗名、電話番号、住所を一切掲載しないでください。
`}

${referenceImages.length > 0 ? '【参考チラシ】提供された参考画像のデザインを参考にしてください。' : ''}
`;

  if (settings.additionalInstructions) {
    // Add additional instructions if any
  }

  // Prepare content parts
  const parts: any[] = [{ text: prompt }];

  const processImage = async (imgData: string) => {
    let base64Data = imgData;
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
    return { inlineData: { mimeType: 'image/png', data: cleanBase64 } };
  };

  // Add images in order
  const productImages: string[] = []; // From salesLetterInfo if needed
  for (const img of [...productImages, ...staffImages, ...customerImages, ...referenceImages, ...customIllustrations, ...storeLogoImages]) {
    const processed = await processImage(img);
    if (processed) parts.push(processed);
  }

  const ai = getClient(apiKey);
  const result = await ai.models.generateImages({
    model: "imagen-3.0-generate-002",
    prompt: prompt,
    config: {
      numberOfImages: settings.patternCount,
      aspectRatio: settings.orientation === 'vertical' ? "3:4" : "4:3"
    }
  });

  if (!result.images || result.images.length === 0) {
    throw new Error("画像の生成に失敗しました。");
  }

  console.log(`Generated ${result.images.length} sales letter flyer image(s)`);
  return result.images.map(img => `data:image/png;base64,${img.image?.bytesBase64Encoded}`);
};
