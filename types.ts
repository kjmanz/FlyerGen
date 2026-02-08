export interface Product {
  id: string;
  images: string[]; // Base64 strings
  productCode: string;
  productName: string;
  specs: string;
  originalPrice: number | '';
  salePrice: number | '';
  salePriceLabel?: string;
  catchCopy: string;
  customerReviews?: string; // SNSやECサイトのお客様レビュー・口コミ
  benefits?: string; // 機種の良いところ・ベネフィット
}

export type ImageSize = '1K' | '2K' | '4K';
export type AspectRatio = '3:4' | '4:3'; // Mapping A4 Vertical/Horizontal
export type QualityCheckStatus = 'pending' | 'pass' | 'warn' | 'fail' | 'error';

export interface ImageQualityCheck {
  status: QualityCheckStatus;
  summary?: string;
  issues: string[];
  checkedAt: number;
}

export interface FlyerSettings {
  orientation: 'vertical' | 'horizontal'; // vertical -> 3:4, horizontal -> 4:3
  imageSize: ImageSize;
  patternCount: number;
  backgroundMode: 'white' | 'creative' | 'custom'; // Background mode: white, creative, or custom
  customBackground?: string; // Custom background description (when backgroundMode is 'custom')
  flyerTitle?: string; // Optional flyer title
  logoPosition: 'full-bottom' | 'right-bottom'; // New: Logo position mode
  additionalInstructions: string;
}

export interface SpecSearchResult {
  productName: string;
  specs: string;
  features?: string[];
  customerReviews?: string; // SNSやECサイトのお客様レビュー・口コミ
  benefits?: string; // 機種の良いところ・ベネフィット
}

export interface GeneratedImage {
  id: string;
  data: string; // Base64 string or URL (full resolution)
  thumbnail?: string; // Base64 string or URL (small preview for list view)
  tags?: string[]; // Auto-generated category tags (e.g., "エアコン", "テレビ")
  isFavorite?: boolean; // User-marked favorite
  createdAt: number;
  imageSize?: ImageSize;
  isUpscaled?: boolean; // Flag to indicate if image has been upscaled
  upscaleScale?: number; // Upscale multiplier (e.g., 4, 8)
  isEdited?: boolean; // Flag to indicate if image has been edited
  is4KRegenerated?: boolean; // Flag to indicate if image has been regenerated at 4K
  flyerType?: 'front' | 'back'; // 表面 or 裏面
  qualityCheck?: ImageQualityCheck;
}

// 表面用キャンペーン情報
export interface CampaignInfo {
  campaignDescription: string;  // 何のキャンペーン？（AI生成トリガー）
  headline: string;             // ヘッドライン（お客様の悩み）
  campaignName: string;         // キャンペーン名
  startDate: string;            // 開始日
  endDate: string;              // 終了日
  content: string;              // キャンペーン内容
  benefits: string[];           // 特典リスト（無制限）
  useProductImage: boolean;     // 商品画像を使用するか
  productImages: string[];      // 商品画像（Base64/URL）
}

  export interface Preset {
    id: string;
    name: string;
    side: 'front' | 'back';
    settings: FlyerSettings;
    products?: Product[];
    characterClothingMode?: 'fixed' | 'match';
    // Front side fields
    campaignInfo?: CampaignInfo;
    frontFlyerType?: FrontFlyerType;
    productServiceInfo?: ProductServiceInfo;
    // Sales letter fields
    salesLetterInfo?: SalesLetterInfo;
    salesLetterMode?: boolean;
    createdAt: number;
    updatedAt: number;
  }

// 表面チラシのタイプ
export type FrontFlyerType = 'campaign' | 'product-service';

// 掲載項目の選択状態（16項目）
export interface ContentSections {
  catchCopy: boolean;        // キャッチコピー
  specs: boolean;            // スペック・仕様
  features: boolean;         // 特徴・機能
  benefits: boolean;         // お客様へのメリット
  targetAudience: boolean;   // こんな方におすすめ
  beforeAfter: boolean;      // Before/After比較
  customerReviews: boolean;  // お客様の声
  caseStudies: boolean;      // 施工事例・実績
  warranty: boolean;         // 保証・アフターサービス
  pricing: boolean;          // 価格・料金目安
  subsidies: boolean;        // 補助金・助成金
  limitedOffer: boolean;     // 期間限定特典
  energySaving: boolean;     // 省エネ性能
  ecoContribution: boolean;  // 環境貢献
  faq: boolean;              // よくある質問
  cta: boolean;              // お問い合わせ・来店誘導
}

// 商品・サービス紹介情報
export interface ProductServiceInfo {
  title: string;                    // 紹介タイトル（例: エコキュート）
  catchCopy: string;                // キャッチコピー
  specs: string;                    // スペック・仕様
  features: string[];               // 特徴・機能リスト
  benefits: string[];               // メリットリスト
  targetAudience: string[];         // こんな方におすすめ
  beforeAfter: string;              // Before/After比較
  customerReviews: string[];        // お客様の声
  caseStudies: string;              // 施工事例
  warranty: string;                 // 保証情報
  pricing: string;                  // 価格情報
  subsidies: string;                // 補助金情報
  limitedOffer: string;             // 期間限定特典
  energySaving: string;             // 省エネ性能
  ecoContribution: string;          // 環境貢献
  faq: { q: string; a: string }[];  // Q&A
  cta: string;                      // CTA
  productImages: string[];          // 商品画像
  sections: ContentSections;        // 掲載項目の選択
}

// レビュー検索結果
export interface ReviewSearchResult {
  merits: string[];           // よく挙げられるメリット
  satisfactionPoints: string[]; // 満足ポイント
  purchaseReasons: string[];  // 導入のきっかけ
  concerns: string[];         // 気になる点・注意点
}

// セールスレター フレームワーク選択
export type SalesFramework = 'aida' | 'pasona';

// セールスレター情報
export interface SalesLetterInfo {
  framework: SalesFramework;
  productName: string;

  // 共通フィールド
  headline: string;           // キャッチコピー（Attention / Problem）
  problems: string[];         // 問題提起（Interest / Problem の詳細）
  benefits: string[];         // ベネフィット（Desire の一部 / Solution の一部）
  cta: string;                // 行動喚起（Action）

  // PASONA専用フィールド
  affinity: string;           // 共感・寄り添い（Affinity）★PASONAの重要ポイント
  solution: string;           // 解決策の提示（Solution）
  offer: string;              // 提案・特典（Offer）
  narrowing: string;          // 絞り込み・限定性（Narrowing）

  // AIDA専用フィールド
  desire: string;             // 欲求喚起・ベネフィット詳細（Desire）

  // 証拠・信頼性（共通）
  socialProof: {
    experience: string;       // 実績年数
    cases: string;            // 施工件数
    customerVoices: string[]; // お客様の声
  };
}
