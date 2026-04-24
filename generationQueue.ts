import type {
  CampaignInfo,
  FlyerSettings,
  FrontFlyerType,
  Product,
  ProductServiceInfo,
  SalesLetterInfo,
} from './types';

export type GenerationJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export type GenerationJobSnapshot = {
  apiKey: string;
  flyerSide: 'front' | 'back';
  frontFlyerType: FrontFlyerType;
  salesLetterMode: boolean;
  settings: FlyerSettings;
  products: Product[];
  characterClothingMode: 'fixed' | 'match';
  salesLetterInfo: SalesLetterInfo;
  productServiceInfo: ProductServiceInfo;
  campaignInfo: CampaignInfo;
  selectedCharacterImages: string[];
  selectedReferenceImages: string[];
  selectedStoreLogoImages: string[];
  selectedCustomIllustrations: string[];
  selectedCustomerImages: string[];
  selectedProductImages: string[];
};

export type GenerationJob = {
  id: string;
  status: GenerationJobStatus;
  createdAt: number;
  updatedAt: number;
  progress: number;
  message: string;
  side: 'front' | 'back';
  snapshot: GenerationJobSnapshot;
  error?: string;
};

export function getGenerationJobStatusConfig(status: GenerationJobStatus): {
  label: string;
  className: string;
} {
  if (status === 'pending') return { label: '待機中', className: 'bg-slate-100 text-slate-700' };
  if (status === 'running') return { label: '実行中', className: 'bg-sky-100 text-sky-700' };
  if (status === 'completed') return { label: '完了', className: 'bg-emerald-100 text-emerald-700' };
  if (status === 'failed') return { label: '失敗', className: 'bg-rose-100 text-rose-700' };
  return { label: 'キャンセル', className: 'bg-amber-100 text-amber-700' };
}
