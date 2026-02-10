import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { get, set } from 'idb-keyval';
import { Product, FlyerSettings, GeneratedImage, Preset, CampaignInfo, FrontFlyerType, ProductServiceInfo, SalesLetterInfo, type BrandRules, type ImageQualityCheck } from './types';
import { ImageUploader } from './components/ImageUploader';
import type { EditRegion } from './components/ImageEditModal';
import { MainTabs, MainTabType } from './components/MainTabs';
import { Sidebar } from './components/Sidebar';
import { CompactAssetSection } from './components/CompactAssetSection';
import { AssetSelectionGrid } from './components/AssetSelectionGrid';
import { upscaleImage } from './services/upscaleService';
import {
  initFirebase,
  uploadImage,
  getCloudImages,
  saveCloudPreset,
  getCloudPresets,
  deleteCloudPreset,
  deleteCloudImage,
  saveFlyerMetadata,
  updateFlyerUpscaleStatus,
  updateFlyerQualityCheck,
  updateFlyerTags,
  updateFlyerFavorite,
  saveReferenceImages,
  getReferenceImages,
  saveCharacterImages,
  getCharacterImages,
  saveStoreLogoImages,
  getStoreLogoImages,
  saveCustomIllustrations,
  getCustomIllustrations,
  saveCustomerImages,
  getCustomerImages,
  saveFrontProductImages,
  getFrontProductImages,
  saveCampaignMainImages,
  getCampaignMainImages,
  type CloudImage,
  type CloudPreset
} from './services/firebaseService';

const ProductCard = React.lazy(() =>
  import('./components/ProductCard').then((module) => ({ default: module.ProductCard }))
);

const ImageEditModal = React.lazy(() =>
  import('./components/ImageEditModal').then((module) => ({ default: module.ImageEditModal }))
);

const ProductServiceForm = React.lazy(() =>
  import('./components/ProductServiceForm').then((module) => ({ default: module.ProductServiceForm }))
);

const SalesLetterForm = React.lazy(() =>
  import('./components/SalesLetterForm').then((module) => ({ default: module.SalesLetterForm }))
);

type GeminiServiceModule = typeof import('./services/geminiService');
let geminiServicePromise: Promise<GeminiServiceModule> | null = null;

const loadGeminiService = (): Promise<GeminiServiceModule> => {
  if (!geminiServicePromise) {
    geminiServicePromise = import('./services/geminiService');
  }
  return geminiServicePromise;
};

const DB_KEY_HISTORY = 'flyergen_history_v1';
const DB_KEY_PRESETS = 'flyergen_presets_v1';
const DB_KEY_API_KEY = 'flyergen_api_key';
const DB_KEY_REPLICATE_API_KEY = 'flyergen_replicate_api_key';
const UPSCALE_SCALE = 4;

const createDefaultBrandRules = (): BrandRules => ({
  enabled: false,
  brandName: '',
  tone: 'trust',
  primaryColor: '#1d4ed8',
  secondaryColor: '#f59e0b',
  requiredPhrases: [],
  forbiddenPhrases: [],
  strictLogoPolicy: true
});

const normalizeBrandRules = (rules?: Partial<BrandRules> | null): BrandRules => {
  const next = rules || {};
  const normalizeList = (items: unknown) => (
    Array.isArray(items)
      ? items
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0)
      : []
  );

  return {
    enabled: !!next.enabled,
    brandName: typeof next.brandName === 'string' ? next.brandName : '',
    tone: next.tone === 'friendly' || next.tone === 'premium' || next.tone === 'energetic' ? next.tone : 'trust',
    primaryColor: typeof next.primaryColor === 'string' && next.primaryColor ? next.primaryColor : '#1d4ed8',
    secondaryColor: typeof next.secondaryColor === 'string' && next.secondaryColor ? next.secondaryColor : '#f59e0b',
    requiredPhrases: normalizeList(next.requiredPhrases),
    forbiddenPhrases: normalizeList(next.forbiddenPhrases),
    strictLogoPolicy: next.strictLogoPolicy !== undefined ? !!next.strictLogoPolicy : true
  };
};

const createDefaultSettings = (): FlyerSettings => ({
  orientation: 'vertical',
  imageSize: '2K',
  patternCount: 1,
  backgroundMode: 'creative',
  customBackground: '',
  flyerTitle: '',
  logoPosition: 'full-bottom',
  additionalInstructions: '',
  brandRules: createDefaultBrandRules()
});

type GenerationJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

