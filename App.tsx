import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { get, set } from 'idb-keyval';
import { Product, FlyerSettings, GeneratedImage, Preset, CampaignInfo, FrontFlyerType, ProductServiceInfo, SalesLetterInfo } from './types';
import { ProductCard } from './components/ProductCard';
import { ImageUploader } from './components/ImageUploader';
import { ImageEditModal, EditRegion } from './components/ImageEditModal';
import { ProductServiceForm } from './components/ProductServiceForm';
import { SalesLetterForm } from './components/SalesLetterForm';
import { generateFlyerImage, generateTagsFromProducts, generateTagsFromImage, editImage, removeTextFromImage, generateCampaignContent, generateFrontFlyerImage, generateProductServiceFlyer, generateSalesLetterFlyer, regenerateImage4K } from './services/geminiService';
import { upscaleImage } from './services/upscaleService';
import {
  initFirebase,
  isFirebaseConfigured,
  uploadImage,
  getCloudImages,
  saveCloudPreset,
  getCloudPresets,
  deleteCloudPreset,
  deleteCloudImage,
  saveFlyerMetadata,
  updateFlyerUpscaleStatus,
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
  CloudImage,
  CloudPreset
} from './services/firebaseService';

const DB_KEY_HISTORY = 'flyergen_history_v1';
const DB_KEY_PRESETS = 'flyergen_presets_v1';
const DB_KEY_API_KEY = 'flyergen_api_key';
const DB_KEY_REPLICATE_API_KEY = 'flyergen_replicate_api_key';
const UPSCALE_SCALE = 4;

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
  const [settings, setSettings] = useState<FlyerSettings>({
    orientation: 'vertical',
    imageSize: '2K',
    patternCount: 1,
    backgroundMode: 'creative',
    logoPosition: 'full-bottom',
    additionalInstructions: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);

  // History State
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  // Preset State
  const [presets, setPresets] = useState<Preset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);
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

  // Image Preview Modal State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
              createdAt: img.createdAt
            })).sort((a, b) => b.createdAt - a.createdAt); // Sort by newest first
            setHistory(historyFromCloud);
          }

          if (cloudPresets.length > 0) {
            const presetsFromCloud: Preset[] = cloudPresets.map(p => ({
              id: p.id,
              name: p.name,
              products: p.products,
              settings: p.settings,
              characterImages: p.characterImages || [],
              characterClothingMode: (p.characterClothingMode || 'fixed') as 'fixed' | 'match',
              referenceImages: p.referenceImages || [],
              storeLogoImages: p.storeLogoImages || [],
              createdAt: p.createdAt,
              updatedAt: p.updatedAt
            }));
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
          if (savedPresets) setPresets(savedPresets);
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing reference images to cloud...');
        saveReferenceImages(referenceImages, selectedReferenceIndex !== null ? [selectedReferenceIndex] : []);
      }, 1000);

      return () => clearTimeout(syncTimeout);
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing character images to cloud...');
        saveCharacterImages(characterImages, Array.from(selectedCharacterIndices));
      }, 1000);

      return () => clearTimeout(syncTimeout);
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing store logo images to cloud...');
        saveStoreLogoImages(storeLogoImages, Array.from(selectedLogoIndices));
      }, 1000);

      return () => clearTimeout(syncTimeout);
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing custom illustrations to cloud...');
        saveCustomIllustrations(customIllustrations, Array.from(selectedCustomIllustrationIndices));
      }, 1000);

      return () => clearTimeout(syncTimeout);
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing customer images to cloud...');
        saveCustomerImages(customerImages, Array.from(selectedCustomerImageIndices));
      }, 1000);

      return () => clearTimeout(syncTimeout);
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing campaign main images to cloud...');
        saveCampaignMainImages(campaignInfo.productImages);
      }, 1000);

      return () => clearTimeout(syncTimeout);
    }
  }, [campaignInfo.productImages, campaignMainImagesInitialized]);

  // Handle campaign main images change with cloud sync
  const handleCampaignMainImagesChange = (images: string[]) => {
    setCampaignInfo(prev => ({ ...prev, productImages: images }));
    if (!campaignMainImagesInitialized) {
      setCampaignMainImagesInitialized(true);
    }
  };

  // Handle customer images change with cloud sync
  const handleCustomerImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedCustomerImageIndices).filter(i => i < images.length)
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
      const syncTimeout = setTimeout(() => {
        console.log('Syncing front product images to cloud...');
        saveFrontProductImages(frontProductImages, Array.from(selectedFrontProductIndices));
      }, 1000);

      return () => clearTimeout(syncTimeout);
    }
  }, [frontProductImages, selectedFrontProductIndices, frontProductImagesInitialized]);

  // Handle front product images change with cloud sync
  const handleFrontProductImagesChange = (images: string[]) => {
    // When images change, update selected indices to remove any that are out of bounds
    const newSelectedIndices = new Set(
      Array.from(selectedFrontProductIndices).filter(i => i < images.length)
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
      Array.from(selectedCharacterIndices).filter(i => i < images.length)
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
      Array.from(selectedLogoIndices).filter(i => i < images.length)
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
      Array.from(selectedCustomIllustrationIndices).filter(i => i < images.length)
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

  const handleSaveApiKey = async () => {
    if (!tempApiKey.trim()) {
      alert("APIキーを入力してください。");
      return;
    }
    setApiKey(tempApiKey);
    await set(DB_KEY_API_KEY, tempApiKey);
    setIsSettingsOpen(false);
    alert("APIキーを保存しました。");
  };

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
  const createThumbnail = (base64: string, maxWidth = 300): Promise<string> => {
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
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setIsSettingsOpen(true);
      alert("APIキーが設定されていません。設定画面からGemini APIキーを入力してください。");
      return;
    }

    // Confirmation dialog to prevent accidental clicks
    const sideLabel = flyerSide === 'front' ? '表面' : '裏面';
    if (!window.confirm(`${sideLabel}チラシを作成しますか？`)) {
      return;
    }

    setIsGenerating(true);

    try {
      // Filter images to only include selected ones
      const selectedCharacterImages = characterImages.filter((_, idx) => selectedCharacterIndices.has(idx));
      const selectedReferenceImages = selectedReferenceIndex !== null ? [referenceImages[selectedReferenceIndex]] : [];
      const selectedStoreLogoImages = storeLogoImages.filter((_, idx) => selectedLogoIndices.has(idx));
      const selectedCustomIllustrations = customIllustrations.filter((_, idx) => selectedCustomIllustrationIndices.has(idx));
      const selectedCustomerImages = customerImages.filter((_, idx) => selectedCustomerImageIndices.has(idx));
      const selectedProductImages = frontProductImages.filter((_, idx) => selectedFrontProductIndices.has(idx));

      // Add opposite side reference if enabled
      const referenceWithOpposite = useOppositeSideReference && oppositeSideImage
        ? [...selectedReferenceImages, oppositeSideImage]
        : selectedReferenceImages;

      let results: string[];
      let tags: string[];

      if (flyerSide === 'front') {
        // 表面生成処理
        if (frontFlyerType === 'product-service') {
          if (salesLetterMode) {
            // セールスレターモード
            [results, tags] = await Promise.all([
              generateSalesLetterFlyer(
                salesLetterInfo,
                settings,
                selectedProductImages,
                selectedCharacterImages,
                selectedCustomerImages,
                selectedStoreLogoImages,
                selectedCustomIllustrations,
                referenceWithOpposite,
                apiKey
              ),
              Promise.resolve(['表面', 'セールスレター', salesLetterInfo.productName].filter(Boolean))
            ]);
          } else {
            // 商品・サービス紹介モード（通常）
            [results, tags] = await Promise.all([
              generateProductServiceFlyer(
                productServiceInfo,
                settings,
                selectedProductImages,
                selectedCharacterImages,
                selectedCustomerImages,
                selectedStoreLogoImages,
                selectedCustomIllustrations,
                referenceWithOpposite,
                apiKey
              ),
              Promise.resolve(['表面', '商品紹介', productServiceInfo.title].filter(Boolean))
            ]);
          }
        } else {
          // キャンペーン訴求モード
          [results, tags] = await Promise.all([
            generateFrontFlyerImage(
              campaignInfo,
              settings,
              selectedProductImages,
              selectedCharacterImages,
              selectedCustomerImages,
              selectedStoreLogoImages,
              selectedCustomIllustrations,
              referenceWithOpposite,
              apiKey
            ),
            Promise.resolve(['表面', campaignInfo.campaignName || 'キャンペーン'].filter(Boolean))
          ]);
        }
      } else {
        // 裏面生成処理（既存ロジック）
        [results, tags] = await Promise.all([
          generateFlyerImage(products, settings, selectedCharacterImages, characterClothingMode, referenceWithOpposite, selectedStoreLogoImages, selectedCustomIllustrations, apiKey),
          generateTagsFromProducts(products, apiKey)
        ]);
        tags = ['裏面', ...tags];
      }

      const newItems: GeneratedImage[] = [];

      for (const data of results) {
        const id = uuidv4();
        const timestamp = Date.now();

        // Generate thumbnail
        const thumbnailData = await createThumbnail(data);

        // Upload to Firebase if enabled
        if (firebaseEnabled) {
          const filename = `flyer_${timestamp}_${id}.png`;
          const thumbFilename = `flyer_${timestamp}_${id}_thumb.jpg`;

          // Upload both full image and thumbnail in parallel
          const [cloudUrl, thumbUrl] = await Promise.all([
            uploadImage(data, filename),
            uploadImage(thumbnailData, thumbFilename)
          ]);

          if (cloudUrl) {
            // Save metadata (tags) to Firestore
            await saveFlyerMetadata(filename, tags, timestamp, { imageSize: settings.imageSize });

            newItems.push({
              id: filename, // Use filename as ID to match Firestore
              data: cloudUrl,
              thumbnail: thumbUrl || thumbnailData,
              tags,
              flyerType: flyerSide,
              createdAt: timestamp,
              imageSize: settings.imageSize
            });
          } else {
            // Fallback to local if upload fails
            newItems.push({ id, data, thumbnail: thumbnailData, tags, flyerType: flyerSide, createdAt: timestamp, imageSize: settings.imageSize });
          }
        } else {
          newItems.push({ id, data, thumbnail: thumbnailData, tags, flyerType: flyerSide, createdAt: timestamp, imageSize: settings.imageSize });
        }
      }

      const updatedHistory = [...newItems, ...history];
      setHistory(updatedHistory);

      // Also save to local storage as backup
      await set(DB_KEY_HISTORY, updatedHistory);

    } catch (e) {
      alert("チラシの生成に失敗しました。時間をおいて再試行してください。");
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
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
      const result = await generateCampaignContent(campaignInfo.campaignDescription, apiKey);
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
      // Detect aspect ratio from original image size if possible
      const aspectRatio = settings.orientation === 'vertical' ? '3:4' : '4:3';

      const result = await regenerateImage4K(item.data, apiKey, aspectRatio);

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

  const dataUrlToBlob = (dataUrl: string, fallbackMimeType: string) => {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header?.match(/data:(.*?);base64/);
    const mimeType = mimeMatch?.[1] || fallbackMimeType;
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
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
    if (currentPresetId) {
      const current = presets.find(p => p.id === currentPresetId);
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
      if (!asNew && currentPresetId) {
        targetId = currentPresetId;
      }

      const now = Date.now();

      // Clone data to avoid reference issues
      // Note: characterImages, referenceImages, and storeLogoImages are NOT saved to preset - they are synced independently from cloud
      const newPreset: Preset = {
        id: targetId,
        name: savePresetName,
        products: JSON.parse(JSON.stringify(products)),
        characterImages: [], // Empty - character images are synced independently
        characterClothingMode: characterClothingMode,
        referenceImages: [], // Empty - reference images are synced independently
        storeLogoImages: [], // Empty - store logo images are synced independently
        settings: { ...settings },
        // Front side fields
        campaignInfo: JSON.parse(JSON.stringify(campaignInfo)),
        frontFlyerType: frontFlyerType,
        productServiceInfo: JSON.parse(JSON.stringify(productServiceInfo)),
        // Sales letter fields
        salesLetterInfo: JSON.parse(JSON.stringify(salesLetterInfo)),
        salesLetterMode: salesLetterMode,
        createdAt: presets.find(p => p.id === targetId)?.createdAt || now,
        updatedAt: now
      };

      let updatedPresets: Preset[];
      // Check if updating existing or adding new
      if (presets.some(p => p.id === targetId)) {
        updatedPresets = presets.map(p => p.id === targetId ? newPreset : p);
      } else {
        updatedPresets = [newPreset, ...presets];
      }

      setPresets(updatedPresets);
      setCurrentPresetId(targetId);

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

    setProducts(data.products || []);
    // Note: characterImages are NOT loaded from preset - they are synced independently from cloud
    setCharacterClothingMode(data.characterClothingMode || 'fixed');
    // Note: referenceImages are NOT loaded from preset - they are synced independently from cloud
    // Note: storeLogoImages are NOT loaded from preset - they are synced independently from cloud

    // Ensure settings has all required fields with defaults
    setSettings({
      orientation: data.settings?.orientation || 'vertical',
      imageSize: data.settings?.imageSize || '2K',
      patternCount: data.settings?.patternCount || 1,
      backgroundMode: data.settings?.backgroundMode || 'creative',
      customBackground: data.settings?.customBackground || '',
      flyerTitle: data.settings?.flyerTitle || '',
      logoPosition: data.settings?.logoPosition || 'full-bottom',
      additionalInstructions: data.settings?.additionalInstructions || ''
    });

    // Load front side fields
    if (data.frontFlyerType) {
      setFrontFlyerType(data.frontFlyerType);
    }
    if (data.campaignInfo) {
      const legacyProductImage = data.campaignInfo.productImage;
      const campaignProductImages = Array.isArray(data.campaignInfo.productImages)
        ? data.campaignInfo.productImages
        : (legacyProductImage ? [legacyProductImage] : []);
      setCampaignInfo({
        campaignDescription: data.campaignInfo.campaignDescription || '',
        headline: data.campaignInfo.headline || '',
        campaignName: data.campaignInfo.campaignName || '',
        startDate: data.campaignInfo.startDate || '',
        endDate: data.campaignInfo.endDate || '',
        content: data.campaignInfo.content || '',
        benefits: data.campaignInfo.benefits || [''],
        useProductImage: data.campaignInfo.useProductImage || false,
        productImages: campaignProductImages
      });
    }
    if (data.productServiceInfo) {
      setProductServiceInfo(data.productServiceInfo);
    }
    // Load sales letter fields
    if (data.salesLetterInfo) {
      setSalesLetterInfo(data.salesLetterInfo);
    }
    if (typeof data.salesLetterMode === 'boolean') {
      setSalesLetterMode(data.salesLetterMode);
    }

    setCurrentPresetId(data.id);
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
      if (currentPresetId === id) setCurrentPresetId(null);
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
      setSettings({
        orientation: 'vertical',
        imageSize: '2K',
        patternCount: 1,
        backgroundMode: 'creative',
        customBackground: '',
        flyerTitle: '',
        logoPosition: 'full-bottom',
        additionalInstructions: ''
      });
      setCurrentPresetId(null);
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
      let successCount = 0;
      const updatedHistory = [...history];

      for (const item of itemsToTag) {
        try {
          const tags = await generateTagsFromImage(item.data, apiKey);
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
      // Generate edited image
      const editedImageData = await editImage(editingImage.data, regions, apiKey);

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
      // Remove text from image
      const cleanedImageData = await removeTextFromImage(item.data, apiKey);

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

  return (
    <div className="min-h-screen pb-32 bg-slate-50/50">
      {/* Header */}
      <header className="bg-white sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="./logo.png" alt="Logo" className="w-10 h-10 rounded-md" />
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              チラシ作成ソフト
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`text-sm px-3 sm:px-4 py-1.5 rounded-full font-bold flex items-center gap-1 sm:gap-2 transition-all ${isGenerating ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span className="hidden sm:inline">生成中...</span>
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
              className="p-2 sm:px-3 sm:py-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
              title="プリセット"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
            </button>
            <button
              onClick={() => { setTempApiKey(apiKey); setTempReplicateApiKey(replicateApiKey); setIsSettingsOpen(true); }}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-full flex items-center gap-1.5 transition-all ${apiKey ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
              title={apiKey ? 'API 接続中' : 'APIキー未設定'}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${apiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className="hidden sm:inline text-xs font-bold">{apiKey ? '接続中' : '未設定'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">

        {/* Preset Management Section */}
        {showPresetList && (
          <div className="bg-white/40 backdrop-blur-md border border-indigo-100 rounded-lg p-5 sm:p-8 mb-6 sm:mb-10 animate-slide-up shadow-indigo-500/5">
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
            {presets.length === 0 ? (
              <div className="text-center py-10 bg-slate-50/50 rounded-md border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm font-medium">プリセットがありません</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {presets.map(preset => (
                  <div
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset)}
                    className={`group bg-white p-5 rounded-md border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${currentPresetId === preset.id ? 'border-indigo-500 shadow-indigo-500/10 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{preset.name}</h3>
                        <p className="text-[10px] font-bold tracking-wider text-slate-400 mt-2 flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          更新: {new Date(preset.updatedAt).toLocaleDateString('ja-JP')}
                        </p>
                        <div className="flex gap-2 mt-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded-md">{preset.products?.length || 0} 商品</span>
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

        {/* Front/Back Toggle Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-slate-100 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setFlyerSide('front')}
              className={`px-6 py-2.5 rounded-md font-semibold transition-all ${flyerSide === 'front'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              表面
            </button>
            <button
              onClick={() => setFlyerSide('back')}
              className={`px-6 py-2.5 rounded-md font-semibold transition-all ${flyerSide === 'back'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              裏面
            </button>
          </div>
        </div>

        {/* Action Bar for Current State */}
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${currentPresetId ? 'bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'bg-slate-300'}`}></div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-400">現在の状態</p>
              {currentPresetId ? (
                <p className="font-semibold text-indigo-700">
                  編集中: {presets.find(p => p.id === currentPresetId)?.name || '未保存のプリセット'}
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

        {/* Front Side */}
        {flyerSide === 'front' && (
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
                    </div>
                  )}
                </div>

                {/* Background Mode (Front Side) */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">背景モード</label>
                  <div className="flex gap-3">
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'creative' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name="frontBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'creative'} onChange={() => setSettings({ ...settings, backgroundMode: 'creative' })} />
                      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-400 via-rose-400 to-indigo-500 flex items-center justify-center text-sm shadow-inner">✨</div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">おまかせ</div>
                        <div className="text-[9px] font-bold text-slate-500 mt-0.5">AIおすすめ</div>
                      </div>
                    </label>
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'white' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name="frontBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'white'} onChange={() => setSettings({ ...settings, backgroundMode: 'white' })} />
                      <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-sm shadow-sm border border-slate-200">⬜</div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">白配色</div>
                        <div className="text-[9px] font-bold text-slate-500 mt-0.5">シンプル</div>
                      </div>
                    </label>
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'custom' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name="frontBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'custom'} onChange={() => setSettings({ ...settings, backgroundMode: 'custom' })} />
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
              </>
            )}
          </>
        )}

        {/* Back Side - Settings */}
        {flyerSide === 'back' && (
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
            </div>
          </>
        )}

        {/* Common Settings Section (Both Front and Back) */}
        <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>

          <div className="flex items-center gap-3 mb-8 relative">
            <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-sm">⚙️</div>
            <h2 className="text-xl font-semibold text-slate-900">共通設定</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10 relative">
            {/* Orientation */}
            <div>
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">チラシ形式</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex flex-col items-center justify-center p-4 border-2 rounded-md cursor-pointer transition-all ${settings.orientation === 'vertical' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="orientation-common" className="sr-only" checked={settings.orientation === 'vertical'} onChange={() => setSettings({ ...settings, orientation: 'vertical' })} />
                  <div className="w-6 h-9 border-[2.5px] border-slate-400 mx-auto mb-2 rounded-md bg-white shadow-sm"></div>
                  <span className="text-sm font-semibold text-slate-900">縦向き</span>
                </label>
                <label className={`flex-1 flex flex-col items-center justify-center p-4 border-2 rounded-md cursor-pointer transition-all ${settings.orientation === 'horizontal' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="orientation-common" className="sr-only" checked={settings.orientation === 'horizontal'} onChange={() => setSettings({ ...settings, orientation: 'horizontal' })} />
                  <div className="w-9 h-6 border-[2.5px] border-slate-400 mx-auto mb-2 rounded-md bg-white shadow-sm"></div>
                  <span className="text-sm font-semibold text-slate-900">横向き</span>
                </label>
              </div>
            </div>

            {/* Resolution & Variations */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2 ml-1">解像度</label>
                <div className="relative">
                  <select
                    value={settings.imageSize}
                    onChange={(e) => setSettings({ ...settings, imageSize: e.target.value as any })}
                    className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-bold appearance-none transition-all hover:border-slate-300"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-2 ml-1">パターン数</label>
                <div className="relative">
                  <select
                    value={settings.patternCount}
                    onChange={(e) => setSettings({ ...settings, patternCount: parseInt(e.target.value) })}
                    className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-bold appearance-none transition-all hover:border-slate-300"
                  >
                    {[1, 2, 3, 4, 5].map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Opposite Side Reference */}
          <div className="p-5 bg-amber-50/50 rounded-md border border-amber-100">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={useOppositeSideReference}
                onChange={(e) => setUseOppositeSideReference(e.target.checked)}
                className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-semibold text-slate-700">
                {flyerSide === 'front' ? '裏面を参照して統一感を出す' : '表面を参照して統一感を出す'}
              </span>
            </label>
            {useOppositeSideReference && (
              <div className="mt-3">
                <ImageUploader
                  label={flyerSide === 'front' ? '参照する裏面画像' : '参照する表面画像'}
                  images={oppositeSideImage ? [oppositeSideImage] : []}
                  onImagesChange={(images) => setOppositeSideImage(images[0] || '')}
                  maxImages={1}
                />
                <p className="text-[10px] text-amber-600 mt-2">アップロードした反対面の画像を参考にして、デザインの統一感を持たせます。</p>
              </div>
            )}
          </div>
        </div>

        {/* Global Assets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">👤</div>
              <h3 className="text-lg font-semibold text-slate-900">キャラクター</h3>
              {firebaseEnabled && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">☁️ 自動同期</span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mb-4 ml-1">チェックを入れた画像のみ使用します。チェックなしの場合は使用しません。</p>
            <ImageUploader
              label="店舗キャラクター、マスコットなど"
              images={characterImages}
              onImagesChange={handleCharacterImagesChange}
            />
            {/* Checkmark selection for character images */}
            {characterImages.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {characterImages.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleCharacterImageSelection(idx)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedCharacterIndices.has(idx)
                      ? 'border-indigo-600 ring-2 ring-indigo-200'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <img
                      src={img}
                      alt={`キャラクター ${idx + 1}`}
                      className="w-full h-20 object-cover"
                    />
                    {/* Checkmark overlay */}
                    <div
                      className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedCharacterIndices.has(idx)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/80 text-slate-300 border border-slate-300'
                        }`}
                    >
                      {selectedCharacterIndices.has(idx) ? '✓' : ''}
                    </div>
                    {/* Selection indicator */}
                    {selectedCharacterIndices.has(idx) && (
                      <div className="absolute bottom-0 left-0 right-0 bg-indigo-600 text-white text-[9px] font-bold text-center py-0.5">
                        使用する
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {characterImages.length > 0 && selectedCharacterIndices.size === 0 && (
              <p className="text-[10px] text-amber-600 mt-2 ml-1">※ 使用する画像にチェックを入れてください</p>
            )}
            {characterImages.length > 0 && selectedCharacterIndices.size > 0 && (
              <div className="mt-6 p-5 bg-slate-50/80 rounded-md border border-slate-100">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">キャラクター衣装モード</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center gap-2.5 p-3 border-2 rounded-md cursor-pointer transition-all text-xs font-bold ${characterClothingMode === 'fixed' ? 'border-indigo-600 bg-white shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                    <input type="radio" name="clothingMode" className="sr-only" checked={characterClothingMode === 'fixed'} onChange={() => setCharacterClothingMode('fixed')} />
                    <span>👔 そのまま</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2.5 p-3 border-2 rounded-md cursor-pointer transition-all text-xs font-bold ${characterClothingMode === 'match' ? 'border-indigo-600 bg-white shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                    <input type="radio" name="clothingMode" className="sr-only" checked={characterClothingMode === 'match'} onChange={() => setCharacterClothingMode('match')} />
                    <span>🎨 チラシに合わせる</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <div id="custom-illustrations-section" className="bg-white rounded-lg shadow-premium border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">🎨</div>
              <h3 className="text-lg font-semibold text-slate-900">使用イラスト</h3>
              {firebaseEnabled && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">☁️ 自動同期</span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mb-4 ml-1">チェックを入れた画像のみ使用します。チェックなしの場合は使用しません。</p>
            <ImageUploader
              label="チラシに配置するイラスト"
              images={customIllustrations}
              onImagesChange={handleCustomIllustrationsChange}
            />
            {/* Checkmark selection for custom illustrations */}
            {customIllustrations.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {customIllustrations.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleCustomIllustrationSelection(idx)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedCustomIllustrationIndices.has(idx)
                      ? 'border-indigo-600 ring-2 ring-indigo-200'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <img
                      src={img}
                      alt={`使用イラスト ${idx + 1}`}
                      className="w-full h-20 object-cover"
                    />
                    {/* Checkmark overlay */}
                    <div
                      className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedCustomIllustrationIndices.has(idx)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/80 text-slate-300 border border-slate-300'
                        }`}
                    >
                      {selectedCustomIllustrationIndices.has(idx) ? '✓' : ''}
                    </div>
                    {/* Selection indicator */}
                    {selectedCustomIllustrationIndices.has(idx) && (
                      <div className="absolute bottom-0 left-0 right-0 bg-indigo-600 text-white text-[9px] font-bold text-center py-0.5">
                        使用する
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {customIllustrations.length > 0 && selectedCustomIllustrationIndices.size === 0 && (
              <p className="text-[10px] text-amber-600 mt-2 ml-1">※ 使用する画像にチェックを入れてください</p>
            )}
          </div>
          <div id="reference-section" className="bg-white rounded-lg shadow-premium border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">🖼️</div>
              <h3 className="text-lg font-semibold text-slate-900">参考デザイン</h3>
              {firebaseEnabled && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">☁️ 自動同期</span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mb-4 ml-1">選択した画像のみ参考にします（1つのみ選択可能）。選択なしの場合は参考なし。</p>
            <ImageUploader
              label="デザイン参考にするチラシ画像"
              images={referenceImages}
              onImagesChange={handleReferenceImagesChange}
            />
            {/* Checkmark selection for reference images */}
            {referenceImages.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {referenceImages.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewImage(img)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedReferenceIndex === idx
                      ? 'border-indigo-600 ring-2 ring-indigo-200'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <img
                      src={img}
                      alt={`参考デザイン ${idx + 1}`}
                      className="w-full h-20 object-cover"
                    />
                    {/* Checkmark overlay */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReferenceImageSelection(idx);
                      }}
                      className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedReferenceIndex === idx
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/80 text-slate-300 border border-slate-300'
                        }`}
                    >
                      {selectedReferenceIndex === idx ? '✓' : ''}
                    </div>
                    {/* Selection indicator */}
                    {selectedReferenceIndex === idx && (
                      <div className="absolute bottom-0 left-0 right-0 bg-indigo-600 text-white text-[9px] font-bold text-center py-0.5">
                        使用する
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {referenceImages.length > 0 && selectedReferenceIndex === null && (
              <p className="text-[10px] text-amber-600 mt-2 ml-1">※ 参考にする画像を1つ選択してください</p>
            )}
          </div>
        </div>

        {/* Customer Images (for Front Side) */}
        <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center text-sm">👥</div>
            <h3 className="text-lg font-semibold text-slate-900">お客様画像</h3>
            {firebaseEnabled && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">☁️ 自動同期</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mb-4 ml-1">表面チラシで「お客様」として配置する画像。チェックを入れた画像のみ使用。</p>
          <ImageUploader
            label="お客様画像"
            images={customerImages}
            onImagesChange={handleCustomerImagesChange}
          />
          {/* Checkmark selection for customer images */}
          {customerImages.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {customerImages.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleCustomerImageSelection(idx)}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedCustomerImageIndices.has(idx)
                    ? 'border-rose-600 ring-2 ring-rose-200'
                    : 'border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <img
                    src={img}
                    alt={`お客様画像 ${idx + 1}`}
                    className="w-full h-20 object-cover"
                  />
                  {/* Checkmark overlay */}
                  <div
                    className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedCustomerImageIndices.has(idx)
                      ? 'bg-rose-600 text-white'
                      : 'bg-white/80 text-slate-300 border border-slate-300'
                      }`}
                  >
                    {selectedCustomerImageIndices.has(idx) ? '✓' : ''}
                  </div>
                  {/* Selection indicator */}
                  {selectedCustomerImageIndices.has(idx) && (
                    <div className="absolute bottom-0 left-0 right-0 bg-rose-600 text-white text-[9px] font-bold text-center py-0.5">
                      使用する
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {customerImages.length > 0 && selectedCustomerImageIndices.size === 0 && (
            <p className="text-[10px] text-amber-600 mt-2 ml-1">※ 使用する画像にチェックを入れてください</p>
          )}
        </div>

        {/* Store Logo */}
        <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">🏪</div>
            <h3 className="text-lg font-semibold text-slate-900">店舗ロゴ</h3>
            {firebaseEnabled && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">☁️ 自動同期</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mb-4 ml-1">チェックを入れた画像のみ使用します。チェックなしの場合は使用しません。</p>
          <ImageUploader
            label="店舗ロゴ画像"
            images={storeLogoImages}
            onImagesChange={handleStoreLogoImagesChange}
          />
          {/* Checkmark selection for store logo images */}
          {storeLogoImages.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {storeLogoImages.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleLogoImageSelection(idx)}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedLogoIndices.has(idx)
                    ? 'border-indigo-600 ring-2 ring-indigo-200'
                    : 'border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <img
                    src={img}
                    alt={`店舗ロゴ ${idx + 1}`}
                    className="w-full h-20 object-cover"
                  />
                  {/* Checkmark overlay */}
                  <div
                    className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedLogoIndices.has(idx)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/80 text-slate-300 border border-slate-300'
                      }`}
                  >
                    {selectedLogoIndices.has(idx) ? '✓' : ''}
                  </div>
                  {/* Selection indicator */}
                  {selectedLogoIndices.has(idx) && (
                    <div className="absolute bottom-0 left-0 right-0 bg-indigo-600 text-white text-[9px] font-bold text-center py-0.5">
                      使用する
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {storeLogoImages.length > 0 && selectedLogoIndices.size === 0 && (
            <p className="text-[10px] text-amber-600 mt-2 ml-1">※ 使用する画像にチェックを入れてください</p>
          )}
          {storeLogoImages.length > 0 && selectedLogoIndices.size > 0 && (
            <div className="mt-6 p-5 bg-slate-50/80 rounded-md border border-slate-100">
              <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">ロゴの表示サイズ（最下部に配置）</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center gap-2.5 p-3 border-2 rounded-md cursor-pointer transition-all text-xs font-bold ${settings.logoPosition === 'full-bottom' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                  <input type="radio" name="logoPosition" className="sr-only" checked={settings.logoPosition === 'full-bottom'} onChange={() => setSettings({ ...settings, logoPosition: 'full-bottom' })} />
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${settings.logoPosition === 'full-bottom' ? 'bg-indigo-600 text-white' : 'bg-white border-2 border-slate-300'}`}>
                    {settings.logoPosition === 'full-bottom' ? '✓' : ''}
                  </div>
                  <span>横幅目一杯</span>
                </label>
                <label className={`flex-1 flex items-center gap-2.5 p-3 border-2 rounded-md cursor-pointer transition-all text-xs font-bold ${settings.logoPosition === 'right-bottom' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                  <input type="radio" name="logoPosition" className="sr-only" checked={settings.logoPosition === 'right-bottom'} onChange={() => setSettings({ ...settings, logoPosition: 'right-bottom' })} />
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${settings.logoPosition === 'right-bottom' ? 'bg-indigo-600 text-white' : 'bg-white border-2 border-slate-300'}`}>
                    {settings.logoPosition === 'right-bottom' ? '✓' : ''}
                  </div>
                  <span>横幅半分（右端）</span>
                </label>
              </div>
            </div>
          )}
        </div>

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
            disabled={isGenerating}
            className={`
               btn-premium inline-flex items-center px-12 py-5 border border-transparent text-xl font-semibold rounded-[24px] shadow-2xl text-white 
               ${isGenerating ? 'bg-slate-400 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 hover:scale-105 active:scale-95 shadow-indigo-500/30'}
               focus:outline-none transition-all duration-300
             `}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-4 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span className="tracking-tight uppercase">生成中...</span>
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
          <div className="bg-white/60 backdrop-blur-sm rounded-lg shadow-premium border border-white/50 p-8 sm:p-12 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-950 rounded-md flex items-center justify-center text-lg">📁</div>
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">生成履歴 <span className="text-indigo-600 ml-2">({history.length})</span></h2>
              </div>
              {/* Tag Buttons */}
              <div className="flex gap-2">
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
            </div>

            {/* Tag Filter */}
            {(() => {
              const allTags = [...new Set(history.flatMap(item => item.tags || []))];
              return allTags.length > 0 && (
                <div className="mb-8 flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-bold text-slate-400 mr-2">タグで絞り込み:</span>
                  <button
                    onClick={() => setSelectedTag(null)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedTag === null
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                    すべて
                  </button>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedTag === tag
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...history]
                .filter(item => selectedTag === null || (item.tags && item.tags.includes(selectedTag)))
                .sort((a, b) => {
                  // Favorites first, then by date
                  const aFav = !!a.isFavorite;
                  const bFav = !!b.isFavorite;
                  if (aFav !== bFav) return aFav ? -1 : 1;
                  if (a.createdAt === b.createdAt) return 0;
                  const direction = sortOrder === 'asc' ? 1 : -1;
                  return (a.createdAt - b.createdAt) * direction;
                })
                .map((item, idx) => (
                  <div key={item.id} className={`group flex flex-col bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 ${item.isFavorite ? 'ring-2 ring-amber-400' : ''}`}>
                    {/* Image Section */}
                    <div className="relative aspect-[3/4] bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
                      <img src={item.thumbnail || item.data} alt="Generated Flyer" className="w-full h-full object-contain" loading="lazy" />

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
                    <div className="p-4 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                        <span className="font-medium">
                          {new Date(item.createdAt).toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleFavorite(item.id)}
                            className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all hover:scale-110 ${item.isFavorite ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}
                            title={item.isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
                          >
                            {item.isFavorite ? '⭐' : '☆'}
                          </button>
                          <button
                            onClick={() => handleDeleteImage(item.id)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                            title="削除"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Action Buttons Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* Download Button with Dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenDownloadMenu(openDownloadMenu === item.id ? null : item.id)}
                            className="w-full flex items-center justify-center bg-slate-500 hover:bg-slate-600 text-white p-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
                            title="ダウンロード"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>

                          {openDownloadMenu === item.id && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                              <button
                                onClick={() => handleDownloadPng(item.data, item.createdAt)}
                                className="w-full p-2.5 text-emerald-600 hover:bg-emerald-50 transition-all border-b border-slate-100 text-sm font-bold"
                              >
                                PNG
                              </button>
                              <button
                                onClick={() => handleDownloadJpg(item.data, item.createdAt)}
                                className="w-full p-2.5 text-amber-600 hover:bg-amber-50 transition-all border-b border-slate-100 text-sm font-bold"
                              >
                                JPG
                              </button>
                              <button
                                onClick={() => handleDownloadPdf(item.data, item.createdAt)}
                                className="w-full p-2.5 text-rose-600 hover:bg-rose-50 transition-all text-sm font-bold"
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
                          className={`flex items-center justify-center p-2.5 rounded-lg transition-all shadow-sm ${upscalingImageId === item.id
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
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : item.isUpscaled ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                          )}
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => setEditingImage(item)}
                          className="flex items-center justify-center bg-slate-500 hover:bg-slate-600 text-white p-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
                          title="画像を編集"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>

                      {/* Second Row of Buttons */}
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {/* 4K Regeneration Button */}
                        <button
                          onClick={() => handleRegenerate4K(item)}
                          disabled={regenerating4KImageId === item.id || item.is4KRegenerated}
                          className={`flex items-center justify-center p-2.5 rounded-lg transition-all shadow-sm ${regenerating4KImageId === item.id
                            ? 'bg-violet-100 text-violet-600 cursor-wait'
                            : item.is4KRegenerated
                              ? 'bg-violet-100 text-violet-600 cursor-not-allowed'
                              : 'bg-violet-500 hover:bg-violet-600 text-white active:scale-95'
                            }`}
                          title={item.is4KRegenerated ? '4K再生成済み' : 'Gemini APIで4K再生成（内容はそのまま）'}
                        >
                          {regenerating4KImageId === item.id ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : item.is4KRegenerated ? (
                            <span className="text-xs font-bold">4K✓</span>
                          ) : (
                            <span className="text-xs font-bold">4K</span>
                          )}
                        </button>

                        {/* Remove Text Button */}
                        <button
                          onClick={() => handleRemoveText(item)}
                          disabled={removingTextImageId === item.id}
                          className={`flex items-center justify-center p-2.5 rounded-lg transition-all shadow-sm ${removingTextImageId === item.id
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-500 hover:bg-slate-600 text-white active:scale-95'
                            }`}
                          title="文字を消去"
                        >
                          {removingTextImageId === item.id ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>

                        {/* Reference Button */}
                        <button
                          onClick={() => handleUseAsReference(item.data)}
                          className="flex items-center justify-center bg-slate-500 hover:bg-slate-600 text-white p-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
                          title="参考画像として使用"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

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
              {currentPresetId && (
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
                className={`w-full font-semibold tracking-wide text-xs py-4 px-6 rounded-md transition-all border-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${currentPresetId ? 'bg-white text-indigo-600 border-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-indigo-600/20'}`}
              >
                {isSaving ? '保存中...' : (currentPresetId ? '新規プリセットとして保存' : '保存')}
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
              現在の未保存データは置き換わります。
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
        <ImageEditModal
          imageUrl={editingImage.data}
          onClose={() => setEditingImage(null)}
          onGenerate={handleEditImage}
          isGenerating={isEditGenerating}
        />
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
                  <img src={uploadPreview} alt="Preview" className="w-full h-32 object-contain rounded-lg border border-slate-200 bg-slate-50" />
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

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh] animate-slide-up">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 bg-white/90 hover:bg-white text-slate-700 font-bold px-4 py-2 rounded-lg shadow-lg transition-all"
            >
              ✕ 閉じる
            </button>
            <img
              src={previewImage}
              alt="プレビュー"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
