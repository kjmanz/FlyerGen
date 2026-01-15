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
}

export type ImageSize = '1K' | '2K' | '4K';
export type AspectRatio = '3:4' | '4:3'; // Mapping A4 Vertical/Horizontal

export interface FlyerSettings {
  orientation: 'vertical' | 'horizontal'; // vertical -> 3:4, horizontal -> 4:3
  imageSize: ImageSize;
  patternCount: number;
  backgroundMode: 'white' | 'creative'; // New: Background mode
  additionalInstructions: string;
}

export interface SpecSearchResult {
  productName: string;
  specs: string;
  features?: string[];
}

export interface GeneratedImage {
  id: string;
  data: string; // Base64 string
  createdAt: number;
}

export interface Preset {
  id: string;
  name: string;
  products: Product[];
  characterImages: string[];
  characterClothingMode?: 'fixed' | 'match';
  referenceImages: string[];
  storeLogoImages: string[];
  settings: FlyerSettings;
  createdAt: number;
  updatedAt: number;
}