type GenerationJobSnapshot = {
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

type GenerationJob = {
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

const sameStringArray = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Initialize Firebase on app load
const firebaseEnabled = initFirebase();

const App: React.FC = () => {
  // State
  const [products, setProducts] = useState<Product[]>([
    { id: uuidv4(), images: [], productCode: '', productName: '', specs: '', originalPrice: '', salePrice: '', salePriceLabel: '', catchCopy: '' }
  ]);
  const [characterImages, setCharacterImages] = useState<string[]>([]);
  const [selectedCharacterIndices, setSelectedCharacterIndices] = useState<Set<number>>(new Set());
  const [characterClothingMode, setCharacterClothingMode] = useState<'fixed' | 'match'>('fixed');
  const [customIllustrations, setCustomIllustrations] = useState<string[]>([]);
  const [selectedCustomIllustrationIndices, setSelectedCustomIllustrationIndices] = useState<Set<number>>(new Set());
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [selectedReferenceIndex, setSelectedReferenceIndex] = useState<number | null>(null);
  const [storeLogoImages, setStoreLogoImages] = useState<string[]>([]);
  const [selectedLogoIndices, setSelectedLogoIndices] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<FlyerSettings>(createDefaultSettings);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationQueue, setGenerationQueue] = useState<GenerationJob[]>([]);
  const [activeGenerationJobId, setActiveGenerationJobId] = useState<string | null>(null);
  const cancelRequestedGenerationJobsRef = useRef<Set<string>>(new Set());

  // History State
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const mainContentRef = useRef<HTMLElement>(null);
  const historyGridRef = useRef<HTMLDivElement>(null);
  const [historyGridWidth, setHistoryGridWidth] = useState(0);
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 0));
  const [gridOffsetTop, setGridOffsetTop] = useState(0);
  const [measuredRowHeight, setMeasuredRowHeight] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ startRow: number; endRow: number }>({ startRow: 0, endRow: -1 });
  const rowStrideRef = useRef(0);
  const gridOffsetTopRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const totalRowsRef = useRef(0);

  // Preset State
  const [presets, setPresets] = useState<Preset[]>([]);
  const [currentPresetIds, setCurrentPresetIds] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null
  });
  const [showPresetList, setShowPresetList] = useState(false);

  // Save Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [tempApiKey, setTempApiKey] = useState<string>("");

  // Download Dropdown State
  const [openDownloadMenu, setOpenDownloadMenu] = useState<string | null>(null);

  // Preset Load Confirmation Modal State
  const [presetToLoad, setPresetToLoad] = useState<Preset | null>(null);

  // Upscale State
  const [replicateApiKey, setReplicateApiKey] = useState<string>("");
  const [tempReplicateApiKey, setTempReplicateApiKey] = useState<string>("");
  const [upscalingImageId, setUpscalingImageId] = useState<string | null>(null);

  // 4K Regeneration State
  const [regenerating4KImageId, setRegenerating4KImageId] = useState<string | null>(null);

  // Tag Filter State
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTaggingAll, setIsTaggingAll] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // desc = newest first, asc = oldest first

  // Manual Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadTags, setUploadTags] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string>("");

  // Image Edit Modal State
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null);
  const [isEditGenerating, setIsEditGenerating] = useState(false);

  // Text Removal State
  const [removingTextImageId, setRemovingTextImageId] = useState<string | null>(null);

  // Front/Back Side State (表面/裏面切り替え)
  const [flyerSide, setFlyerSide] = useState<'front' | 'back'>('back');

  // Main Tab State (メインタブ切り替え)
  const [mainTab, setMainTab] = useState<MainTabType>('front');

  const activePresetId = currentPresetIds[mainTab];
  // プリセット表示: mainTabが'common'や'assets'の場合はflyerSideでフィルタ
  const presetsForSide = useMemo(() => {
    const targetSide = (mainTab === 'front' || mainTab === 'back') ? mainTab : flyerSide;
    return presets.filter(p => p.side === targetSide);
  }, [presets, mainTab, flyerSide]);
  const createBlankProduct = () => ({
    id: uuidv4(),
    images: [],
    productCode: '',
    productName: '',
    specs: '',
    originalPrice: '',
    salePrice: '',
    salePriceLabel: '',
    catchCopy: ''
  });

  // Sidebar State (サイドバー開閉 - モバイル用)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Campaign Info State (表面用キャンペーン情報)
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({
    campaignDescription: '',
    headline: '',
    campaignName: '',
    startDate: '',
    endDate: '',
    content: '',
    benefits: [''],
    useProductImage: false,
    productImages: []
  });

  // Customer Images State (お客様画像)
  const [customerImages, setCustomerImages] = useState<string[]>([]);
  const [selectedCustomerImageIndices, setSelectedCustomerImageIndices] = useState<Set<number>>(new Set());

  // Front Product Images State (表面チラシ用商品画像)
  const [frontProductImages, setFrontProductImages] = useState<string[]>([]);
  const [selectedFrontProductIndices, setSelectedFrontProductIndices] = useState<Set<number>>(new Set());

  // Campaign Main Images Selection State (キャンペーン訴求メイン画像の選択状態)
  const [selectedCampaignMainImageIndices, setSelectedCampaignMainImageIndices] = useState<Set<number>>(new Set());

  // Campaign AI Generation State
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);

  // Opposite Side Reference Images (反対面参照用)
  const [oppositeSideImage, setOppositeSideImage] = useState<string>('');
  const [useOppositeSideReference, setUseOppositeSideReference] = useState(false);

  // Product/Service Introduction State (商品・サービス紹介)
  const [frontFlyerType, setFrontFlyerType] = useState<FrontFlyerType>('campaign');
  const [productServiceInfo, setProductServiceInfo] = useState<ProductServiceInfo>({
    title: '',
    catchCopy: '',
    specs: '',
    features: [''],
    benefits: [''],
    targetAudience: [''],
    beforeAfter: '',
    customerReviews: [''],
    caseStudies: '',
    warranty: '',
    pricing: '',
    subsidies: '',
    limitedOffer: '',
    energySaving: '',
    ecoContribution: '',
    faq: [],
    cta: '',
    productImages: [],
    sections: {
      catchCopy: true,
      specs: false,
      features: true,
      benefits: true,
      targetAudience: false,
      beforeAfter: false,
      customerReviews: false,
      caseStudies: false,
      warranty: false,
      pricing: false,
      subsidies: false,
      limitedOffer: false,
      energySaving: false,
      ecoContribution: false,
      faq: false,
      cta: false
    }
  });

  // Sales Letter Mode State (セールスレターモード)
  const [salesLetterMode, setSalesLetterMode] = useState(false);
  const [salesLetterInfo, setSalesLetterInfo] = useState<SalesLetterInfo>({
    framework: 'pasona',
    productName: '',
    headline: '',
    problems: [''],
    benefits: [''],
    cta: '',
    affinity: '',
    solution: '',
    offer: '',
    narrowing: '',
    desire: '',
    socialProof: {
      experience: '',
      cases: '',
      customerVoices: ['']
    }
  });

  // Load History, Presets & API Key on mount (Firebase + local fallback)
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load API Key from local storage
        const savedApiKey = await get<string>(DB_KEY_API_KEY);
        if (savedApiKey) {
          setApiKey(savedApiKey);
          setTempApiKey(savedApiKey);
        }

        // Load Replicate API Key from local storage
        const savedReplicateKey = await get<string>(DB_KEY_REPLICATE_API_KEY);
        if (savedReplicateKey) {
          setReplicateApiKey(savedReplicateKey);
          setTempReplicateApiKey(savedReplicateKey);
        }

        // Try to load from Firebase first
        if (firebaseEnabled) {
          console.log('Loading from Firebase...');
          const [cloudImages, cloudPresets, cloudReferenceImages, cloudCharacterImages, cloudStoreLogoImages, cloudCustomIllustrations, cloudCustomerImages, cloudFrontProductImages, cloudCampaignMainImages] = await Promise.all([
            getCloudImages(),
            getCloudPresets(),
            getReferenceImages(),
            getCharacterImages(),
            getStoreLogoImages(),
            getCustomIllustrations(),
            getCustomerImages(),
            getFrontProductImages(),
            getCampaignMainImages()
          ]);

          if (cloudImages.length > 0) {
            const historyFromCloud: GeneratedImage[] = cloudImages.map(img => ({
              id: img.id,
              data: img.url,
              thumbnail: img.thumbnail,
              tags: img.tags,
              isFavorite: img.isFavorite,
              isUpscaled: img.isUpscaled,
              upscaleScale: img.upscaleScale,
              isEdited: img.isEdited,
              is4KRegenerated: img.is4KRegenerated,
              imageSize: img.imageSize,
              qualityCheck: img.qualityStatus
                ? {
                    status: img.qualityStatus,
                    summary: img.qualitySummary,
                    issues: img.qualityIssues || [],
                    checkedAt: img.qualityCheckedAt || img.createdAt
                  }
                : undefined,
              createdAt: img.createdAt
            })).sort((a, b) => b.createdAt - a.createdAt); // Sort by newest first
            setHistory(historyFromCloud);
          }

          if (cloudPresets.length > 0) {
            const presetsFromCloud: Preset[] = cloudPresets.map(p => {
              // sideが'front'/'back'以外の場合（'common'/'assets'等）は内容から推測
              let inferredSide: 'front' | 'back';
              if (p.side === 'front' || p.side === 'back') {
                inferredSide = p.side;
              } else if (p.frontFlyerType || p.campaignInfo || p.productServiceInfo || p.salesLetterInfo || p.salesLetterMode !== undefined) {
                inferredSide = 'front';
              } else {
                inferredSide = 'back';
              }
              return {
                id: p.id,
                name: p.name,
                side: inferredSide,
                products: Array.isArray(p.products) ? p.products : [],
                settings: p.settings,
                characterClothingMode: (p.characterClothingMode || 'fixed') as 'fixed' | 'match',
                campaignInfo: p.campaignInfo ? { ...p.campaignInfo, productImages: [] } : undefined,
                frontFlyerType: p.frontFlyerType as FrontFlyerType | undefined,
                productServiceInfo: p.productServiceInfo,
                salesLetterInfo: p.salesLetterInfo,
                salesLetterMode: p.salesLetterMode,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
              };
            });
            setPresets(presetsFromCloud);
          }

          // Load reference images independently (not from presets)
          if (cloudReferenceImages.images.length > 0) {
            setReferenceImages(cloudReferenceImages.images);
            setSelectedReferenceIndex(cloudReferenceImages.selectedIndices.length > 0 ? cloudReferenceImages.selectedIndices[0] : null);
          }

          // Load character images independently (not from presets)
          if (cloudCharacterImages.images.length > 0) {
            setCharacterImages(cloudCharacterImages.images);
            setSelectedCharacterIndices(new Set(cloudCharacterImages.selectedIndices));
          }

          // Load store logo images independently (not from presets)
          if (cloudStoreLogoImages.images.length > 0) {
            setStoreLogoImages(cloudStoreLogoImages.images);
            setSelectedLogoIndices(new Set(cloudStoreLogoImages.selectedIndices));
          }

          // Load custom illustrations independently (not from presets)
          if (cloudCustomIllustrations.images.length > 0) {
            setCustomIllustrations(cloudCustomIllustrations.images);
            setSelectedCustomIllustrationIndices(new Set(cloudCustomIllustrations.selectedIndices));
          }

          // Load customer images independently (not from presets)
          if (cloudCustomerImages.images.length > 0) {
            setCustomerImages(cloudCustomerImages.images);
            setSelectedCustomerImageIndices(new Set(cloudCustomerImages.selectedIndices));
          }

          // Load front product images independently (not from presets)
          if (cloudFrontProductImages.images.length > 0) {
            setFrontProductImages(cloudFrontProductImages.images);
            setSelectedFrontProductIndices(new Set(cloudFrontProductImages.selectedIndices));
          }

          // Load campaign main images independently (not from presets)
          if (cloudCampaignMainImages.images.length > 0) {
            setCampaignInfo(prev => ({ ...prev, productImages: cloudCampaignMainImages.images }));
            setSelectedCampaignMainImageIndices(new Set(cloudCampaignMainImages.selectedIndices));
          }
        } else {
          // Fallback to local storage
          const [savedHistory, savedPresets] = await Promise.all([
            get<GeneratedImage[]>(DB_KEY_HISTORY),
            get<Preset[]>(DB_KEY_PRESETS)
          ]);
          if (savedHistory) {
            const sortedHistory = savedHistory.sort((a, b) => b.createdAt - a.createdAt); // Sort by newest first
            setHistory(sortedHistory);
          }
          if (savedPresets) {
            const normalizedPresets: Preset[] = savedPresets.map(p => {
              const inferredSide = p.side || (p.frontFlyerType || p.campaignInfo || p.productServiceInfo || p.salesLetterInfo || p.salesLetterMode ? 'front' : 'back');
              return {
                id: p.id,
                name: p.name,
                side: inferredSide === 'front' ? 'front' : 'back',
                products: Array.isArray(p.products) ? p.products : [],
                settings: p.settings,
                characterClothingMode: (p.characterClothingMode || 'fixed') as 'fixed' | 'match',
                campaignInfo: p.campaignInfo ? { ...p.campaignInfo, productImages: [] } : undefined,
                frontFlyerType: p.frontFlyerType,
                productServiceInfo: p.productServiceInfo,
                salesLetterInfo: p.salesLetterInfo,
                salesLetterMode: p.salesLetterMode,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
              };
            });
            setPresets(normalizedPresets);
          }
        }
      } catch (e) {
        console.error("Failed to load data", e);
      }
    };
    loadData();
  }, []);

  // Sync reference images to cloud when changed (independent of presets)
  const [referenceImagesInitialized, setReferenceImagesInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!referenceImagesInitialized) {
      if (referenceImages.length > 0) {
        setReferenceImagesInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing reference images to cloud...');
        const result = await saveReferenceImages(
          referenceImages,
          selectedReferenceIndex !== null ? [selectedReferenceIndex] : []
        );
        if (!cancelled && result.success && !sameStringArray(referenceImages, result.images)) {
          setReferenceImages(result.images);
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [referenceImages, selectedReferenceIndex, referenceImagesInitialized]);

  // Sync character images to cloud when changed (independent of presets)
  const [characterImagesInitialized, setCharacterImagesInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!characterImagesInitialized) {
      if (characterImages.length > 0) {
        setCharacterImagesInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing character images to cloud...');
        const result = await saveCharacterImages(characterImages, Array.from(selectedCharacterIndices));
        if (!cancelled && result.success && !sameStringArray(characterImages, result.images)) {
          setCharacterImages(result.images);
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [characterImages, selectedCharacterIndices, characterImagesInitialized]);

  // Sync store logo images to cloud when changed (independent of presets)
  const [logoImagesInitialized, setLogoImagesInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!logoImagesInitialized) {
      if (storeLogoImages.length > 0) {
        setLogoImagesInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing store logo images to cloud...');
        const result = await saveStoreLogoImages(storeLogoImages, Array.from(selectedLogoIndices));
        if (!cancelled && result.success && !sameStringArray(storeLogoImages, result.images)) {
          setStoreLogoImages(result.images);
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [storeLogoImages, selectedLogoIndices, logoImagesInitialized]);

  // Sync custom illustrations to cloud when changed (independent of presets)
  const [customIllustrationsInitialized, setCustomIllustrationsInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!customIllustrationsInitialized) {
      if (customIllustrations.length > 0) {
        setCustomIllustrationsInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing custom illustrations to cloud...');
        const result = await saveCustomIllustrations(customIllustrations, Array.from(selectedCustomIllustrationIndices));
        if (!cancelled && result.success && !sameStringArray(customIllustrations, result.images)) {
          setCustomIllustrations(result.images);
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [customIllustrations, selectedCustomIllustrationIndices, customIllustrationsInitialized]);

  // Sync customer images to cloud when changed (independent of presets)
  const [customerImagesInitialized, setCustomerImagesInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!customerImagesInitialized) {
      if (customerImages.length > 0) {
        setCustomerImagesInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing customer images to cloud...');
        const result = await saveCustomerImages(customerImages, Array.from(selectedCustomerImageIndices));
        if (!cancelled && result.success && !sameStringArray(customerImages, result.images)) {
          setCustomerImages(result.images);
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [customerImages, selectedCustomerImageIndices, customerImagesInitialized]);

  // Sync campaign main images to cloud when changed (independent of presets)
  const [campaignMainImagesInitialized, setCampaignMainImagesInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!campaignMainImagesInitialized) {
      if (campaignInfo.productImages.length > 0) {
        setCampaignMainImagesInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing campaign main images to cloud...');
        const result = await saveCampaignMainImages(
          campaignInfo.productImages,
          Array.from(selectedCampaignMainImageIndices)
        );
        if (!cancelled && result.success && !sameStringArray(campaignInfo.productImages, result.images)) {
          setCampaignInfo(prev => (
            sameStringArray(prev.productImages, result.images)
              ? prev
              : { ...prev, productImages: result.images }
          ));
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [campaignInfo.productImages, selectedCampaignMainImageIndices, campaignMainImagesInitialized]);

  // Handle campaign main images change with cloud sync
  const handleCampaignMainImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const currentIndices: number[] = Array.from(selectedCampaignMainImageIndices);
    const newSelectedIndices = new Set<number>(
      currentIndices.filter(i => i < images.length)
    );
    setSelectedCampaignMainImageIndices(newSelectedIndices);
    setCampaignInfo(prev => ({ ...prev, productImages: images }));
    if (!campaignMainImagesInitialized) {
      setCampaignMainImagesInitialized(true);
    }
  };

  // Toggle campaign main image selection
  const toggleCampaignMainImageSelection = (index: number) => {
    setSelectedCampaignMainImageIndices((prev: Set<number>) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    if (!campaignMainImagesInitialized) {
      setCampaignMainImagesInitialized(true);
    }
  };

  // Handle customer images change with cloud sync
  const handleCustomerImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedCustomerImageIndices as Set<number>).filter(i => i < images.length)
    );
    setSelectedCustomerImageIndices(newSelectedIndices);
    setCustomerImages(images);
    if (!customerImagesInitialized) {
      setCustomerImagesInitialized(true);
    }
  };

  // Toggle customer image selection
  const toggleCustomerImageSelection = (index: number) => {
    setSelectedCustomerImageIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    if (!customerImagesInitialized) {
      setCustomerImagesInitialized(true);
    }
  };

  // Sync front product images to cloud when changed (independent of presets)
  const [frontProductImagesInitialized, setFrontProductImagesInitialized] = React.useState(false);
  useEffect(() => {
    // Skip initial load sync - only sync user changes
    if (!frontProductImagesInitialized) {
      if (frontProductImages.length > 0) {
        setFrontProductImagesInitialized(true);
      }
      return;
    }

    if (firebaseEnabled) {
      // Debounce the sync to avoid too many writes
      let cancelled = false;
      const syncTimeout = setTimeout(async () => {
        console.log('Syncing front product images to cloud...');
        const result = await saveFrontProductImages(frontProductImages, Array.from(selectedFrontProductIndices));
        if (!cancelled && result.success && !sameStringArray(frontProductImages, result.images)) {
          setFrontProductImages(result.images);
        }
      }, 1000);

      return () => {
        cancelled = true;
        clearTimeout(syncTimeout);
      };
    }
  }, [frontProductImages, selectedFrontProductIndices, frontProductImagesInitialized]);

  // Handle front product images change with cloud sync
  const handleFrontProductImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedFrontProductIndices as Set<number>).filter(i => i < images.length)
    );
    setSelectedFrontProductIndices(newSelectedIndices);
    setFrontProductImages(images);
    if (!frontProductImagesInitialized) {
      setFrontProductImagesInitialized(true);
    }
  };

  // Toggle front product image selection
  const toggleFrontProductImageSelection = (index: number) => {
    setSelectedFrontProductIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    if (!frontProductImagesInitialized) {
      setFrontProductImagesInitialized(true);
    }
  };

  // Handle reference images change with cloud sync
  const handleReferenceImagesChange = (images: string[]) => {
    // When images change, update selected index to remove it if out of bounds
    if (selectedReferenceIndex !== null && selectedReferenceIndex >= images.length) {
      setSelectedReferenceIndex(null);
    }
    setReferenceImages(images);
    if (!referenceImagesInitialized) {
      setReferenceImagesInitialized(true);
    }
  };

  // Toggle reference image selection (single selection)
  const toggleReferenceImageSelection = (index: number) => {
    setSelectedReferenceIndex(prev => prev === index ? null : index);
    if (!referenceImagesInitialized) {
      setReferenceImagesInitialized(true);
    }
  };

  // Handle character images change with cloud sync
  const handleCharacterImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedCharacterIndices as Set<number>).filter(i => i < images.length)
    );
    setSelectedCharacterIndices(newSelectedIndices);
    setCharacterImages(images);
    if (!characterImagesInitialized) {
      setCharacterImagesInitialized(true);
    }
  };

  // Toggle character image selection
  const toggleCharacterImageSelection = (index: number) => {
    setSelectedCharacterIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    if (!characterImagesInitialized) {
      setCharacterImagesInitialized(true);
    }
  };

  // Handle store logo images change with cloud sync
  const handleStoreLogoImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedLogoIndices as Set<number>).filter(i => i < images.length)
    );
    setSelectedLogoIndices(newSelectedIndices);
    setStoreLogoImages(images);
    if (!logoImagesInitialized) {
      setLogoImagesInitialized(true);
    }
  };

  // Toggle store logo image selection
  const toggleLogoImageSelection = (index: number) => {
    setSelectedLogoIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    if (!logoImagesInitialized) {
      setLogoImagesInitialized(true);
    }
  };

  // Handle custom illustrations change with cloud sync
  const handleCustomIllustrationsChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedCustomIllustrationIndices as Set<number>).filter(i => i < images.length)
    );
    setSelectedCustomIllustrationIndices(newSelectedIndices);
    setCustomIllustrations(images);
    if (!customIllustrationsInitialized) {
      setCustomIllustrationsInitialized(true);
    }
  };

  // Toggle custom illustration selection
  const toggleCustomIllustrationSelection = (index: number) => {
    setSelectedCustomIllustrationIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    if (!customIllustrationsInitialized) {
      setCustomIllustrationsInitialized(true);
    }
  };

  const dedupeImages = (items: string[]) => {
    const seen = new Map<string, number>();
    const nextImages: string[] = [];
    const indexMap: number[] = [];
    items.forEach((img, idx) => {
      if (seen.has(img)) {
        indexMap[idx] = seen.get(img) as number;
        return;
      }
      const nextIndex = nextImages.length;
      seen.set(img, nextIndex);
      nextImages.push(img);
      indexMap[idx] = nextIndex;
    });
    return { nextImages, indexMap };
  };

  const remapSelectionByIndexMap = (selected: Set<number>, indexMap: number[]) => {
    const next = new Set<number>();
    selected.forEach((index) => {
      const mapped = indexMap[index];
      if (typeof mapped === 'number') next.add(mapped);
    });
    return next;
  };

  const remapSingleByIndexMap = (selected: number | null, indexMap: number[]) => {
    if (selected === null) return null;
    const mapped = indexMap[selected];
    return typeof mapped === 'number' ? mapped : null;
  };

  const dedupeCharacterImages = () => {
    if (!window.confirm('重複画像を削除しますか？')) return;
    setCharacterImages(prev => {
      const { nextImages, indexMap } = dedupeImages(prev);
      setSelectedCharacterIndices(prevSelected => remapSelectionByIndexMap(prevSelected, indexMap));
      return nextImages;
    });
    if (!characterImagesInitialized) {
      setCharacterImagesInitialized(true);
    }
  };

  const selectAllCharacterImages = () => {
    setSelectedCharacterIndices(new Set(characterImages.map((_, idx) => idx)));
    if (!characterImagesInitialized) {
      setCharacterImagesInitialized(true);
    }
  };

  const clearCharacterSelection = () => {
    setSelectedCharacterIndices(new Set());
    if (!characterImagesInitialized) {
      setCharacterImagesInitialized(true);
    }
  };

  const dedupeReferenceImages = () => {
    if (!window.confirm('重複画像を削除しますか？')) return;
    setReferenceImages(prev => {
      const { nextImages, indexMap } = dedupeImages(prev);
      setSelectedReferenceIndex(prevSelected => remapSingleByIndexMap(prevSelected, indexMap));
      return nextImages;
    });
    if (!referenceImagesInitialized) {
      setReferenceImagesInitialized(true);
    }
  };

  const clearReferenceSelection = () => {
    setSelectedReferenceIndex(null);
    if (!referenceImagesInitialized) {
      setReferenceImagesInitialized(true);
    }
  };

  const dedupeLogoImages = () => {
    if (!window.confirm('重複画像を削除しますか？')) return;
    setStoreLogoImages(prev => {
      const { nextImages, indexMap } = dedupeImages(prev);
      setSelectedLogoIndices(prevSelected => remapSelectionByIndexMap(prevSelected, indexMap));
      return nextImages;
    });
    if (!logoImagesInitialized) {
      setLogoImagesInitialized(true);
    }
  };

  const selectAllLogoImages = () => {
    setSelectedLogoIndices(new Set(storeLogoImages.map((_, idx) => idx)));
    if (!logoImagesInitialized) {
      setLogoImagesInitialized(true);
    }
  };

  const clearLogoSelection = () => {
    setSelectedLogoIndices(new Set());
    if (!logoImagesInitialized) {
      setLogoImagesInitialized(true);
    }
  };

  const dedupeCustomIllustrations = () => {
    if (!window.confirm('重複画像を削除しますか？')) return;
    setCustomIllustrations(prev => {
      const { nextImages, indexMap } = dedupeImages(prev);
      setSelectedCustomIllustrationIndices(prevSelected => remapSelectionByIndexMap(prevSelected, indexMap));
      return nextImages;
    });
    if (!customIllustrationsInitialized) {
      setCustomIllustrationsInitialized(true);
    }
  };

  const selectAllCustomIllustrations = () => {
    setSelectedCustomIllustrationIndices(new Set(customIllustrations.map((_, idx) => idx)));
    if (!customIllustrationsInitialized) {
      setCustomIllustrationsInitialized(true);
    }
  };

  const clearCustomIllustrationSelection = () => {
    setSelectedCustomIllustrationIndices(new Set());
    if (!customIllustrationsInitialized) {
      setCustomIllustrationsInitialized(true);
    }
  };

  const dedupeCustomerImages = () => {
    if (!window.confirm('重複画像を削除しますか？')) return;
    setCustomerImages(prev => {
      const { nextImages, indexMap } = dedupeImages(prev);
      setSelectedCustomerImageIndices(prevSelected => remapSelectionByIndexMap(prevSelected, indexMap));
      return nextImages;
    });
    if (!customerImagesInitialized) {
      setCustomerImagesInitialized(true);
    }
  };

  const selectAllCustomerImages = () => {
    setSelectedCustomerImageIndices(new Set(customerImages.map((_, idx) => idx)));
    if (!customerImagesInitialized) {
      setCustomerImagesInitialized(true);
    }
  };

  const clearCustomerSelection = () => {
    setSelectedCustomerImageIndices(new Set());
    if (!customerImagesInitialized) {
      setCustomerImagesInitialized(true);
    }
  };

  const updateHistoryGridMetrics = useCallback(() => {
    if (!historyGridRef.current || !mainContentRef.current) return;
    const gridRect = historyGridRef.current.getBoundingClientRect();
    const containerRect = mainContentRef.current.getBoundingClientRect();
    setHistoryGridWidth(gridRect.width);
    setGridOffsetTop(gridRect.top - containerRect.top + mainContentRef.current.scrollTop);
    setViewportHeight(mainContentRef.current.clientHeight || window.innerHeight);
  }, []);

  useEffect(() => {
    updateHistoryGridMetrics();
  }, [updateHistoryGridMetrics, history.length, showPresetList, flyerSide, mainTab]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (mainContentRef.current) {
        setViewportHeight(mainContentRef.current.clientHeight);
      } else {
        setViewportHeight(window.innerHeight);
      }
      updateHistoryGridMetrics();
      setMeasuredRowHeight(null);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateHistoryGridMetrics]);

  useEffect(() => {
    if (!historyGridRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      updateHistoryGridMetrics();
    });
    observer.observe(historyGridRef.current);
    if (mainContentRef.current) {
      observer.observe(mainContentRef.current);
    }
    return () => observer.disconnect();
  }, [updateHistoryGridMetrics]);

  const overscanRows = 2;

  const computeVisibleRange = useCallback(() => {
    if (typeof window === 'undefined') {
      return { startRow: 0, endRow: -1 };
    }
    const total = totalRowsRef.current;
    const stride = rowStrideRef.current;
    if (total === 0 || stride <= 0) {
      return { startRow: 0, endRow: -1 };
    }
    const container = mainContentRef.current;
    const scrollTop = container ? container.scrollTop : (window.scrollY || 0);
    const offsetTop = gridOffsetTopRef.current;
    const viewport = viewportHeightRef.current || container?.clientHeight || window.innerHeight || 0;
    const startRow = Math.max(0, Math.floor((scrollTop - offsetTop - overscanRows * stride) / stride));
    const endRow = Math.min(total - 1, Math.floor((scrollTop + viewport - offsetTop + overscanRows * stride) / stride));
    return { startRow, endRow };
  }, []);

  useEffect(() => {
    const container = mainContentRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = computeVisibleRange();
        setVisibleRange(prev => (prev.startRow === next.startRow && prev.endRow === next.endRow ? prev : next));
        ticking = false;
      });
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [computeVisibleRange, history.length, showPresetList, flyerSide, mainTab]);

  // Logic
  const addProduct = () => {
    setProducts([...products, { id: uuidv4(), images: [], productCode: '', productName: '', specs: '', originalPrice: '', salePrice: '', salePriceLabel: '', catchCopy: '' }]);
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const updateProduct = (updated: Product) => {
    setProducts(products.map(p => p.id === updated.id ? updated : p));
  };

  const duplicateProduct = (product: Product) => {
    const duplicated: Product = {
      ...JSON.parse(JSON.stringify(product)),
      id: uuidv4()
    };
    const index = products.findIndex(p => p.id === product.id);
    const newProducts = [...products];
    newProducts.splice(index + 1, 0, duplicated);
    setProducts(newProducts);
  };

  // Thumbnail generation helper - optimized with createImageBitmap + requestIdleCallback
  const createThumbnail = useCallback((base64: string, maxWidth = 300): Promise<string> => {
    return new Promise((resolve) => {
      // Use requestIdleCallback to avoid blocking the main thread
      const processImage = async () => {
        try {
          // Convert base64 to blob for createImageBitmap
          const response = await fetch(base64);
          const blob = await response.blob();

          // createImageBitmap is faster and more efficient than new Image()
          const bitmap = await createImageBitmap(blob);

          const scale = maxWidth / bitmap.width;
          const canvas = document.createElement('canvas');
          canvas.width = maxWidth;
          canvas.height = Math.round(bitmap.height * scale);

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          }

          // Release bitmap memory
          bitmap.close();

          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
          // Fallback to original on error
          resolve(base64);
        }
      };

      // Schedule processing during idle time, with 2 second timeout fallback
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => processImage(), { timeout: 2000 });
      } else {
        // Fallback for browsers without requestIdleCallback (Safari)
        setTimeout(() => processImage(), 0);
      }
    });
  }, []);

  const setQualityCheckForImage = useCallback((imageId: string, qualityCheck: ImageQualityCheck) => {
    setHistory((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.id !== imageId) return item;
        changed = true;
        return { ...item, qualityCheck };
      });
      if (changed) {
        void set(DB_KEY_HISTORY, next);
      }
      return changed ? next : prev;
    });
  }, []);

  const runQualityChecksForItems = useCallback(async (items: GeneratedImage[], apiKeyOverride?: string) => {
    const effectiveApiKey = apiKeyOverride || apiKey;
    if (!effectiveApiKey || items.length === 0) return;

    const targets = items.filter((item) => !!item.data);
    if (targets.length === 0) return;

    const startedAt = Date.now();
    targets.forEach((item) => {
      setQualityCheckForImage(item.id, {
        status: 'pending',
        summary: '品質チェック中',
        issues: [],
        checkedAt: startedAt
      });
    });

    const gemini = await loadGeminiService();

    await Promise.all(targets.map(async (item) => {
      try {
        const result = await gemini.checkFlyerQuality(item.data, effectiveApiKey);
        const checkedAt = Date.now();
        const qualityCheck: ImageQualityCheck = {
          status: result.status,
          summary: result.summary,
          issues: result.issues,
          checkedAt
        };
        setQualityCheckForImage(item.id, qualityCheck);

        const canSyncToCloud = firebaseEnabled && /\.(png|jpe?g|webp)$/i.test(item.id);
        if (canSyncToCloud) {
          await updateFlyerQualityCheck(
            item.id,
            qualityCheck.status === 'pending' ? 'warn' : qualityCheck.status,
            qualityCheck.issues,
            qualityCheck.summary || '',
            checkedAt
          );
        }
      } catch (error) {
        console.error(`Quality check failed for ${item.id}:`, error);
        const checkedAt = Date.now();
        const fallback: ImageQualityCheck = {
          status: 'error',
          summary: '品質判定エラー',
          issues: ['品質チェックの実行中にエラーが発生しました'],
          checkedAt
        };
        setQualityCheckForImage(item.id, fallback);

        const canSyncToCloud = firebaseEnabled && /\.(png|jpe?g|webp)$/i.test(item.id);
        if (canSyncToCloud) {
          await updateFlyerQualityCheck(
            item.id,
            'error',
            fallback.issues,
            fallback.summary || '',
            checkedAt
          );
        }
      }
    }));
  }, [apiKey, firebaseEnabled, setQualityCheckForImage]);

  const patchGenerationJob = useCallback((jobId: string, patch: Partial<GenerationJob>) => {
    setGenerationQueue((prev) => prev.map((job) => (
      job.id === jobId
        ? { ...job, ...patch, updatedAt: Date.now() }
        : job
    )));
  }, []);

  const executeGenerationJob = useCallback(async (job: GenerationJob) => {
    const jobId = job.id;
    const isCancellationRequested = () => cancelRequestedGenerationJobsRef.current.has(jobId);

    patchGenerationJob(jobId, { status: 'running', progress: 5, message: '生成準備中', error: undefined });

    try {
      const gemini = await loadGeminiService();
      const snapshot = job.snapshot;

      if (isCancellationRequested()) {
        patchGenerationJob(jobId, { status: 'canceled', progress: 0, message: 'キャンセル済み' });
        return;
      }

      patchGenerationJob(jobId, { progress: 20, message: 'AI生成中' });

      let results: string[];
      let tags: string[];

      if (snapshot.flyerSide === 'front') {
        if (snapshot.frontFlyerType === 'product-service') {
          if (snapshot.salesLetterMode) {
            [results, tags] = await Promise.all([
              gemini.generateSalesLetterFlyer(
                snapshot.salesLetterInfo,
                snapshot.settings,
                snapshot.selectedProductImages,
                snapshot.selectedCharacterImages,
                snapshot.selectedCustomerImages,
                snapshot.selectedStoreLogoImages,
                snapshot.selectedCustomIllustrations,
                snapshot.selectedReferenceImages,
                snapshot.apiKey
              ),
              Promise.resolve(['表面', 'セールスレター', snapshot.salesLetterInfo.productName].filter(Boolean))
            ]);
          } else {
            [results, tags] = await Promise.all([
              gemini.generateProductServiceFlyer(
                snapshot.productServiceInfo,
                snapshot.settings,
                snapshot.selectedProductImages,
                snapshot.selectedCharacterImages,
                snapshot.selectedCustomerImages,
                snapshot.selectedStoreLogoImages,
                snapshot.selectedCustomIllustrations,
                snapshot.selectedReferenceImages,
                snapshot.apiKey
              ),
              Promise.resolve(['表面', '商品紹介', snapshot.productServiceInfo.title].filter(Boolean))
            ]);
          }
        } else {
          [results, tags] = await Promise.all([
            gemini.generateFrontFlyerImage(
              snapshot.campaignInfo,
              snapshot.settings,
              snapshot.selectedProductImages,
              snapshot.selectedCharacterImages,
              snapshot.selectedCustomerImages,
              snapshot.selectedStoreLogoImages,
              snapshot.selectedCustomIllustrations,
              snapshot.selectedReferenceImages,
              snapshot.apiKey
            ),
            Promise.resolve(['表面', snapshot.campaignInfo.campaignName || 'キャンペーン'].filter(Boolean))
          ]);
        }
      } else {
        [results, tags] = await Promise.all([
          gemini.generateFlyerImage(
            snapshot.products,
            snapshot.settings,
            snapshot.selectedCharacterImages,
            snapshot.characterClothingMode,
            snapshot.selectedReferenceImages,
            snapshot.selectedStoreLogoImages,
            snapshot.selectedCustomIllustrations,
            snapshot.apiKey
          ),
          gemini.generateTagsFromProducts(snapshot.products, snapshot.apiKey)
        ]);
        tags = ['裏面', ...tags];
      }

      if (isCancellationRequested()) {
        patchGenerationJob(jobId, { status: 'canceled', progress: 0, message: 'キャンセル済み' });
        return;
      }

      const newItems: GeneratedImage[] = [];
      const totalResults = Math.max(results.length, 1);

      for (let index = 0; index < results.length; index += 1) {
        if (isCancellationRequested()) {
          patchGenerationJob(jobId, { status: 'canceled', progress: 0, message: 'キャンセル済み' });
          return;
        }

        const data = results[index];
        const id = uuidv4();
        const timestamp = Date.now();
        const thumbnailData = await createThumbnail(data);

        if (firebaseEnabled) {
          const filename = `flyer_${timestamp}_${id}.png`;
          const thumbFilename = `flyer_${timestamp}_${id}_thumb.jpg`;
          const [cloudUrl, thumbUrl] = await Promise.all([
            uploadImage(data, filename),
            uploadImage(thumbnailData, thumbFilename)
          ]);

          if (cloudUrl) {
            await saveFlyerMetadata(filename, tags, timestamp, { imageSize: snapshot.settings.imageSize });
            newItems.push({
              id: filename,
              data: cloudUrl,
              thumbnail: thumbUrl || thumbnailData,
              tags,
              flyerType: snapshot.flyerSide,
              createdAt: timestamp,
              imageSize: snapshot.settings.imageSize
            });
          } else {
            newItems.push({
              id,
              data,
              thumbnail: thumbnailData,
              tags,
              flyerType: snapshot.flyerSide,
              createdAt: timestamp,
              imageSize: snapshot.settings.imageSize
            });
          }
        } else {
          newItems.push({
            id,
            data,
            thumbnail: thumbnailData,
            tags,
            flyerType: snapshot.flyerSide,
            createdAt: timestamp,
            imageSize: snapshot.settings.imageSize
          });
        }

        const progress = 35 + Math.round(((index + 1) / totalResults) * 60);
        patchGenerationJob(jobId, { progress, message: `保存処理 ${index + 1}/${totalResults}` });
      }

      if (isCancellationRequested()) {
        patchGenerationJob(jobId, { status: 'canceled', progress: 0, message: 'キャンセル済み' });
        return;
      }

      if (newItems.length > 0) {
        setHistory((prev) => {
          const updatedHistory = [...newItems, ...prev];
          void set(DB_KEY_HISTORY, updatedHistory);
          return updatedHistory;
        });
        void runQualityChecksForItems(newItems, snapshot.apiKey);
      }

      patchGenerationJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `${newItems.length}件生成完了`,
        error: undefined
      });
    } catch (error: any) {
      if (isCancellationRequested()) {
        patchGenerationJob(jobId, { status: 'canceled', progress: 0, message: 'キャンセル済み' });
        return;
      }

      console.error(`Generation job failed (${jobId}):`, error);
      patchGenerationJob(jobId, {
        status: 'failed',
        progress: 0,
        message: '生成失敗',
        error: error?.message || '不明なエラー'
      });
    } finally {
      cancelRequestedGenerationJobsRef.current.delete(jobId);
      setActiveGenerationJobId((current) => (current === jobId ? null : current));
      setIsGenerating(false);
    }
  }, [createThumbnail, patchGenerationJob, runQualityChecksForItems]);

  useEffect(() => {
    if (activeGenerationJobId) return;

    const nextJob = generationQueue.find((job) => job.status === 'pending');
    if (!nextJob) {
      setIsGenerating(false);
      return;
    }

    setActiveGenerationJobId(nextJob.id);
    setIsGenerating(true);
    void executeGenerationJob(nextJob);
  }, [activeGenerationJobId, executeGenerationJob, generationQueue]);

  const handleCancelGenerationJob = useCallback((jobId: string) => {
    cancelRequestedGenerationJobsRef.current.add(jobId);
    setGenerationQueue((prev) => prev.map((job) => {
      if (job.id !== jobId) return job;
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') return job;
      return {
        ...job,
        status: 'canceled',
        progress: 0,
        message: job.status === 'running' ? 'キャンセル要求中' : 'キャンセル済み',
        updatedAt: Date.now()
      };
    }));
  }, []);

  const handleRetryGenerationJob = useCallback((jobId: string) => {
    cancelRequestedGenerationJobsRef.current.delete(jobId);
    setGenerationQueue((prev) => prev.map((job) => (
      job.id === jobId
        ? {
            ...job,
            status: 'pending',
            progress: 0,
            message: '再実行待ち',
            error: undefined,
            updatedAt: Date.now()
          }
        : job
    )));
  }, []);

  const handleRemoveGenerationJob = useCallback((jobId: string) => {
    if (activeGenerationJobId === jobId) return;
    setGenerationQueue((prev) => prev.filter((job) => job.id !== jobId));
  }, [activeGenerationJobId]);

  const handleClearFinishedGenerationJobs = useCallback(() => {
    setGenerationQueue((prev) => prev.filter((job) => job.status === 'pending' || job.status === 'running'));
  }, []);

  const handleGenerate = () => {
    if (!apiKey) {
      setIsSettingsOpen(true);
      alert("APIキーが設定されていません。設定画面からGemini APIキーを入力してください。");
      return;
    }

    const sideLabel = flyerSide === 'front' ? '表面' : '裏面';
    const confirmMessage = isGenerating
      ? `${sideLabel}チラシ生成をキューに追加しますか？`
      : `${sideLabel}チラシを作成しますか？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const selectedCharacterImages = characterImages.filter((_, idx) => selectedCharacterIndices.has(idx));
    const selectedReferenceImages = selectedReferenceIndex !== null ? [referenceImages[selectedReferenceIndex]] : [];
    const selectedStoreLogoImages = storeLogoImages.filter((_, idx) => selectedLogoIndices.has(idx));
    const selectedCustomIllustrations = customIllustrations.filter((_, idx) => selectedCustomIllustrationIndices.has(idx));
    const selectedCustomerImages = customerImages.filter((_, idx) => selectedCustomerImageIndices.has(idx));
    const selectedProductImages = frontProductImages.filter((_, idx) => selectedFrontProductIndices.has(idx));
    const referenceWithOpposite = useOppositeSideReference && oppositeSideImage
      ? [...selectedReferenceImages, oppositeSideImage]
      : selectedReferenceImages;

    const snapshot: GenerationJobSnapshot = {
      apiKey,
      flyerSide,
      frontFlyerType,
      salesLetterMode,
      settings: deepClone(settings),
      products: deepClone(products),
      characterClothingMode,
      salesLetterInfo: deepClone(salesLetterInfo),
      productServiceInfo: deepClone(productServiceInfo),
      campaignInfo: deepClone(campaignInfo),
      selectedCharacterImages: deepClone(selectedCharacterImages),
      selectedReferenceImages: deepClone(referenceWithOpposite),
      selectedStoreLogoImages: deepClone(selectedStoreLogoImages),
      selectedCustomIllustrations: deepClone(selectedCustomIllustrations),
      selectedCustomerImages: deepClone(selectedCustomerImages),
      selectedProductImages: deepClone(selectedProductImages)
    };

    const now = Date.now();
    const queueItem: GenerationJob = {
      id: uuidv4(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      progress: 0,
      message: '待機中',
      side: flyerSide,
      snapshot
    };

    setGenerationQueue((prev) => [...prev, queueItem]);
  };

  // Handle campaign content AI generation
  const handleGenerateCampaignContent = async () => {
    if (!apiKey) {
      setIsSettingsOpen(true);
      alert("APIキーが設定されていません。");
      return;
    }
    if (!campaignInfo.campaignDescription.trim()) {
      alert("「何のキャンペーン？」を入力してください。");
      return;
    }

    setIsGeneratingCampaign(true);
    try {
      const gemini = await loadGeminiService();
      const result = await gemini.generateCampaignContent(campaignInfo.campaignDescription, apiKey);
      setCampaignInfo(prev => ({
        ...prev,
        headline: result.headline,
        campaignName: result.campaignName
      }));
    } catch (e) {
      console.error(e);
      alert("キャンペーン内容の生成に失敗しました。");
    } finally {
      setIsGeneratingCampaign(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!window.confirm("この画像を削除してもよろしいですか？")) return;

    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
    await set(DB_KEY_HISTORY, updatedHistory);

    if (firebaseEnabled) {
      await deleteCloudImage(id);
    }
  };

  const handleUseAsReference = (imageData: string) => {
    setReferenceImages(prev => [...prev, imageData]);
    alert("「参考チラシ画像」に追加しました！");
    const refSection = document.getElementById('reference-section');
    if (refSection) {
      refSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Manual upload handlers
  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      alert("画像ファイルを選択してください。");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setUploadPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleConfirmUpload = async () => {
    if (!uploadPreview) return;
    setUploadingImage(true);
    try {
      const id = uuidv4();
      const timestamp = Date.now();
      const tags = uploadTags.split(/[,、]/).map(t => t.trim()).filter(t => t.length > 0);

      const thumbnailData = await createThumbnail(uploadPreview);
      let imageData = uploadPreview;
      let thumbnail = thumbnailData;
      let finalId = id;

      if (firebaseEnabled) {
        const filename = `upload_${timestamp}_${id}.png`;
        const thumbFilename = `upload_${timestamp}_${id}_thumb.jpg`;
        const [cloudUrl, thumbUrl] = await Promise.all([
          uploadImage(uploadPreview, filename),
          uploadImage(thumbnailData, thumbFilename)
        ]);
        if (cloudUrl) {
          imageData = cloudUrl;
          finalId = filename;
          await saveFlyerMetadata(finalId, tags, timestamp);
        }
        if (thumbUrl) thumbnail = thumbUrl;
      }

      const newImage: GeneratedImage = {
        id: finalId,
        data: imageData,
        thumbnail,
        tags: tags.length > 0 ? tags : undefined,
        createdAt: timestamp
      };

      const updated = [newImage, ...history];
      setHistory(updated);
      await set(DB_KEY_HISTORY, updated);
      setIsUploadModalOpen(false);
      setUploadPreview("");
      setUploadTags("");
    } catch (e) {
      console.error("Upload failed:", e);
      alert("アップロードに失敗しました。");
    } finally {
      setUploadingImage(false);
    }
  };

  // Upscale handler
  const handleUpscale = async (item: GeneratedImage) => {
    if (item.isUpscaled) return;
    if (item.is4KRegenerated || item.imageSize === '4K') {
      alert("4K画像はアップスケールできません。");
      return;
    }
    if (!replicateApiKey) {
      alert("アップスケール機能を使用するには、設定画面でReplicate APIキーを入力してください。");
      setIsSettingsOpen(true);
      return;
    }

    setUpscalingImageId(item.id);

    try {
      const scaleForItem = UPSCALE_SCALE;

      // Always use full resolution image (item.data), not thumbnail
      const result = await upscaleImage(item.data, replicateApiKey, scaleForItem);

      // Create new upscaled image entry
      const newId = uuidv4();
      const timestamp = Date.now();

      // Generate thumbnail for upscaled image
      const thumbnailData = await createThumbnail(result.image);

      let newImageData = result.image;
      let newThumbnail = thumbnailData;
      let finalId = newId; // Default ID for local storage

      // Upload to Firebase if enabled
      if (firebaseEnabled) {
        const filename = `flyer_upscaled_${timestamp}_${newId}.png`;
        const thumbFilename = `flyer_upscaled_${timestamp}_${newId}_thumb.jpg`;
        finalId = filename; // Use filename as ID for Firebase consistency

        // Upload both full image and thumbnail in parallel
        const [cloudUrl, thumbUrl] = await Promise.all([
          uploadImage(result.image, filename),
          uploadImage(thumbnailData, thumbFilename)
        ]);

        if (cloudUrl) {
          newImageData = cloudUrl;
        }
        if (thumbUrl) {
          newThumbnail = thumbUrl;
        }
      }

      const newItem: GeneratedImage = {
        id: finalId,
        data: newImageData,
        thumbnail: newThumbnail,
        tags: [...(item.tags || []), `#アップスケール${scaleForItem}x`],
        createdAt: timestamp,
        imageSize: item.imageSize,
        isUpscaled: true,
        upscaleScale: scaleForItem,
        is4KRegenerated: item.is4KRegenerated
      };

      const updatedHistory = [
        newItem,
        ...history.map(existing =>
          existing.id === item.id
            ? { ...existing, isUpscaled: false, upscaleScale: undefined }
            : existing
        )
      ];
      setHistory(updatedHistory);
      await set(DB_KEY_HISTORY, updatedHistory);
      void runQualityChecksForItems([newItem]);

      // Save metadata to Firebase if enabled
      if (firebaseEnabled) {
        await saveFlyerMetadata(finalId, newItem.tags || [], timestamp, {
          isUpscaled: true,
          upscaleScale: scaleForItem,
          is4KRegenerated: item.is4KRegenerated,
          imageSize: item.imageSize
        });
        await updateFlyerUpscaleStatus(item.id, false);
      }

      alert("アップスケールが完了しました！高画質版が履歴に追加されました。");
    } catch (e: any) {
      console.error('Upscale failed:', e);
      alert(`アップスケールに失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setUpscalingImageId(null);
    }
  };

  // 4K Regeneration handler (Gemini Batch API - preserves content)
  const handleRegenerate4K = async (item: GeneratedImage) => {
    if (regenerating4KImageId) return;

    if (!apiKey) {
      alert("Gemini APIキーを設定してください。");
      setIsSettingsOpen(true);
      return;
    }

    setRegenerating4KImageId(item.id);

    try {
      const gemini = await loadGeminiService();
      const result = await gemini.regenerateImage4K(item.data, apiKey);

      // Create new 4K image entry
      const newId = uuidv4();
      const timestamp = Date.now();

      // Generate thumbnail for 4K image
      const thumbnailData = await createThumbnail(result);

      let finalId: string = newId;
      let newImageData = result;
      let newThumbnail = thumbnailData || undefined;

      // Upload to Firebase if enabled
      if (firebaseEnabled) {
        const filename = `flyer_4k_${timestamp}_${newId}.png`;
        const thumbFilename = `flyer_4k_${timestamp}_${newId}_thumb.jpg`;
        finalId = filename;
        try {
          const [cloudUrl, thumbUrl] = await Promise.all([
            uploadImage(result, filename),
            thumbnailData ? uploadImage(thumbnailData, thumbFilename) : Promise.resolve(null)
          ]);
          if (cloudUrl) {
            newImageData = cloudUrl;
          }
          if (thumbUrl) {
            newThumbnail = thumbUrl;
          }
        } catch (uploadError) {
          console.error('Failed to upload 4K image:', uploadError);
        }
      }

      const newItem: GeneratedImage = {
        id: finalId,
        data: newImageData,
        thumbnail: newThumbnail,
        createdAt: timestamp,
        imageSize: '4K',
        tags: [...(item.tags || []), '#4K再生成'],
        isFavorite: false,
        is4KRegenerated: true
      };

      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      await set(DB_KEY_HISTORY, updatedHistory);
      void runQualityChecksForItems([newItem]);

      // Save metadata to Firebase if enabled
      if (firebaseEnabled) {
        await saveFlyerMetadata(finalId, newItem.tags || [], timestamp, {
          is4KRegenerated: true,
          imageSize: '4K'
        });
      }

      alert("4K再生成が完了しました！高解像度版が履歴に追加されました。");
    } catch (e: any) {
      console.error('4K regeneration failed:', e);
      alert(`4K再生成に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setRegenerating4KImageId(null);
    }
  };

  // Helper for robust file downloads with maximum browser compatibility
  const triggerDownload = (blob: Blob, filename: string, mimeType: string) => {
    // Ensure filename has extension - critical for Safari/macOS
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(filename);
    if (!hasExtension) {
      const ext = mimeType.includes('pdf') ? '.pdf' : '.jpg';
      filename = filename + ext;
    }

    // Force specific MIME type - use octet-stream for maximum compatibility
    const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(downloadBlob);
    const link = document.createElement('a');

    // Set href and download attributes
    link.href = url;
    link.download = filename;

    // Additional attributes for Safari compatibility
    link.setAttribute('download', filename);
    link.setAttribute('target', '_blank');
    link.rel = 'noopener noreferrer';

    // Safari/macOS requires the link to be in the DOM
    link.style.display = 'none';
    link.style.position = 'absolute';
    link.style.left = '-9999px';
    document.body.appendChild(link);

    // Trigger download with slight delay for Safari
    setTimeout(() => {
      link.click();

      // Cleanup after a longer delay to ensure download starts
      setTimeout(() => {
        if (document.body && document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 100);
    }, 10);
  };

  const formatDateForFilename = (timestamp: number) => {
    let date = new Date(timestamp);
    if (isNaN(date.getTime())) date = new Date();

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    // Simplified filename format to avoid any OS character issues
    return `${y}${m}${d}_${h}${min}`;
  };

  const handleDownloadJpg = (imageData: string, timestamp: number) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            const filename = `Flyer_${formatDateForFilename(timestamp)}.jpg`;
            triggerDownload(blob, filename, 'image/jpeg');
          }
        }, 'image/jpeg', 1.0);
      }
    };
    img.src = imageData;
    setOpenDownloadMenu(null);
  };

  const handleDownloadPng = (imageData: string, timestamp: number) => {
    // Handle both data URLs and cloud URLs by using Image + Canvas
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            const filename = `Flyer_${formatDateForFilename(timestamp)}.png`;
            triggerDownload(blob, filename, 'image/png');
          }
        }, 'image/png');
      }
    };
    img.src = imageData;
    setOpenDownloadMenu(null);
  };

  const handleDownloadPdf = (imageData: string, timestamp: number) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const a4Width = 595.28;
      const a4Height = 841.89;
      const scale = Math.min(a4Width / width, a4Height / height);
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const offsetX = (a4Width - scaledWidth) / 2;
      const offsetY = (a4Height - scaledHeight) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const uint8Array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        uint8Array[i] = binary.charCodeAt(i);
      }

      const pdfHeader = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${a4Width} ${a4Height}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 100 >>
stream
q
${scaledWidth} 0 0 ${scaledHeight} ${offsetX} ${offsetY} cm
/Im1 Do
Q
endstream
endobj
5 0 obj
<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${uint8Array.length} >>
stream
`;
      const header = new TextEncoder().encode(pdfHeader);
      const footer = new TextEncoder().encode(`
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000270 00000 n 
0000000420 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${header.length + uint8Array.length + 20}
%%EOF`);

      const pdfBlob = new Blob([header, uint8Array, footer], { type: 'application/pdf' });
      const filename = `Flyer_${formatDateForFilename(timestamp)}.pdf`;
      triggerDownload(pdfBlob, filename, 'application/pdf');
    };
    img.src = imageData;
    setOpenDownloadMenu(null);
  };

  // --- Preset Logic ---

  const openSaveModal = () => {
    if (activePresetId) {
      const current = presets.find(p => p.id === activePresetId);
      setSavePresetName(current ? current.name : "");
    } else {
      setSavePresetName("");
    }
    setIsSaveModalOpen(true);
  };

  const executeSavePreset = async (asNew: boolean) => {
    if (!savePresetName.trim()) {
      alert("プリセット名を入力してください");
      return;
    }

    setIsSaving(true);

    try {
      let targetId = uuidv4();
      if (!asNew && activePresetId) {
        targetId = activePresetId;
      }

      const now = Date.now();
      // プリセットのsideは常に'front'または'back'（mainTabが'common'や'assets'の場合はflyerSideを使用）
      const presetSide = (mainTab === 'front' || mainTab === 'back') ? mainTab : flyerSide;

      const newPreset: Preset = {
        id: targetId,
        name: savePresetName,
        side: presetSide,
        settings: { ...settings },
        characterClothingMode: characterClothingMode,
        createdAt: presets.find(p => p.id === targetId)?.createdAt || now,
        updatedAt: now
      };

      if (presetSide === 'back') {
        newPreset.products = JSON.parse(JSON.stringify(products));
      } else {
        const campaignInfoSnapshot = JSON.parse(JSON.stringify(campaignInfo));
        newPreset.campaignInfo = { ...campaignInfoSnapshot, productImages: [] };
        newPreset.frontFlyerType = frontFlyerType;
        newPreset.productServiceInfo = JSON.parse(JSON.stringify(productServiceInfo));
        newPreset.salesLetterInfo = JSON.parse(JSON.stringify(salesLetterInfo));
        newPreset.salesLetterMode = salesLetterMode;
      }

      let updatedPresets: Preset[];
      // Check if updating existing or adding new
      if (presets.some(p => p.id === targetId)) {
        updatedPresets = presets.map(p => p.id === targetId ? newPreset : p);
      } else {
        updatedPresets = [newPreset, ...presets];
      }

      setPresets(updatedPresets);
      setCurrentPresetIds(prev => ({ ...prev, [presetSide]: targetId }));

      // Save to local storage
      await set(DB_KEY_PRESETS, updatedPresets);

      // Save to Firebase if enabled
      if (firebaseEnabled) {
        await saveCloudPreset({
          ...newPreset,
          characterClothingMode: newPreset.characterClothingMode
        });
      }

      setIsSaveModalOpen(false);
      alert(`「${savePresetName}」を保存しました${firebaseEnabled ? '（クラウド同期済み）' : ''}`);
    } catch (e) {
      console.error('Save error:', e);
      alert('保存中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadPreset = (preset: Preset) => {
    setPresetToLoad(preset);
  };

  const confirmLoadPreset = () => {
    if (!presetToLoad) return;

    const preset = presetToLoad;
    // Deep clone to ensure we have fresh mutable data and prevent reference issues
    const data = JSON.parse(JSON.stringify(preset));

    const presetSide: 'front' | 'back' = data.side === 'front' ? 'front' : 'back';
    if (presetSide !== mainTab) {
      setMainTab(presetSide);
      setFlyerSide(presetSide);
    }

    if (data.characterClothingMode) {
      setCharacterClothingMode(data.characterClothingMode);
    }

    if (presetSide === 'back') {
      const nextProducts = Array.isArray(data.products) && data.products.length > 0
        ? data.products
        : [createBlankProduct()];
      setProducts(nextProducts);
    }

    // Ensure settings has all required fields with defaults
    const defaultSettings = createDefaultSettings();
    setSettings({
      orientation: data.settings?.orientation || defaultSettings.orientation,
      imageSize: data.settings?.imageSize || defaultSettings.imageSize,
      patternCount: data.settings?.patternCount || defaultSettings.patternCount,
      backgroundMode: data.settings?.backgroundMode || defaultSettings.backgroundMode,
      customBackground: data.settings?.customBackground || defaultSettings.customBackground,
      flyerTitle: data.settings?.flyerTitle || defaultSettings.flyerTitle,
      logoPosition: data.settings?.logoPosition || defaultSettings.logoPosition,
      additionalInstructions: data.settings?.additionalInstructions || defaultSettings.additionalInstructions,
      brandRules: normalizeBrandRules(data.settings?.brandRules)
    });

    // Load front side fields
    if (presetSide === 'front') {
      if (data.frontFlyerType) {
        setFrontFlyerType(data.frontFlyerType);
      }
      if (data.campaignInfo) {
        setCampaignInfo(prev => ({
          campaignDescription: data.campaignInfo.campaignDescription || '',
          headline: data.campaignInfo.headline || '',
          campaignName: data.campaignInfo.campaignName || '',
          startDate: data.campaignInfo.startDate || '',
          endDate: data.campaignInfo.endDate || '',
          content: data.campaignInfo.content || '',
          benefits: data.campaignInfo.benefits || [''],
          useProductImage: data.campaignInfo.useProductImage || false,
          productImages: prev.productImages
        }));
      }
      if (data.productServiceInfo) {
        setProductServiceInfo(data.productServiceInfo);
      }
      if (data.salesLetterInfo) {
        setSalesLetterInfo(data.salesLetterInfo);
      }
      if (typeof data.salesLetterMode === 'boolean') {
        setSalesLetterMode(data.salesLetterMode);
      }
    }

    setCurrentPresetIds(prev => ({ ...prev, [presetSide]: data.id }));
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Close modal
    setPresetToLoad(null);
  };

  const handleDeletePreset = async (id: string, e: React.MouseEvent) => {
    // Critical: Stop propagation to prevent triggering handleLoadPreset on the parent div
    e.preventDefault();
    e.stopPropagation();

    if (window.confirm("このプリセットを削除してもよろしいですか？")) {
      const updatedPresets = presets.filter(p => p.id !== id);
      setPresets(updatedPresets);
      const targetPreset = presets.find(p => p.id === id);
      if (targetPreset) {
        setCurrentPresetIds(prev => (prev[targetPreset.side] === id ? { ...prev, [targetPreset.side]: null } : prev));
      }
      await set(DB_KEY_PRESETS, updatedPresets);

      if (firebaseEnabled) {
        await deleteCloudPreset(id);
      }
    }
  };

  const handleNewProject = () => {
    if (window.confirm("現在の入力をクリアして新規作成しますか？（キャラ画像、参考デザイン、ロゴ画像はクラウド同期のため保持されます）")) {
      setProducts([{ id: uuidv4(), images: [], productCode: '', productName: '', specs: '', originalPrice: '', salePrice: '', salePriceLabel: '', catchCopy: '' }]);
      // Note: characterImages are NOT cleared - they are synced independently from cloud
      // Note: referenceImages are NOT cleared - they are synced independently from cloud
      // Note: storeLogoImages are NOT cleared - they are synced independently from cloud
      setSettings(createDefaultSettings());
      setCurrentPresetIds(prev => ({ ...prev, [mainTab]: null }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Tag all existing history items (retagAll = true for re-tagging all items)
  const tagAllExistingHistory = async (retagAll: boolean = false) => {
    if (!apiKey) {
      alert("APIキーが設定されていません。");
      return;
    }

    const itemsToTag = retagAll
      ? history
      : history.filter(item => !item.tags || item.tags.length === 0);

    if (itemsToTag.length === 0) {
      alert("タグ付け対象の履歴がありません。");
      return;
    }

    const message = retagAll
      ? `${itemsToTag.length}件すべての履歴のタグを付け直します。Gemini APIを使用します。続行しますか？`
      : `${itemsToTag.length}件の履歴にタグを付けます。Gemini APIを使用します。続行しますか？`;

    if (!window.confirm(message)) {
      return;
    }

    setIsTaggingAll(true);

    try {
      const gemini = await loadGeminiService();
      let successCount = 0;
      const updatedHistory = [...history];

      for (const item of itemsToTag) {
        try {
          const tags = await gemini.generateTagsFromImage(item.data, apiKey);
          if (tags.length > 0) {
            // Update local state
            const index = updatedHistory.findIndex(h => h.id === item.id);
            if (index !== -1) {
              updatedHistory[index] = { ...updatedHistory[index], tags };
            }

            // Save to Firestore if Firebase enabled
            if (firebaseEnabled) {
              await updateFlyerTags(item.id, tags);
            }

            successCount++;
          }
        } catch (e) {
          console.error(`Failed to tag item ${item.id}:`, e);
        }
      }

      setHistory(updatedHistory);
      await set(DB_KEY_HISTORY, updatedHistory);

      alert(`${successCount}/${itemsToTag.length}件のタグ付けが完了しました。`);
    } catch (e) {
      console.error('Tagging failed:', e);
      alert('タグ付け中にエラーが発生しました。');
    } finally {
      setIsTaggingAll(false);
    }
  };

  // Toggle favorite status for a flyer
  const toggleFavorite = async (itemId: string) => {
    const item = history.find(h => h.id === itemId);
    if (!item) return;

    const newFavoriteStatus = !item.isFavorite;

    // Update local state
    const updatedHistory = history.map(h =>
      h.id === itemId ? { ...h, isFavorite: newFavoriteStatus } : h
    );
    setHistory(updatedHistory);
    await set(DB_KEY_HISTORY, updatedHistory);

    // Save to Firestore if Firebase enabled
    if (firebaseEnabled) {
      await updateFlyerFavorite(itemId, newFavoriteStatus);
    }
  };

  // Handle image editing
  const handleEditImage = async (regions: EditRegion[]) => {
    if (!editingImage || !apiKey) return;

    setIsEditGenerating(true);

    try {
      const gemini = await loadGeminiService();
      // Generate edited image
      const editedImageData = await gemini.editImage(editingImage.data, regions, apiKey);

      // Create new history entry for edited image
      const id = uuidv4();
      const timestamp = Date.now();

      // Generate thumbnail
      const thumbnailData = await createThumbnail(editedImageData);

      let newImageData = editedImageData;
      let newThumbnail = thumbnailData;

      // Upload to Firebase if enabled
      if (firebaseEnabled) {
        const filename = `flyer_edited_${timestamp}_${id}.png`;
        const thumbFilename = `flyer_edited_${timestamp}_${id}_thumb.jpg`;

        const [cloudUrl, thumbUrl] = await Promise.all([
          uploadImage(editedImageData, filename),
          uploadImage(thumbnailData, thumbFilename)
        ]);

        if (cloudUrl) {
          newImageData = cloudUrl;
        }
        if (thumbUrl) {
          newThumbnail = thumbUrl;
        }
      }

      const newItem: GeneratedImage = {
        id: firebaseEnabled ? `flyer_edited_${timestamp}_${id}.png` : id,
        data: newImageData,
        thumbnail: newThumbnail,
        tags: [...(editingImage.tags || []), '#編集済み'], // Inherit tags from original + add edited tag
        createdAt: timestamp,
        imageSize: editingImage.imageSize,
        isEdited: true
      };

      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      await set(DB_KEY_HISTORY, updatedHistory);
      void runQualityChecksForItems([newItem]);

      // Save metadata to Firebase if enabled
      if (firebaseEnabled) {
        await saveFlyerMetadata(newItem.id, newItem.tags || [], timestamp, {
          isEdited: true,
          imageSize: editingImage.imageSize
        });
      }

      // Close modal
      setEditingImage(null);

      alert('編集が完了しました！新しい画像が履歴に追加されました。');
    } catch (e: any) {
      console.error('Edit failed:', e);
      alert(`編集に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setIsEditGenerating(false);
    }
  };

  // Handle text removal from image
  const handleRemoveText = async (item: GeneratedImage) => {
    if (!apiKey) {
      alert("APIキーが設定されていません。");
      return;
    }

    if (!window.confirm("この画像から文字を消去しますか？\n背景やイラストはそのまま残ります。")) {
      return;
    }

    setRemovingTextImageId(item.id);

    try {
      const gemini = await loadGeminiService();
      // Remove text from image
      const cleanedImageData = await gemini.removeTextFromImage(item.data, apiKey);

      // Create new history entry for cleaned image
      const id = uuidv4();
      const timestamp = Date.now();

      // Generate thumbnail
      const thumbnailData = await createThumbnail(cleanedImageData);

      let newImageData = cleanedImageData;
      let newThumbnail = thumbnailData;

      // Upload to Firebase if enabled
      if (firebaseEnabled) {
        const filename = `flyer_notext_${timestamp}_${id}.png`;
        const thumbFilename = `flyer_notext_${timestamp}_${id}_thumb.jpg`;

        const [cloudUrl, thumbUrl] = await Promise.all([
          uploadImage(cleanedImageData, filename),
          uploadImage(thumbnailData, thumbFilename)
        ]);

        if (cloudUrl) {
          newImageData = cloudUrl;
        }
        if (thumbUrl) {
          newThumbnail = thumbUrl;
        }
      }

      const newItem: GeneratedImage = {
        id: firebaseEnabled ? `flyer_notext_${timestamp}_${id}.png` : id,
        data: newImageData,
        thumbnail: newThumbnail,
        tags: [...(item.tags || []).filter(t => t !== '#文字消去済み'), '#文字消去済み'],
        createdAt: timestamp,
        imageSize: item.imageSize,
        isEdited: true
      };

      const updatedHistory = [newItem, ...history];
      setHistory(updatedHistory);
      await set(DB_KEY_HISTORY, updatedHistory);
      void runQualityChecksForItems([newItem]);

      // Save metadata to Firebase if enabled
      if (firebaseEnabled) {
        await saveFlyerMetadata(newItem.id, newItem.tags || [], timestamp, {
          isEdited: true,
          imageSize: item.imageSize
        });
      }

      alert('文字消去が完了しました！新しい画像が履歴に追加されました。');
    } catch (e: any) {
      console.error('Text removal failed:', e);
      alert(`文字消去に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setRemovingTextImageId(null);
    }
  };

  const handleRecheckQuality = (item: GeneratedImage) => {
    if (!apiKey) {
      alert("品質チェックにはGemini APIキーが必要です。");
      setIsSettingsOpen(true);
      return;
    }
    void runQualityChecksForItems([item]);
  };

  const allTags = useMemo(
    () => [...new Set(history.flatMap(item => item.tags || []))],
    [history]
  );

  const filteredHistory = useMemo(() => {
    const filtered = selectedTag
      ? history.filter(item => item.tags && item.tags.includes(selectedTag))
      : history;

    return [...filtered].sort((a, b) => {
      const aFav = !!a.isFavorite;
      const bFav = !!b.isFavorite;
      if (aFav !== bFav) return aFav ? -1 : 1;
      if (a.createdAt === b.createdAt) return 0;
      const direction = sortOrder === 'asc' ? 1 : -1;
      return (a.createdAt - b.createdAt) * direction;
    });
  }, [history, selectedTag, sortOrder]);

  const historyColumns = useMemo(() => {
    // サイドバー分を考慮して調整
    if (windowWidth >= 1536) return 5;
    if (windowWidth >= 1280) return 4;
    if (windowWidth >= 1024) return 3;
    if (windowWidth >= 400) return 2;  // スマホでも2列表示
    return 1;  // 極小画面のみ1列
  }, [windowWidth]);

  useEffect(() => {
    setMeasuredRowHeight(null);
  }, [historyColumns, historyGridWidth]);

  const historyGridGap = 16;
  const fallbackGridWidth = Math.max(0, Math.min(windowWidth - 48, 1024));
  const effectiveGridWidth = historyGridWidth || fallbackGridWidth;
  const maxCardWidth = 220; // カードの最大幅
  const rawCardWidth = historyColumns > 0
    ? (effectiveGridWidth - historyGridGap * (historyColumns - 1)) / historyColumns
    : effectiveGridWidth;
  const cardWidth = Math.min(rawCardWidth, maxCardWidth);
  const imageHeight = cardWidth > 0 ? cardWidth * (4 / 3) : 0;
  const estimatedRowHeight = Math.max(260, imageHeight + 160);
  const rowHeight = measuredRowHeight ?? estimatedRowHeight;
  const rowStride = rowHeight + historyGridGap;
  const totalRows = historyColumns > 0 ? Math.ceil(filteredHistory.length / historyColumns) : 0;
  const startRow = totalRows === 0 ? 0 : Math.min(visibleRange.startRow, totalRows - 1);
  const endRow = totalRows === 0 ? -1 : Math.min(visibleRange.endRow, totalRows - 1);
  const topSpacerHeight = totalRows === 0 ? 0 : startRow * rowStride;
  const remainingRows = totalRows - endRow - 1;
  const bottomSpacerHeight = remainingRows <= 0
    ? 0
    : remainingRows * rowHeight + Math.max(0, remainingRows - 1) * historyGridGap;

  useEffect(() => {
    rowStrideRef.current = rowStride;
    gridOffsetTopRef.current = gridOffsetTop;
    viewportHeightRef.current = viewportHeight;
    totalRowsRef.current = totalRows;

    const next = computeVisibleRange();
    setVisibleRange(prev => (prev.startRow === next.startRow && prev.endRow === next.endRow ? prev : next));
  }, [rowStride, gridOffsetTop, viewportHeight, totalRows, computeVisibleRange]);

  const visibleRows = useMemo(() => {
    const rows: { row: number; items: GeneratedImage[] }[] = [];
    if (totalRows === 0 || endRow < startRow) return rows;
    for (let row = startRow; row <= endRow; row += 1) {
      rows.push({
        row,
        items: filteredHistory.slice(row * historyColumns, row * historyColumns + historyColumns)
      });
    }
    return rows;
  }, [filteredHistory, historyColumns, startRow, endRow, totalRows]);

  const rowMeasureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (!rect.height) return;
    setMeasuredRowHeight(prev => (prev && Math.abs(prev - rect.height) < 4 ? prev : rect.height));
  }, []);

  const getQualityBadgeConfig = (qualityCheck?: ImageQualityCheck) => {
    if (!qualityCheck || qualityCheck.status === 'pass') return null;
    if (qualityCheck.status === 'pending') {
      return { label: '⏳ 品質', className: 'bg-sky-500 text-white' };
    }
    if (qualityCheck.status === 'warn') {
      return { label: '⚠ 要確認', className: 'bg-amber-500 text-white' };
    }
    if (qualityCheck.status === 'fail') {
      return { label: '🚨 要修正', className: 'bg-rose-600 text-white' };
    }
    return { label: '⚠ 判定失敗', className: 'bg-slate-500 text-white' };
  };

  const getGenerationJobStatusConfig = (status: GenerationJobStatus) => {
    if (status === 'pending') return { label: '待機中', className: 'bg-slate-100 text-slate-700' };
    if (status === 'running') return { label: '実行中', className: 'bg-sky-100 text-sky-700' };
    if (status === 'completed') return { label: '完了', className: 'bg-emerald-100 text-emerald-700' };
    if (status === 'failed') return { label: '失敗', className: 'bg-rose-100 text-rose-700' };
    return { label: 'キャンセル', className: 'bg-amber-100 text-amber-700' };
  };

  const generationQueueStats = useMemo(() => {
    return generationQueue.reduce((acc, job) => {
      acc.total += 1;
      if (job.status === 'pending') acc.pending += 1;
      if (job.status === 'running') acc.running += 1;
      if (job.status === 'completed') acc.completed += 1;
      if (job.status === 'failed') acc.failed += 1;
      if (job.status === 'canceled') acc.canceled += 1;
      return acc;
    }, {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0
    });
  }, [generationQueue]);

  const visibleGenerationJobs = useMemo(
    () => [...generationQueue].reverse().slice(0, 6),
    [generationQueue]
  );

  const activeBrandRules = useMemo(
    () => normalizeBrandRules(settings.brandRules),
    [settings.brandRules]
  );

  const updateBrandRules = useCallback((patch: Partial<BrandRules>) => {
    setSettings((prev) => ({
      ...prev,
      brandRules: {
        ...normalizeBrandRules(prev.brandRules),
        ...patch
      }
    }));
  }, []);

  return (
    <div className="min-h-screen pb-32 bg-slate-50/50">
      {/* Header */}
      <header className="bg-white sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Hamburger Menu - Mobile only */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="設定・アセット"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <img src="./logo.png" alt="Logo" className="w-8 h-8 lg:w-10 lg:h-10 rounded-md" />
            <h1 className="text-base lg:text-xl font-semibold text-slate-900 tracking-tight hidden sm:block">
              チラシ作成ソフト
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 lg:gap-4">
            <button
              onClick={handleGenerate}
              className={`text-xs sm:text-sm px-2 sm:px-3 lg:px-4 py-1.5 rounded-full font-bold flex items-center gap-1 sm:gap-2 transition-all ${isGenerating ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
            >
              {isGenerating ? (
                <>
                  <span>＋</span>
                  <span className="hidden sm:inline">キュー追加</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span className="hidden sm:inline">{flyerSide === 'front' ? '表面作成' : '裏面作成'}</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowPresetList(!showPresetList)}
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
              title="プリセット読み込み"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
            </button>
            <button
              onClick={() => setIsSaveModalOpen(true)}
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
              title="プリセット保存"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
            </button>
            <button
              onClick={() => { setTempApiKey(apiKey); setTempReplicateApiKey(replicateApiKey); setIsSettingsOpen(true); }}
              className={`p-2 rounded-full flex items-center gap-1.5 transition-all ${apiKey ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
              title={apiKey ? 'API 接続中' : 'APIキー未設定'}
            >
              <div className={`w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full ${apiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className="hidden lg:inline text-xs font-bold">{apiKey ? '接続中' : '未設定'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2-Pane Layout Container */}
      <div className="flex min-h-[calc(100vh-56px)] lg:min-h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}>
          {/* Common Settings Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">⚙️</span>
              <h2 className="font-semibold text-slate-900">共通設定</h2>
            </div>

            {/* Orientation */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2">チラシ形式</label>
              <div className="flex gap-2">
                <label className={`flex-1 flex flex-col items-center p-2 border-2 rounded-md cursor-pointer transition-all ${settings.orientation === 'vertical' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                  <input type="radio" name="orientation-sidebar" className="sr-only" checked={settings.orientation === 'vertical'} onChange={() => setSettings({ ...settings, orientation: 'vertical' })} />
                  <div className="w-4 h-6 border-2 border-slate-400 rounded bg-white mb-1"></div>
                  <span className="text-xs font-medium text-slate-700">縦</span>
                </label>
                <label className={`flex-1 flex flex-col items-center p-2 border-2 rounded-md cursor-pointer transition-all ${settings.orientation === 'horizontal' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                  <input type="radio" name="orientation-sidebar" className="sr-only" checked={settings.orientation === 'horizontal'} onChange={() => setSettings({ ...settings, orientation: 'horizontal' })} />
                  <div className="w-6 h-4 border-2 border-slate-400 rounded bg-white mb-1"></div>
                  <span className="text-xs font-medium text-slate-700">横</span>
                </label>
              </div>
            </div>

            {/* Resolution & Pattern */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">解像度</label>
                <select
                  value={settings.imageSize}
                  onChange={(e) => setSettings({ ...settings, imageSize: e.target.value as any })}
                  className="w-full text-sm border border-slate-200 rounded-md py-2 px-2 bg-white font-medium"
                >
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">パターン</label>
                <select
                  value={settings.patternCount}
                  onChange={(e) => setSettings({ ...settings, patternCount: parseInt(e.target.value) })}
                  className="w-full text-sm border border-slate-200 rounded-md py-2 px-2 bg-white font-medium"
                >
                  {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Background Mode */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2">背景</label>
              <div className="flex gap-1">
                <button onClick={() => setSettings({ ...settings, backgroundMode: 'creative' })} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${settings.backgroundMode === 'creative' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>おまかせ</button>
                <button onClick={() => setSettings({ ...settings, backgroundMode: 'white' })} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${settings.backgroundMode === 'white' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>白</button>
                <button onClick={() => setSettings({ ...settings, backgroundMode: 'custom' })} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${settings.backgroundMode === 'custom' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>カスタム</button>
              </div>
              {settings.backgroundMode === 'custom' && (
                <textarea
                  rows={2}
                  placeholder="背景の指定..."
                  value={settings.customBackground || ''}
                  onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })}
                  className="mt-2 w-full text-sm border border-slate-200 rounded-md py-2 px-2"
                />
              )}
            </div>

            {/* Brand Rules */}
            <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500">ブランドルール固定</label>
                <button
                  onClick={() => updateBrandRules({ enabled: !activeBrandRules.enabled })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${activeBrandRules.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  title="ブランドルールを有効化"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${activeBrandRules.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={activeBrandRules.brandName}
                  onChange={(e) => updateBrandRules({ brandName: e.target.value })}
                  placeholder="ブランド名（例: ○○電器）"
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
                  disabled={!activeBrandRules.enabled}
                />

                <select
                  value={activeBrandRules.tone}
                  onChange={(e) => updateBrandRules({ tone: e.target.value as BrandRules['tone'] })}
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
                  disabled={!activeBrandRules.enabled}
                >
                  <option value="trust">信頼感</option>
                  <option value="friendly">親しみやすさ</option>
                  <option value="premium">高級感</option>
                  <option value="energetic">元気・活気</option>
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-slate-500">
                    メイン色
                    <input
                      type="color"
                      value={activeBrandRules.primaryColor}
                      onChange={(e) => updateBrandRules({ primaryColor: e.target.value })}
                      className="mt-1 h-8 w-full rounded border border-slate-200 bg-white"
                      disabled={!activeBrandRules.enabled}
                    />
                  </label>
                  <label className="text-[10px] text-slate-500">
                    補助色
                    <input
                      type="color"
                      value={activeBrandRules.secondaryColor}
                      onChange={(e) => updateBrandRules({ secondaryColor: e.target.value })}
                      className="mt-1 h-8 w-full rounded border border-slate-200 bg-white"
                      disabled={!activeBrandRules.enabled}
                    />
                  </label>
                </div>

                <textarea
                  rows={2}
                  value={activeBrandRules.requiredPhrases.join('\n')}
                  onChange={(e) => updateBrandRules({
                    requiredPhrases: e.target.value
                      .split(/\n|,|、/)
                      .map((text) => text.trim())
                      .filter((text) => text.length > 0)
                  })}
                  placeholder="必須フレーズ（改行で複数）"
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
                  disabled={!activeBrandRules.enabled}
                />

                <textarea
                  rows={2}
                  value={activeBrandRules.forbiddenPhrases.join('\n')}
                  onChange={(e) => updateBrandRules({
                    forbiddenPhrases: e.target.value
                      .split(/\n|,|、/)
                      .map((text) => text.trim())
                      .filter((text) => text.length > 0)
                  })}
                  placeholder="禁止フレーズ（改行で複数）"
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
                  disabled={!activeBrandRules.enabled}
                />

                <label className="flex items-center gap-2 text-[10px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={activeBrandRules.strictLogoPolicy}
                    onChange={(e) => updateBrandRules({ strictLogoPolicy: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600"
                    disabled={!activeBrandRules.enabled}
                  />
                  ロゴ改変を絶対禁止（強制）
                </label>
              </div>
            </div>
          </div>

          <hr className="border-slate-200 my-4" />

          {/* Assets Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🎨</span>
              <h2 className="font-semibold text-slate-900">アセット</h2>
            </div>

            <div className="space-y-3">
              {/* Character Images */}
              <CompactAssetSection
                title="キャラクター"
                icon="👤"
                images={characterImages}
                selectedCount={selectedCharacterIndices.size}
                selectedIndices={Array.from(selectedCharacterIndices)}
                isCloudSync={firebaseEnabled}
              >
                <ImageUploader label="キャラクター" images={characterImages} onImagesChange={handleCharacterImagesChange} />
                <AssetSelectionGrid images={characterImages} selectedIndices={selectedCharacterIndices} onToggleSelect={toggleCharacterImageSelection} onSelectAll={selectAllCharacterImages} onClearSelection={clearCharacterSelection} onRemoveDuplicates={dedupeCharacterImages} accent="indigo" />
                {characterImages.length > 0 && selectedCharacterIndices.size > 0 && (
                  <div className="mt-2 p-2 bg-slate-50 rounded-md">
                    <div className="flex gap-1">
                      <button onClick={() => setCharacterClothingMode('fixed')} className={`flex-1 py-1 text-xs rounded ${characterClothingMode === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}>👔 そのまま</button>
                      <button onClick={() => setCharacterClothingMode('match')} className={`flex-1 py-1 text-xs rounded ${characterClothingMode === 'match' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}>🎨 合わせる</button>
                    </div>
                  </div>
                )}
              </CompactAssetSection>

              {/* Custom Illustrations */}
              <CompactAssetSection
                title="イラスト"
                icon="🎨"
                images={customIllustrations}
                selectedCount={selectedCustomIllustrationIndices.size}
                selectedIndices={Array.from(selectedCustomIllustrationIndices)}
                isCloudSync={firebaseEnabled}
              >
                <ImageUploader label="イラスト" images={customIllustrations} onImagesChange={handleCustomIllustrationsChange} />
                <AssetSelectionGrid images={customIllustrations} selectedIndices={selectedCustomIllustrationIndices} onToggleSelect={toggleCustomIllustrationSelection} onSelectAll={selectAllCustomIllustrations} onClearSelection={clearCustomIllustrationSelection} onRemoveDuplicates={dedupeCustomIllustrations} accent="indigo" />
              </CompactAssetSection>

              {/* Reference Images */}
              <CompactAssetSection
                title="参考デザイン"
                icon="🖼️"
                images={referenceImages}
                selectedCount={selectedReferenceIndex !== null ? 1 : 0}
                selectedIndices={selectedReferenceIndex !== null ? [selectedReferenceIndex] : []}
                isCloudSync={firebaseEnabled}
              >
                <ImageUploader label="参考" images={referenceImages} onImagesChange={handleReferenceImagesChange} />
                <AssetSelectionGrid
                  images={referenceImages}
                  selectedIndices={new Set(selectedReferenceIndex !== null ? [selectedReferenceIndex] : [])}
                  onToggleSelect={toggleReferenceImageSelection}
                  onClearSelection={clearReferenceSelection}
                  onRemoveDuplicates={dedupeReferenceImages}
                  accent="indigo"
                  previewOnClick
                  previewHintLabel="画像クリックで拡大 / 右上の＋で選択"
                />
              </CompactAssetSection>

              {/* Customer Images */}
              <CompactAssetSection
                title="お客様画像"
                icon="👥"
                iconBgColor="bg-rose-50"
                iconBorderColor="border-rose-100"
                images={customerImages}
                selectedCount={selectedCustomerImageIndices.size}
                selectedIndices={Array.from(selectedCustomerImageIndices)}
                isCloudSync={firebaseEnabled}
              >
                <ImageUploader label="お客様" images={customerImages} onImagesChange={handleCustomerImagesChange} />
                <AssetSelectionGrid images={customerImages} selectedIndices={selectedCustomerImageIndices} onToggleSelect={toggleCustomerImageSelection} onSelectAll={selectAllCustomerImages} onClearSelection={clearCustomerSelection} onRemoveDuplicates={dedupeCustomerImages} accent="rose" />
              </CompactAssetSection>

              {/* Store Logo */}
              <CompactAssetSection
                title="店舗ロゴ"
                icon="🏪"
                images={storeLogoImages}
                selectedCount={selectedLogoIndices.size}
                selectedIndices={Array.from(selectedLogoIndices)}
                isCloudSync={firebaseEnabled}
              >
                <ImageUploader label="ロゴ" images={storeLogoImages} onImagesChange={handleStoreLogoImagesChange} />
                <AssetSelectionGrid images={storeLogoImages} selectedIndices={selectedLogoIndices} onToggleSelect={toggleLogoImageSelection} onSelectAll={selectAllLogoImages} onClearSelection={clearLogoSelection} onRemoveDuplicates={dedupeLogoImages} accent="indigo" />
                {storeLogoImages.length > 0 && selectedLogoIndices.size > 0 && (
                  <div className="mt-2 p-2 bg-slate-50 rounded-md">
                    <label className="block text-xs font-medium text-slate-400 mb-1">配置</label>
                    <div className="flex gap-1">
                      <button onClick={() => setSettings({ ...settings, logoPosition: 'full-bottom' })} className={`flex-1 py-1 text-xs rounded ${settings.logoPosition === 'full-bottom' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}>横幅100%</button>
                      <button onClick={() => setSettings({ ...settings, logoPosition: 'right-bottom' })} className={`flex-1 py-1 text-xs rounded ${settings.logoPosition === 'right-bottom' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}>右50%</button>
                    </div>
                  </div>
                )}
              </CompactAssetSection>
            </div>
          </div>
        </Sidebar>

        {/* Main Content Area */}
        <main ref={mainContentRef} className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 animate-fade-in">
          <div className="max-w-5xl mx-auto">
            {generationQueueStats.total > 0 && (
              <div className="bg-white border border-indigo-100 rounded-lg p-4 sm:p-5 mb-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧵</span>
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900">生成ジョブキュー</h2>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] sm:text-xs font-bold text-slate-600">
                      {generationQueueStats.total}件
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] sm:text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold">実行中 {generationQueueStats.running}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">待機 {generationQueueStats.pending}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">完了 {generationQueueStats.completed}</span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold">失敗 {generationQueueStats.failed}</span>
                  </div>
                  <button
                    onClick={handleClearFinishedGenerationJobs}
                    className="text-xs font-bold px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                  >
                    完了ジョブを整理
                  </button>
                </div>

                <div className="space-y-2.5">
                  {visibleGenerationJobs.map((job) => {
                    const status = getGenerationJobStatusConfig(job.status);
                    const canCancel = job.status === 'pending' || job.status === 'running';
                    const canRetry = job.status === 'failed' || job.status === 'canceled';
                    const canRemove = job.status !== 'running' && activeGenerationJobId !== job.id;
                    return (
                      <div key={job.id} className="border border-slate-200 rounded-md p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">
                              {job.side === 'front' ? '表面' : '裏面'} / {job.snapshot.settings.patternCount}案
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(job.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        </div>

                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full transition-all ${job.status === 'failed' ? 'bg-rose-500' : job.status === 'canceled' ? 'bg-amber-500' : 'bg-indigo-500'}`}
                            style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-slate-600">
                            {job.error ? `${job.message}: ${job.error}` : job.message}
                          </div>
                          <div className="flex gap-1.5">
                            {canCancel && (
                              <button
                                onClick={() => handleCancelGenerationJob(job.id)}
                                className="text-[10px] font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
                              >
                                キャンセル
                              </button>
                            )}
                            {canRetry && (
                              <button
                                onClick={() => handleRetryGenerationJob(job.id)}
                                className="text-[10px] font-bold px-2.5 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 transition-all"
                              >
                                再試行
                              </button>
                            )}
                            {canRemove && (
                              <button
                                onClick={() => handleRemoveGenerationJob(job.id)}
                                className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                              >
                                削除
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preset Management Section */}
            {showPresetList && (
              <div className="bg-white border border-indigo-100 rounded-lg p-5 sm:p-8 mb-6 sm:mb-10 animate-slide-up shadow-indigo-500/5">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📂</span>
                    <h2 className="text-xl font-semibold text-slate-900">保存済みプリセット</h2>
                  </div>
                  <button
                    onClick={handleNewProject}
                    className="text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-4 py-2 rounded-full transition-all"
                  >
                    ＋ 新規作成
                  </button>
                </div>
                {presetsForSide.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50/50 rounded-md border border-dashed border-slate-200">
                    <p className="text-slate-400 text-sm font-medium">プリセットがありません</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {presetsForSide.map(preset => (
                      <div
                        key={preset.id}
                        onClick={() => handleLoadPreset(preset)}
                        className={`group bg-white p-5 rounded-md border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${activePresetId === preset.id ? 'border-indigo-500 shadow-indigo-500/10 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{preset.name}</h3>
                            <p className="text-[10px] font-bold tracking-wider text-slate-400 mt-2 flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              更新: {new Date(preset.updatedAt).toLocaleDateString('ja-JP')}
                            </p>
                            <div className="flex gap-2 mt-3">
                              {preset.side === 'back' ? (
                                <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded-md">{preset.products?.length || 0} 商品</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded-md">{preset.frontFlyerType === 'product-service' ? '商品/サービス' : 'キャンペーン'}</span>
                              )}
                              <span className="px-2 py-0.5 bg-indigo-50 text-[10px] font-bold text-indigo-500 rounded-md">{preset.settings?.orientation === 'vertical' ? '縦向き' : '横向き'}</span>
                            </div>
                          </div>
                          <div className="pl-2">
                            <button
                              onClick={(e) => handleDeletePreset(preset.id, e)}
                              className="bg-slate-50 hover:bg-rose-50 text-slate-300 hover:text-rose-500 p-2 rounded-md transition-all group-hover:opacity-100 sm:opacity-0"
                              title="Delete"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Main Tabs */}
            <div className="mb-8">
              <MainTabs
                activeTab={mainTab}
                onTabChange={(tab) => {
                  setMainTab(tab);
                  // Sync flyerSide with tab for generation logic
                  if (tab === 'front') setFlyerSide('front');
                  if (tab === 'back') setFlyerSide('back');
                }}
              />
            </div>

            {/* Action Bar for Current State */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full ${activePresetId ? 'bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'bg-slate-300'}`}></div>
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-400">現在の状態</p>
                  {activePresetId ? (
                    <p className="font-semibold text-indigo-700">
                      編集中: {presets.find(p => p.id === activePresetId)?.name || '未保存のプリセット'}
                    </p>
                  ) : (
                    <p className="font-semibold text-slate-700">新規プロジェクト（未保存）</p>
                  )}
                </div>
              </div>
              <button
                onClick={openSaveModal}
                className="btn-premium flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-bold shadow-indigo-600/20 active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                保存
              </button>
            </div>

            {/* Front Side Tab */}
            {mainTab === 'front' && (
              <>
                {/* Front Flyer Type Selector */}
                <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-6 mb-6 overflow-hidden relative">
                  <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-4 ml-1">表面チラシのタイプ</label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className={`flex flex-col items-center justify-center p-5 border-2 rounded-lg cursor-pointer transition-all ${frontFlyerType === 'campaign' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name="frontFlyerType" className="sr-only" checked={frontFlyerType === 'campaign'} onChange={() => setFrontFlyerType('campaign')} />
                      <div className="w-12 h-12 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-2xl mb-3">🎉</div>
                      <div className="text-sm font-bold text-slate-900">キャンペーン訴求</div>
                      <div className="text-[10px] text-slate-500 mt-1">セール・フェア告知</div>
                    </label>
                    <label className={`flex flex-col items-center justify-center p-5 border-2 rounded-lg cursor-pointer transition-all ${frontFlyerType === 'product-service' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name="frontFlyerType" className="sr-only" checked={frontFlyerType === 'product-service'} onChange={() => setFrontFlyerType('product-service')} />
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl mb-3">📦</div>
                      <div className="text-sm font-bold text-slate-900">商品・サービス紹介</div>
                      <div className="text-[10px] text-slate-500 mt-1">機能・メリット訴求</div>
                    </label>
                  </div>
                </div>

                {/* Campaign Mode Form */}
                {frontFlyerType === 'campaign' && (
                  <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>

                    <div className="flex items-center gap-3 mb-8 relative">
                      <div className="w-8 h-8 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center text-sm">📢</div>
                      <h2 className="text-xl font-semibold text-slate-900">キャンペーン情報（表面）</h2>
                    </div>

                    {/* Campaign Description - AI Trigger */}
                    <div className="mb-8 relative">
                      <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">何のキャンペーン？</label>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          placeholder="例: エアコンの買い替え促進、省エネ訴求"
                          value={campaignInfo.campaignDescription}
                          onChange={(e) => setCampaignInfo({ ...campaignInfo, campaignDescription: e.target.value })}
                          className="flex-1 rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                        />
                        <button
                          onClick={handleGenerateCampaignContent}
                          disabled={isGeneratingCampaign || !campaignInfo.campaignDescription.trim()}
                          className="px-5 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-bold shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isGeneratingCampaign ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              生成中
                            </>
                          ) : (
                            <>✨ AI生成</>
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 ml-1">入力後「AI生成」を押すと、ヘッドラインとキャンペーン名が自動生成されます</p>
                    </div>

                    {/* Headline */}
                    <div className="mb-6">
                      <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">ヘッドライン（お客様の悩み）</label>
                      <input
                        type="text"
                        placeholder="例: まだ10年前のエアコン使っていませんか？"
                        value={campaignInfo.headline}
                        onChange={(e) => setCampaignInfo({ ...campaignInfo, headline: e.target.value })}
                        className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                      />
                    </div>

                    {/* Campaign Name */}
                    <div className="mb-6">
                      <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">キャンペーン名</label>
                      <input
                        type="text"
                        placeholder="例: 夏の省エネ家電 買い替え応援フェア"
                        value={campaignInfo.campaignName}
                        onChange={(e) => setCampaignInfo({ ...campaignInfo, campaignName: e.target.value })}
                        className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                      />
                    </div>

                    {/* Campaign Period */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">開始日</label>
                        <input
                          type="date"
                          value={campaignInfo.startDate}
                          onChange={(e) => setCampaignInfo({ ...campaignInfo, startDate: e.target.value })}
                          className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium transition-all hover:border-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">終了日</label>
                        <input
                          type="date"
                          value={campaignInfo.endDate}
                          onChange={(e) => setCampaignInfo({ ...campaignInfo, endDate: e.target.value })}
                          className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium transition-all hover:border-slate-300"
                        />
                      </div>
                    </div>

                    {/* Campaign Content */}
                    <div className="mb-6">
                      <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">キャンペーン内容</label>
                      <textarea
                        rows={3}
                        placeholder="キャンペーンの詳細内容を記述..."
                        value={campaignInfo.content}
                        onChange={(e) => setCampaignInfo({ ...campaignInfo, content: e.target.value })}
                        className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                      />
                    </div>

                    {/* Benefits List */}
                    <div className="mb-6">
                      <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">特典リスト</label>
                      {campaignInfo.benefits.map((benefit, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            placeholder={`特典 ${idx + 1}...`}
                            value={benefit}
                            onChange={(e) => {
                              const newBenefits = [...campaignInfo.benefits];
                              newBenefits[idx] = e.target.value;
                              setCampaignInfo({ ...campaignInfo, benefits: newBenefits });
                            }}
                            className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                          />
                          {campaignInfo.benefits.length > 1 && (
                            <button
                              onClick={() => {
                                const newBenefits = campaignInfo.benefits.filter((_, i) => i !== idx);
                                setCampaignInfo({ ...campaignInfo, benefits: newBenefits });
                              }}
                              className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setCampaignInfo({ ...campaignInfo, benefits: [...campaignInfo.benefits, ''] })}
                        className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2"
                      >
                        ＋ 特典を追加
                      </button>
                    </div>

                    {/* Product Image (Optional) */}
                    <div className="mb-6 p-5 bg-slate-50/80 rounded-md border border-slate-100">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={campaignInfo.useProductImage}
                          onChange={(e) => setCampaignInfo({ ...campaignInfo, useProductImage: e.target.checked })}
                          className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-semibold text-slate-700">メイン商品画像を使用する（任意）</span>
                      </label>
                      {campaignInfo.useProductImage && (
                        <div className="mt-4">
                          <ImageUploader
                            label="メイン商品画像"
                            images={campaignInfo.productImages}
                            onImagesChange={handleCampaignMainImagesChange}
                          />

                          {/* Image Selection Grid with Checkmarks */}
                          {campaignInfo.productImages.length > 0 && (
                            <div className="mt-4">
                              <div className="text-xs text-slate-500 mb-2">クリックで使用する画像を選択（{selectedCampaignMainImageIndices.size}枚選択中）</div>
                              <div className="grid grid-cols-4 gap-2">
                                {campaignInfo.productImages.map((img, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => toggleCampaignMainImageSelection(idx)}
                                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedCampaignMainImageIndices.has(idx)
                                      ? 'border-emerald-500 ring-2 ring-emerald-200'
                                      : 'border-slate-200 opacity-60 hover:opacity-100'
                                      }`}
                                  >
                                    <img
                                      src={img}
                                      alt={`メイン画像 ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                    {selectedCampaignMainImageIndices.has(idx) && (
                                      <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* Product/Service Mode Form */}
                {frontFlyerType === 'product-service' && (
                  <>
                    {/* Sales Letter Mode Toggle */}
                    <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-6 mb-6 overflow-hidden relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center text-sm">📝</div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">セールスレターモード</div>
                            <div className="text-[10px] text-slate-500">AIDA / 新PASONAフレームワークで訴求力UP</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setSalesLetterMode(!salesLetterMode)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${salesLetterMode ? 'bg-amber-500' : 'bg-slate-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${salesLetterMode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Front Product Images Section */}
                    <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-6 mb-6 overflow-hidden relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center text-sm">📦</div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">商品画像</div>
                          <div className="text-[10px] text-slate-500">チラシに掲載する商品画像をアップロード</div>
                        </div>
                      </div>

                      <ImageUploader
                        images={frontProductImages}
                        onImagesChange={handleFrontProductImagesChange}
                        maxImages={10}
                        label=""
                      />

                      {/* Image Selection Grid with Checkmarks */}
                      {frontProductImages.length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs text-slate-500 mb-2">クリックで使用する画像を選択（{selectedFrontProductIndices.size}枚選択中）</div>
                          <div className="grid grid-cols-4 gap-2">
                            {frontProductImages.map((img, idx) => (
                              <div
                                key={idx}
                                onClick={() => toggleFrontProductImageSelection(idx)}
                                className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedFrontProductIndices.has(idx)
                                  ? 'border-emerald-500 ring-2 ring-emerald-200'
                                  : 'border-slate-200 opacity-60 hover:opacity-100'
                                  }`}
                              >
                                <img
                                  src={img}
                                  alt={`商品画像 ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                                {selectedFrontProductIndices.has(idx) && (
                                  <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Conditional Form Display */}
                    <Suspense fallback={<div className="p-6 text-sm text-slate-500">フォームを読み込み中...</div>}>
                      {salesLetterMode ? (
                        <SalesLetterForm
                          salesLetterInfo={salesLetterInfo}
                          setSalesLetterInfo={setSalesLetterInfo}
                          settings={settings}
                          setSettings={setSettings}
                          apiKey={apiKey}
                          onSettingsOpen={() => setIsSettingsOpen(true)}
                        />
                      ) : (
                        <ProductServiceForm
                          productServiceInfo={productServiceInfo}
                          setProductServiceInfo={setProductServiceInfo}
                          settings={settings}
                          setSettings={setSettings}
                          apiKey={apiKey}
                          onSettingsOpen={() => setIsSettingsOpen(true)}
                        />
                      )}
                    </Suspense>
                  </>
                )}

                {/* Reference Back Side for Consistency */}
                <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-6 mb-6">
                  <div className="p-4 bg-amber-50/50 rounded-md border border-amber-100">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={useOppositeSideReference}
                        onChange={(e) => setUseOppositeSideReference(e.target.checked)}
                        className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-semibold text-slate-700">裏面を参照して統一感を出す</span>
                    </label>
                    {useOppositeSideReference && (
                      <div className="mt-3">
                        <ImageUploader
                          label="参照する裏面画像"
                          images={oppositeSideImage ? [oppositeSideImage] : []}
                          onImagesChange={(images) => setOppositeSideImage(images[0] || '')}
                          maxImages={1}
                        />
                        <p className="text-[10px] text-amber-600 mt-2">アップロードした裏面の画像を参考にして、デザインの統一感を持たせます。</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Back Side Tab */}
            {mainTab === 'back' && (
              <>
                <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>

                  <div className="flex items-center gap-3 mb-8 relative">
                    <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">⚙️</div>
                    <h2 className="text-xl font-semibold text-slate-900">裏面固有設定</h2>
                  </div>

                  {/* Flyer Title Input */}
                  <div className="mb-10 relative">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">チラシタイトル（任意）</label>
                    <input
                      type="text"
                      placeholder="例: 冬の家電セール、新生活応援フェア..."
                      value={settings.flyerTitle || ''}
                      onChange={(e) => setSettings({ ...settings, flyerTitle: e.target.value })}
                      className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                    />
                    <p className="text-[10px] text-slate-400 mt-2 ml-1">入力するとチラシ上部に大きく表示されます。未入力の場合はAIにおまかせ。</p>
                  </div>

                  {/* Background Mode */}
                  <div className="relative">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">背景モード</label>
                    <div className="flex gap-3">
                      <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'creative' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'creative'} onChange={() => setSettings({ ...settings, backgroundMode: 'creative' })} />
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-400 via-rose-400 to-indigo-500 flex items-center justify-center text-sm shadow-inner">✨</div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">おまかせ</div>
                          <div className="text-[9px] font-bold text-slate-500 mt-0.5">AIおすすめ</div>
                        </div>
                      </label>
                      <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'white' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'white'} onChange={() => setSettings({ ...settings, backgroundMode: 'white' })} />
                        <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-sm shadow-sm border border-slate-200">⬜</div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">白配色</div>
                          <div className="text-[9px] font-bold text-slate-500 mt-0.5">シンプル</div>
                        </div>
                      </label>
                      <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'custom' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'custom'} onChange={() => setSettings({ ...settings, backgroundMode: 'custom' })} />
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-sm shadow-inner">✏️</div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">自由記述</div>
                          <div className="text-[9px] font-bold text-slate-500 mt-0.5">カスタム</div>
                        </div>
                      </label>
                    </div>
                    {/* Custom Background Text Area */}
                    {settings.backgroundMode === 'custom' && (
                      <div className="mt-4">
                        <textarea
                          rows={3}
                          placeholder="例: 桜の花びらが舞う春らしい背景、冬の雪景色風..."
                          value={settings.customBackground || ''}
                          onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })}
                          className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Products */}
                <div className="mb-12">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">📱</div>
                      <h2 className="text-xl font-semibold text-slate-900">掲載商品</h2>
                    </div>
                    <button
                      onClick={addProduct}
                      className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-bold rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all shadow-sm active:scale-95"
                    >
                      ＋ 商品追加
                    </button>
                  </div>

                  <Suspense fallback={<div className="p-4 text-sm text-slate-500">商品フォームを読み込み中...</div>}>
                    <div className="space-y-6">
                      {products.map((p, idx) => (
                        <ProductCard
                          key={p.id}
                          index={idx}
                          product={p}
                          onChange={updateProduct}
                          onRemove={() => removeProduct(p.id)}
                          onDuplicate={() => duplicateProduct(p)}
                          apiKey={apiKey}
                        />
                      ))}
                    </div>
                  </Suspense>
                </div>

                {/* Reference Front Side for Consistency */}
                <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-6 mb-6">
                  <div className="p-4 bg-amber-50/50 rounded-md border border-amber-100">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={useOppositeSideReference}
                        onChange={(e) => setUseOppositeSideReference(e.target.checked)}
                        className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-semibold text-slate-700">表面を参照して統一感を出す</span>
                    </label>
                    {useOppositeSideReference && (
                      <div className="mt-3">
                        <ImageUploader
                          label="参照する表面画像"
                          images={oppositeSideImage ? [oppositeSideImage] : []}
                          onImagesChange={(images) => setOppositeSideImage(images[0] || '')}
                          maxImages={1}
                        />
                        <p className="text-[10px] text-amber-600 mt-2">アップロードした表面の画像を参考にして、デザインの統一感を持たせます。</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}


            {/* Additional Instructions */}
            <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-16">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">📝</div>
                <h3 className="text-lg font-semibold text-slate-900">追加指示</h3>
              </div>
              <textarea
                rows={4}
                placeholder="例: 冬の家電セール、温かみのあるデザイン、家族向け..."
                value={settings.additionalInstructions}
                onChange={(e) => setSettings({ ...settings, additionalInstructions: e.target.value })}
                className="block w-full rounded-md border-slate-200 border-2 py-4 px-5 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-slate-50/30 text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
              />
            </div>

            <div className="flex justify-center mb-20">
              <button
                onClick={handleGenerate}
                className={`
               btn-premium inline-flex items-center px-12 py-5 border border-transparent text-xl font-semibold rounded-[24px] shadow-2xl text-white 
               ${isGenerating ? 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20' : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 hover:scale-105 active:scale-95 shadow-indigo-500/30'}
               focus:outline-none transition-all duration-300
             `}
              >
                {isGenerating ? (
                  <>
                    <span className="mr-3 text-2xl">＋</span>
                    <span className="tracking-tight uppercase">キューに追加</span>
                  </>
                ) : (
                  <>
                    <span className="mr-3 text-2xl">✨</span>
                    <span className="tracking-tight uppercase">{flyerSide === 'front' ? '表面チラシ生成' : '裏面チラシ生成'}</span>
                  </>
                )}
              </button>
            </div>

            {/* History Results */}
            {history.length > 0 && (
              <div className="bg-white rounded-lg shadow-premium border border-white/50 p-4 sm:p-8 md:p-12 animate-slide-up">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-950 rounded-md flex items-center justify-center text-base sm:text-lg">📁</div>
                    <h2 className="text-lg sm:text-2xl font-semibold text-slate-900 tracking-tight">生成履歴 <span className="text-indigo-600 ml-1 sm:ml-2">({history.length})</span></h2>
                  </div>
                  {/* Tag Buttons - Hidden on mobile, shown on sm+ */}
                  <div className="hidden sm:flex gap-2 flex-wrap">
                    {history.some(item => !item.tags || item.tags.length === 0) && (
                      <button
                        onClick={() => tagAllExistingHistory(false)}
                        disabled={isTaggingAll}
                        className={`text-xs font-bold px-3 py-2 rounded-full transition-all ${isTaggingAll
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                      >
                        {isTaggingAll ? '🏷️ タグ付け中...' : '🏷️ タグ付け'}
                      </button>
                    )}
                    <button
                      onClick={() => tagAllExistingHistory(true)}
                      disabled={isTaggingAll}
                      className={`text-xs font-bold px-3 py-2 rounded-full transition-all ${isTaggingAll
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      title="すべての履歴のタグを再生成"
                    >
                      🔄 全て再タグ付け
                    </button>
                    <button
                      onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                      className="text-xs font-bold px-3 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                      title="お気に入り優先で生成日時を並べ替え"
                    >
                      {sortOrder === 'desc' ? '新しい順' : '古い順'}
                    </button>
                    <button
                      onClick={() => { setUploadPreview(""); setUploadTags(""); setIsUploadModalOpen(true); }}
                      className="text-xs font-bold px-3 py-2 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all"
                    >
                      📤 画像アップロード
                    </button>
                  </div>
                  {/* Mobile action buttons */}
                  <div className="flex sm:hidden gap-2">
                    <button
                      onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                      className="text-xs font-bold px-3 py-2 rounded-full bg-slate-100 text-slate-600"
                    >
                      {sortOrder === 'desc' ? '↓新' : '↑古'}
                    </button>
                    <button
                      onClick={() => { setUploadPreview(""); setUploadTags(""); setIsUploadModalOpen(true); }}
                      className="text-xs font-bold px-3 py-2 rounded-full bg-emerald-100 text-emerald-700"
                    >
                      📤
                    </button>
                  </div>
                </div>

                {/* Tag Filter */}
                {allTags.length > 0 && (
                  <div className="mb-6 sm:mb-8">
                    <div className="flex items-center gap-2 mb-2 sm:hidden">
                      <span className="text-xs font-bold text-slate-400">タグ絞り込み:</span>
                    </div>
                    <div className="flex gap-2 items-center overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
                      <span className="hidden sm:inline text-xs font-bold text-slate-400 mr-2 flex-shrink-0">タグで絞り込み:</span>
                      <button
                        onClick={() => setSelectedTag(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ${selectedTag === null
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                        すべて
                      </button>
                      {allTags.slice(0, windowWidth < 640 ? 8 : allTags.length).map(tag => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 whitespace-nowrap ${selectedTag === tag
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={historyGridRef} className="relative">
                  {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

                  {visibleRows.map((rowData, rowIndex) => (
                    <div
                      key={`row-${rowData.row}`}
                      ref={rowIndex === 0 ? rowMeasureRef : undefined}
                      className="flex flex-wrap gap-4 justify-start"
                      style={{ minHeight: rowHeight, marginBottom: rowData.row === totalRows - 1 ? 0 : historyGridGap }}
                    >
                      {rowData.items.map((item) => (
                        <div key={item.id} style={{ width: cardWidth, maxWidth: cardWidth }} className={`history-card group flex flex-col bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 ${item.isFavorite ? 'ring-2 ring-amber-400' : ''}`}>
                          {/* Image Section */}
                          <div className="relative aspect-[3/4] bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
                            <img
                              src={item.thumbnail || item.data}
                              alt="Generated Flyer"
                              className="w-full h-full object-contain"
                              loading="lazy"
                              decoding="async"
                            />

                            {/* Favorite Badge - Top Left */}
                            {item.isFavorite && (
                              <div className="absolute top-3 left-3 bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
                                ⭐ お気に入り
                              </div>
                            )}

                            {/* Status Badges - Top Right */}
                            <div className="absolute top-3 right-3 flex flex-col gap-2">
                              {item.isUpscaled && (
                                <span className="bg-violet-500 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg">
                                  🔍 {item.upscaleScale ?? UPSCALE_SCALE}x
                                </span>
                              )}
                              {item.is4KRegenerated && (
                                <span className="bg-violet-500 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg">
                                  🎯 4K
                                </span>
                              )}
                              {item.isEdited && (
                                <span className="bg-amber-500 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg">
                                  ✏️ 編集済
                                </span>
                              )}
                              {(() => {
                                const qualityBadge = getQualityBadgeConfig(item.qualityCheck);
                                if (!qualityBadge) return null;
                                return (
                                  <span className={`${qualityBadge.className} px-2.5 py-1 rounded-full text-xs font-bold shadow-lg`}>
                                    {qualityBadge.label}
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-4">
                              <button
                                onClick={() => {
                                  const w = window.open('', '_blank');
                                  if (w) {
                                    w.document.write(`<html><head><title>Full Screen Flyer</title></head><body style="margin:0;background:#1e293b;display:flex;justify-content:center;align-items:center;height:100vh;"><img src="${item.data}" style="max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 0 20px rgba(0,0,0,0.5);" /></body></html>`);
                                    w.document.close();
                                  }
                                }}
                                className="bg-white text-slate-800 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-all shadow-xl"
                              >
                                🔍 画像を開く
                              </button>
                            </div>
                          </div>

                          {/* Info Section */}
                          <div className="p-3 sm:p-4 border-t border-slate-100">
                            <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 mb-2 sm:mb-3">
                              <span className="font-medium">
                                {new Date(item.createdAt).toLocaleString('ja-JP', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              <div className="flex items-center gap-1 sm:gap-2">
                                <button
                                  onClick={() => toggleFavorite(item.id)}
                                  className={`w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-base sm:text-lg transition-all hover:scale-110 ${item.isFavorite ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}
                                  title={item.isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
                                >
                                  {item.isFavorite ? '⭐' : '☆'}
                                </button>
                                <button
                                  onClick={() => handleRecheckQuality(item)}
                                  className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
                                  title="品質チェックを再実行"
                                >
                                  🧪
                                </button>
                                <button
                                  onClick={() => handleDeleteImage(item.id)}
                                  className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                                  title="削除"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {item.qualityCheck && item.qualityCheck.status !== 'pass' && (
                              <div className={`mb-2 sm:mb-3 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs ${
                                item.qualityCheck.status === 'pending'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : item.qualityCheck.status === 'warn'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                              }`}>
                                <div className="font-bold">
                                  {item.qualityCheck.summary || (item.qualityCheck.status === 'pending' ? '品質チェック中' : '品質要確認')}
                                </div>
                                {item.qualityCheck.status !== 'pending' && item.qualityCheck.issues.length > 0 && (
                                  <ul className="mt-1 space-y-0.5">
                                    {item.qualityCheck.issues.slice(0, 2).map((issue, idx) => (
                                      <li key={`${item.id}-quality-${idx}`}>• {issue}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}

                            {/* Action Buttons Grid */}
                            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                              {/* Download Button with Dropdown */}
                              <div className="relative">
                                <button
                                  onClick={() => setOpenDownloadMenu(openDownloadMenu === item.id ? null : item.id)}
                                  className="w-full flex items-center justify-center bg-slate-500 hover:bg-slate-600 text-white p-2 sm:p-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
                                  title="ダウンロード"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>

                                {openDownloadMenu === item.id && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-24 sm:w-32 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                                    <button
                                      onClick={() => handleDownloadPng(item.data, item.createdAt)}
                                      className="w-full p-2 sm:p-2.5 text-emerald-600 hover:bg-emerald-50 transition-all border-b border-slate-100 text-xs sm:text-sm font-bold"
                                    >
                                      PNG
                                    </button>
                                    <button
                                      onClick={() => handleDownloadJpg(item.data, item.createdAt)}
                                      className="w-full p-2 sm:p-2.5 text-amber-600 hover:bg-amber-50 transition-all border-b border-slate-100 text-xs sm:text-sm font-bold"
                                    >
                                      JPG
                                    </button>
                                    <button
                                      onClick={() => handleDownloadPdf(item.data, item.createdAt)}
                                      className="w-full p-2 sm:p-2.5 text-rose-600 hover:bg-rose-50 transition-all text-xs sm:text-sm font-bold"
                                    >
                                      PDF
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Upscale Button */}
                              <button
                                onClick={() => handleUpscale(item)}
                                disabled={upscalingImageId === item.id || item.isUpscaled || item.is4KRegenerated || item.imageSize === '4K'}
                                className={`flex items-center justify-center p-2 sm:p-2.5 rounded-lg transition-all shadow-sm ${upscalingImageId === item.id
                                  ? 'bg-slate-100 text-slate-600 cursor-wait'
                                  : item.isUpscaled || item.is4KRegenerated || item.imageSize === '4K'
                                    ? 'bg-slate-100 text-slate-600 cursor-not-allowed'
                                    : 'bg-slate-500 hover:bg-slate-600 text-white active:scale-95'
                                  }`}
                                title={item.isUpscaled
                                  ? `アップスケール済み(${item.upscaleScale ?? UPSCALE_SCALE}x)`
                                  : item.is4KRegenerated || item.imageSize === '4K'
                                    ? '4K画像はアップスケール不可'
                                    : `AIアップスケール(${UPSCALE_SCALE}x)`}
                              >
                                {upscalingImageId === item.id ? (
                                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : item.isUpscaled ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                  </svg>
                                )}
                              </button>

                              {/* Edit Button */}
                              <button
                                onClick={() => setEditingImage(item)}
                                className="flex items-center justify-center bg-slate-500 hover:bg-slate-600 text-white p-2 sm:p-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
                                title="画像を編集"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>

                            {/* Second Row of Buttons */}
                            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                              {/* 4K Regeneration Button */}
                              <button
                                onClick={() => handleRegenerate4K(item)}
                                disabled={regenerating4KImageId === item.id || item.is4KRegenerated}
                                className={`flex items-center justify-center p-2 sm:p-2.5 rounded-lg transition-all shadow-sm ${regenerating4KImageId === item.id
                                  ? 'bg-violet-100 text-violet-600 cursor-wait'
                                  : item.is4KRegenerated
                                    ? 'bg-violet-100 text-violet-600 cursor-not-allowed'
                                    : 'bg-violet-500 hover:bg-violet-600 text-white active:scale-95'
                                  }`}
                                title={item.is4KRegenerated ? '4K再生成済み' : 'Gemini APIで4K再生成（内容はそのまま）'}
                              >
                                {regenerating4KImageId === item.id ? (
                                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : item.is4KRegenerated ? (
                                  <span className="text-[10px] sm:text-xs font-bold">4K✓</span>
                                ) : (
                                  <span className="text-[10px] sm:text-xs font-bold">4K</span>
                                )}
                              </button>

                              {/* Remove Text Button */}
                              <button
                                onClick={() => handleRemoveText(item)}
                                disabled={removingTextImageId === item.id}
                                className={`flex items-center justify-center p-2 sm:p-2.5 rounded-lg transition-all shadow-sm ${removingTextImageId === item.id
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-slate-500 hover:bg-slate-600 text-white active:scale-95'
                                  }`}
                                title="文字を消去"
                              >
                                {removingTextImageId === item.id ? (
                                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                              </button>

                              {/* Reference Button */}
                              <button
                                onClick={() => handleUseAsReference(item.data)}
                                className="flex items-center justify-center bg-slate-500 hover:bg-slate-600 text-white p-2 sm:p-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
                                title="参考画像として使用"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Save Preset Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-[90%] sm:w-full p-5 sm:p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-indigo-50 rounded-md flex items-center justify-center text-xl mb-6 shadow-inner border border-indigo-100">💾</div>
            <h3 className="text-2xl font-semibold text-slate-900 mb-2">プリセット保存</h3>
            <p className="text-sm font-medium text-slate-400 mb-8">現在の設定を保存します。</p>

            <div className="mb-8">
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2 ml-1">プリセット名</label>
              <input
                type="text"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                placeholder="例: 2026年冬セール"
                className="w-full border-2 border-slate-100 rounded-md shadow-sm py-4 px-5 focus:ring-0 focus:border-indigo-600 bg-slate-50/50 text-slate-900 font-bold placeholder:text-slate-300 transition-all auto-focus"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-3">
              {activePresetId && (
                <button
                  onClick={() => executeSavePreset(false)}
                  disabled={isSaving}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold tracking-wide text-xs py-4 px-6 rounded-md shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? '保存中...' : '上書き保存'}
                </button>
              )}
              <button
                onClick={() => executeSavePreset(true)}
                disabled={isSaving}
                className={`w-full font-semibold tracking-wide text-xs py-4 px-6 rounded-md transition-all border-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${activePresetId ? 'bg-white text-indigo-600 border-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-indigo-600/20'}`}
              >
                {isSaving ? '保存中...' : (activePresetId ? '新規プリセットとして保存' : '保存')}
              </button>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                disabled={isSaving}
                className="w-full mt-2 text-slate-400 hover:text-slate-600 text-xs font-semibold tracking-[0.2em] py-2 transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-[90%] sm:w-full p-5 sm:p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-amber-50 rounded-md flex items-center justify-center text-xl mb-6 shadow-inner border border-amber-100">🔑</div>
            <h3 className="text-2xl font-semibold text-slate-900 mb-2">API設定</h3>
            <p className="text-sm font-medium text-slate-400 mb-8">Gemini AIへの接続を設定します。</p>

            <div className="mb-8">
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2 ml-1">Gemini API Key</label>
              <input
                type="password"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder="APIキーを貼り付け..."
                className="w-full border-2 border-slate-100 rounded-md shadow-sm py-4 px-5 focus:ring-0 focus:border-indigo-600 bg-slate-50/50 text-slate-900 font-bold placeholder:text-slate-300 transition-all"
                autoFocus
              />
              <div className="mt-4 p-4 bg-indigo-50/50 rounded-md border border-indigo-100">
                <p className="text-[11px] font-bold text-indigo-700 leading-relaxed flex items-start gap-3">
                  <span className="text-lg">💡</span>
                  <span>
                    無料のAPIキーは <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google AI Studio</a> で取得できます。キーはローカルに保存されます。
                  </span>
                </p>
              </div>
            </div>

            {/* Replicate API Key for Upscaling */}
            <div className="mb-8">
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2 ml-1">Replicate API Key（アップスケール用・任意）</label>
              <input
                type="password"
                value={tempReplicateApiKey}
                onChange={(e) => setTempReplicateApiKey(e.target.value)}
                placeholder="Replicate APIキーを貼り付け..."
                className="w-full border-2 border-slate-100 rounded-md shadow-sm py-4 px-5 focus:ring-0 focus:border-violet-600 bg-slate-50/50 text-slate-900 font-bold placeholder:text-slate-300 transition-all"
              />
              <div className="mt-4 p-4 bg-violet-50/50 rounded-md border border-violet-100">
                <p className="text-[11px] font-bold text-violet-700 leading-relaxed flex items-start gap-3">
                  <span className="text-lg">🚀</span>
                  <span>
                    AIアップスケール機能には <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Replicate</a> のAPIキーが必要です。1回約0.1〜0.3円。
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  if (!tempApiKey.trim()) {
                    alert("Gemini APIキーを入力してください。");
                    return;
                  }
                  setApiKey(tempApiKey);
                  await set(DB_KEY_API_KEY, tempApiKey);

                  // Save Replicate key if provided
                  if (tempReplicateApiKey.trim()) {
                    setReplicateApiKey(tempReplicateApiKey);
                    await set(DB_KEY_REPLICATE_API_KEY, tempReplicateApiKey);
                  }

                  setIsSettingsOpen(false);
                  alert("APIキーを保存しました。");
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold tracking-wide text-xs py-4 px-6 rounded-md shadow-indigo-600/20 transition-all active:scale-95"
              >
                保存して接続
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full mt-2 text-slate-400 hover:text-slate-600 text-xs font-semibold tracking-[0.2em] py-2 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preset Load Confirmation Modal */}
      {presetToLoad && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-[90%] sm:w-full p-5 sm:p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-indigo-50 rounded-md flex items-center justify-center text-xl mb-6 shadow-inner border border-indigo-100">📥</div>
            <h3 className="text-2xl font-semibold text-slate-900 mb-2">プリセット読み込み</h3>
            <p className="text-sm font-medium text-slate-400 mb-8 leading-relaxed">
              「<span className="text-indigo-600 font-semibold">{presetToLoad.name}</span>」を読み込みます。
              アセットはそのまま保持されます。
            </p>


            <div className="flex flex-col gap-3">
              <button
                onClick={confirmLoadPreset}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold tracking-wide text-xs py-4 px-6 rounded-md shadow-indigo-600/20 transition-all active:scale-95"
                autoFocus
              >
                読み込み実行
              </button>
              <button
                onClick={() => setPresetToLoad(null)}
                className="w-full mt-2 bg-slate-50 hover:bg-slate-100 text-slate-500 font-semibold tracking-wide text-xs py-4 px-6 rounded-md transition-all active:scale-95"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Edit Modal */}
      {editingImage && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/40 z-50" />}>
          <ImageEditModal
            imageUrl={editingImage.data}
            onClose={() => setEditingImage(null)}
            onGenerate={handleEditImage}
            isGenerating={isEditGenerating}
          />
        </Suspense>
      )}

      {/* Manual Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-[90%] sm:w-full p-5 sm:p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-emerald-50 rounded-md flex items-center justify-center text-xl mb-6 shadow-inner border border-emerald-100">📤</div>
            <h3 className="text-2xl font-semibold text-slate-900 mb-2">画像をアップロード</h3>
            <p className="text-sm font-medium text-slate-400 mb-6">手持ちの画像を履歴に追加します。</p>

            <div className="mb-4">
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2">画像を選択</label>
              {!uploadPreview ? (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer bg-slate-50/50 hover:bg-slate-100/50 transition-all">
                  <input type="file" accept="image/*" onChange={handleUploadFileSelect} className="hidden" />
                  <span className="text-3xl mb-2">🖼️</span>
                  <span className="text-sm font-medium text-slate-400">クリックして画像を選択</span>
                </label>
              ) : (
                <div className="relative">
                  <img
                    src={uploadPreview}
                    alt="Preview"
                    className="w-full h-32 object-contain rounded-lg border border-slate-200 bg-slate-50"
                    loading="lazy"
                    decoding="async"
                  />
                  <button onClick={() => setUploadPreview("")} className="absolute top-2 right-2 bg-white/80 hover:bg-rose-50 text-slate-400 hover:text-rose-500 p-1.5 rounded-md shadow-sm">✕</button>
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2">タグ（任意、カンマ区切り）</label>
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="例: エアコン, 2024冬, 特価"
                className="w-full border-2 border-slate-100 rounded-md shadow-sm py-3 px-4 focus:ring-0 focus:border-indigo-600 bg-slate-50/50 text-slate-900 font-medium placeholder:text-slate-300 text-sm"
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleConfirmUpload}
                disabled={uploadingImage || !uploadPreview}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold tracking-wide text-xs py-4 px-6 rounded-md transition-all active:scale-95 disabled:opacity-50"
              >
                {uploadingImage ? 'アップロード中...' : 'アップロード'}
              </button>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                disabled={uploadingImage}
                className="w-full text-slate-400 hover:text-slate-600 text-xs font-semibold py-2 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
