// Firebase configuration
// ユーザーはFirebaseコンソールで自分のプロジェクトを作成し、
// この設定をFirebase設定画面からコピーして置き換えてください

import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

// Firebase configuration - loaded from environment variables for security
// Set these in .env.local (not committed to git)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

let app: ReturnType<typeof initializeApp> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

type SettingsDocPayload = {
    images?: string[];
    selectedIndices?: number[];
    updatedAt?: number;
};

let settingsDocCache: Map<string, SettingsDocPayload> | null = null;
let settingsDocCacheLoadedAt = 0;
let settingsDocFetchPromise: Promise<Map<string, SettingsDocPayload>> | null = null;
const SETTINGS_CACHE_TTL_MS = 30 * 1000;

export interface CloudAssetSyncResult {
    success: boolean;
    images: string[];
    selectedIndices: number[];
}

const arraysEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const updateSettingsDocCache = (docId: string, payload: SettingsDocPayload) => {
    if (!settingsDocCache) {
        settingsDocCache = new Map<string, SettingsDocPayload>();
    }
    settingsDocCache.set(docId, payload);
    settingsDocCacheLoadedAt = Date.now();
};

const loadSettingsDocs = async (force = false): Promise<Map<string, SettingsDocPayload>> => {
    if (!db) return new Map();

    const isCacheValid =
        !force &&
        settingsDocCache &&
        Date.now() - settingsDocCacheLoadedAt < SETTINGS_CACHE_TTL_MS;
    if (isCacheValid && settingsDocCache) {
        return settingsDocCache;
    }

    if (settingsDocFetchPromise) {
        return settingsDocFetchPromise;
    }

    settingsDocFetchPromise = (async () => {
        const snapshot = await getDocs(collection(db as ReturnType<typeof getFirestore>, 'settings'));
        const nextCache = new Map<string, SettingsDocPayload>();
        snapshot.forEach((docSnap) => {
            nextCache.set(docSnap.id, docSnap.data() as SettingsDocPayload);
        });
        settingsDocCache = nextCache;
        settingsDocCacheLoadedAt = Date.now();
        return nextCache;
    })();

    try {
        return await settingsDocFetchPromise;
    } finally {
        settingsDocFetchPromise = null;
    }
};

// Initialize Firebase only if config is set
export const initFirebase = (config?: typeof firebaseConfig) => {
    const cfg = config || firebaseConfig;
    console.log('Firebase init with config:', {
        projectId: cfg.projectId,
        storageBucket: cfg.storageBucket,
        hasApiKey: !!cfg.apiKey
    });

    if (!cfg.apiKey || !cfg.projectId) {
        console.log('Firebase not configured - missing apiKey or projectId');
        return false;
    }
    try {
        app = initializeApp(cfg);
        storage = getStorage(app);
        db = getFirestore(app);
        settingsDocCache = null;
        settingsDocCacheLoadedAt = 0;
        settingsDocFetchPromise = null;
        console.log('Firebase initialized successfully');
        return true;
    } catch (e) {
        console.error('Firebase init error:', e);
        return false;
    }
};

// Check if Firebase is configured
export const isFirebaseConfigured = () => {
    return app !== null && storage !== null && db !== null;
};

// ===== IMAGE STORAGE =====

export interface CloudImage {
    id: string;
    url: string;
    thumbnail?: string;
    tags?: string[];
    isFavorite?: boolean;
    isUpscaled?: boolean;
    upscaleScale?: number;
    isEdited?: boolean;
    is4KRegenerated?: boolean;
    imageSize?: '1K' | '2K' | '4K';
    qualityStatus?: 'pass' | 'warn' | 'fail' | 'error';
    qualityIssues?: string[];
    qualitySummary?: string;
    qualityCheckedAt?: number;
    createdAt: number;
}

// Upload image to Firebase Storage
export const uploadImage = async (base64Data: string, filename: string): Promise<string | null> => {
    if (!storage) {
        console.log('uploadImage: storage is null');
        return null;
    }
    try {
        console.log(`Uploading image: ${filename}`);
        const imageRef = ref(storage, `flyers/${filename}`);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        console.log(`Image uploaded successfully: ${url.substring(0, 50)}...`);
        return url;
    } catch (e) {
        console.error('Upload error:', e);
        return null;
    }
};

const extractTimestampFromFilename = (filename: string): number | null => {
    const match = filename.match(/(\d{13})/);
    return match ? Number(match[1]) : null;
};

// Get all images from Firebase Storage
export const getCloudImages = async (): Promise<CloudImage[]> => {
    if (!storage) return [];
    try {
        const listRef = ref(storage, 'flyers');

        // Fetch images and metadata in parallel
        const [result, metadataSnapshot] = await Promise.all([
            listAll(listRef),
            db ? getDocs(collection(db, 'flyer_metadata')) : Promise.resolve(null)
        ]);

        // Build metadata map
        const metadataMap = new Map<string, {
            tags?: string[];
            isFavorite?: boolean;
            isUpscaled?: boolean;
            upscaleScale?: number;
            isEdited?: boolean;
            is4KRegenerated?: boolean;
            imageSize?: '1K' | '2K' | '4K';
            qualityStatus?: 'pass' | 'warn' | 'fail' | 'error';
            qualityIssues?: string[];
            qualitySummary?: string;
            qualityCheckedAt?: number;
            createdAt?: number;
        }>();
        if (metadataSnapshot) {
            metadataSnapshot.forEach((doc) => {
                const data = doc.data();
                metadataMap.set(doc.id, {
                    tags: data.tags,
                    isFavorite: data.isFavorite,
                    isUpscaled: data.isUpscaled,
                    upscaleScale: data.upscaleScale,
                    isEdited: data.isEdited,
                    is4KRegenerated: data.is4KRegenerated,
                    imageSize: data.imageSize,
                    qualityStatus: data.qualityStatus,
                    qualityIssues: data.qualityIssues,
                    qualitySummary: data.qualitySummary,
                    qualityCheckedAt: data.qualityCheckedAt,
                    createdAt: data.createdAt
                });
            });
        }

        // 並列でURLを取得（N+1問題の解消）
        const allFiles = await Promise.all(
            result.items.map(async (itemRef) => ({
                name: itemRef.name,
                url: await getDownloadURL(itemRef)
            }))
        );

        // サムネイルとフル画像を分離
        const thumbnails = new Map<string, string>();
        const fullImages: { name: string; url: string }[] = [];

        for (const file of allFiles) {
            if (file.name.includes('_thumb.')) {
                // サムネイルの場合、対応するフル画像のベース名をキーにする
                const baseName = file.name.replace('_thumb.jpg', '');
                thumbnails.set(baseName, file.url);
            } else {
                fullImages.push(file);
            }
        }

        // フル画像にサムネイルとタグを関連付け
        const images: CloudImage[] = fullImages.map((file) => {
            const baseName = file.name.replace('.png', '').replace('.jpg', '');
            const metadata = metadataMap.get(file.name) || metadataMap.get(baseName);
            const timestamp = metadata?.createdAt ?? extractTimestampFromFilename(file.name) ?? Date.now();
            return {
                id: file.name,
                url: file.url,
                thumbnail: thumbnails.get(baseName),
                tags: metadata?.tags,
                isFavorite: metadata?.isFavorite,
                isUpscaled: metadata?.isUpscaled,
                upscaleScale: metadata?.upscaleScale,
                isEdited: metadata?.isEdited,
                is4KRegenerated: metadata?.is4KRegenerated,
                imageSize: metadata?.imageSize,
                qualityStatus: metadata?.qualityStatus,
                qualityIssues: metadata?.qualityIssues,
                qualitySummary: metadata?.qualitySummary,
                qualityCheckedAt: metadata?.qualityCheckedAt,
                createdAt: timestamp
            };
        });

        // Sort by newest first
        return images.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
        console.error('Get images error:', e);
        return [];
    }
};

// Delete image from Firebase Storage
export const deleteCloudImage = async (filename: string): Promise<boolean> => {
    if (!storage) return false;
    try {
        const imageRef = ref(storage, `flyers/${filename}`);
        await deleteObject(imageRef);

        // Delete thumbnail if present.
        const thumbFilename = filename.replace(/\.(png|jpe?g|webp)$/i, '_thumb.jpg');
        if (thumbFilename !== filename) {
            try {
                const thumbRef = ref(storage, `flyers/${thumbFilename}`);
                await deleteObject(thumbRef);
            } catch (thumbError) {
                // Thumbnail may not exist (legacy records). Ignore quietly.
                console.warn(`Thumbnail delete skipped for ${thumbFilename}:`, thumbError);
            }
        }

        // Also delete metadata from Firestore
        if (db) {
            await deleteDoc(doc(db, 'flyer_metadata', filename));
        }
        return true;
    } catch (e) {
        console.error('Delete error:', e);
        return false;
    }
};

// ===== FLYER METADATA (Firestore) =====

export interface FlyerMetadata {
    id: string;
    tags: string[];
    isFavorite?: boolean;
    isUpscaled?: boolean;
    upscaleScale?: number;
    isEdited?: boolean;
    is4KRegenerated?: boolean;
    imageSize?: '1K' | '2K' | '4K';
    qualityStatus?: 'pass' | 'warn' | 'fail' | 'error';
    qualityIssues?: string[];
    qualitySummary?: string;
    qualityCheckedAt?: number;
    createdAt: number;
}

// Save flyer metadata (tags and flags) to Firestore
export const saveFlyerMetadata = async (
    id: string,
    tags: string[],
    createdAt: number,
    options?: {
        isUpscaled?: boolean;
        upscaleScale?: number;
        isEdited?: boolean;
        is4KRegenerated?: boolean;
        imageSize?: '1K' | '2K' | '4K';
        qualityStatus?: 'pass' | 'warn' | 'fail' | 'error';
        qualityIssues?: string[];
        qualitySummary?: string;
        qualityCheckedAt?: number;
    }
): Promise<boolean> => {
    if (!db) return false;
    try {
        await setDoc(doc(db, 'flyer_metadata', id), {
            id,
            tags,
            createdAt,
            ...(options?.isUpscaled !== undefined && { isUpscaled: options.isUpscaled }),
            ...(options?.upscaleScale !== undefined && { upscaleScale: options.upscaleScale }),
            ...(options?.isEdited !== undefined && { isEdited: options.isEdited }),
            ...(options?.is4KRegenerated !== undefined && { is4KRegenerated: options.is4KRegenerated }),
            ...(options?.imageSize !== undefined && { imageSize: options.imageSize }),
            ...(options?.qualityStatus !== undefined && { qualityStatus: options.qualityStatus }),
            ...(options?.qualityIssues !== undefined && { qualityIssues: options.qualityIssues }),
            ...(options?.qualitySummary !== undefined && { qualitySummary: options.qualitySummary }),
            ...(options?.qualityCheckedAt !== undefined && { qualityCheckedAt: options.qualityCheckedAt }),
            updatedAt: Date.now()
        });
        return true;
    } catch (e) {
        console.error('Save flyer metadata error:', e);
        return false;
    }
};

// Get all flyer metadata from Firestore
export const getFlyerMetadata = async (): Promise<Map<string, FlyerMetadata>> => {
    if (!db) return new Map();
    try {
        const querySnapshot = await getDocs(collection(db, 'flyer_metadata'));
        const metadata = new Map<string, FlyerMetadata>();
        querySnapshot.forEach((doc) => {
            const data = doc.data() as FlyerMetadata;
            metadata.set(doc.id, data);
        });
        return metadata;
    } catch (e) {
        console.error('Get flyer metadata error:', e);
        return new Map();
    }
};

// Update tags for a specific flyer
export const updateFlyerTags = async (id: string, tags: string[]): Promise<boolean> => {
    if (!db) return false;
    try {
        await setDoc(doc(db, 'flyer_metadata', id), {
            tags,
            updatedAt: Date.now()
        }, { merge: true });
        return true;
    } catch (e) {
        console.error('Update flyer tags error:', e);
        return false;
    }
};

// Update favorite status for a specific flyer
export const updateFlyerFavorite = async (id: string, isFavorite: boolean): Promise<boolean> => {
    if (!db) return false;
    try {
        await setDoc(doc(db, 'flyer_metadata', id), {
            isFavorite,
            updatedAt: Date.now()
        }, { merge: true });
        return true;
    } catch (e) {
        console.error('Update flyer favorite error:', e);
        return false;
    }
};

// Update upscale status for a specific flyer
export const updateFlyerUpscaleStatus = async (
    id: string,
    isUpscaled: boolean,
    upscaleScale?: number
): Promise<boolean> => {
    if (!db) return false;
    try {
        await setDoc(doc(db, 'flyer_metadata', id), {
            isUpscaled,
            ...(upscaleScale !== undefined && { upscaleScale }),
            updatedAt: Date.now()
        }, { merge: true });
        return true;
    } catch (e) {
        console.error('Update flyer upscale status error:', e);
        return false;
    }
};

// Update quality check result for a specific flyer
export const updateFlyerQualityCheck = async (
    id: string,
    qualityStatus: 'pass' | 'warn' | 'fail' | 'error',
    qualityIssues: string[],
    qualitySummary: string,
    qualityCheckedAt: number
): Promise<boolean> => {
    if (!db) return false;
    try {
        await setDoc(doc(db, 'flyer_metadata', id), {
            qualityStatus,
            qualityIssues,
            qualitySummary,
            qualityCheckedAt,
            updatedAt: Date.now()
        }, { merge: true });
        return true;
    } catch (e) {
        console.error('Update flyer quality check error:', e);
        return false;
    }
};

// ===== PRESETS (Firestore) =====

export interface CloudPreset {
    id: string;
    name: string;
    side: 'front' | 'back';
    products?: any[];
    settings?: any;
    characterClothingMode?: string;
    campaignInfo?: any;
    frontFlyerType?: string;
    productServiceInfo?: any;
    salesLetterInfo?: any;
    salesLetterMode?: boolean;
    createdAt: number;
    updatedAt: number;
}

// Helper to upload base64 image and return URL
const uploadPresetImage = async (base64Data: string, presetId: string, prefix: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `presets/${presetId}/${prefix}_${index}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload preset image ${prefix}_${index}:`, e);
        return base64Data; // Return original on error
    }
};

// Upload all images in an array to Storage
const uploadImagesArray = async (images: string[], presetId: string, prefix: string): Promise<string[]> => {
    return Promise.all(images.map((image, index) => uploadPresetImage(image, presetId, prefix, index)));
};

// Save preset to Firestore (with images uploaded to Storage)
export const saveCloudPreset = async (preset: CloudPreset): Promise<boolean> => {
    if (!db) {
        console.log('saveCloudPreset: db is null');
        return false;
    }
    try {
        console.log(`Saving preset to Firestore: ${preset.name} (${preset.id})`);

        const products = Array.isArray(preset.products) ? preset.products : [];
        const productsWithUrls = await Promise.all(products.map(async (product, pIndex) => {
            const productImageUrls = await uploadImagesArray(product.images || [], preset.id, `prod${pIndex}`);
            return { ...product, images: productImageUrls };
        }));

        // Save to Firestore with URLs instead of base64
        // Note: Firestore doesn't accept undefined values, so we only include defined fields
        const presetData: Record<string, any> = {
            id: preset.id,
            name: preset.name,
            side: preset.side || 'back',
            products: productsWithUrls,
            settings: preset.settings,
            characterClothingMode: preset.characterClothingMode || 'fixed',
            createdAt: preset.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        // Only add optional fields if they are defined (Firestore rejects undefined)
        if (preset.campaignInfo) {
            presetData.campaignInfo = { ...preset.campaignInfo, productImages: [] };
        }
        if (preset.frontFlyerType !== undefined) {
            presetData.frontFlyerType = preset.frontFlyerType;
        }
        if (preset.productServiceInfo !== undefined) {
            presetData.productServiceInfo = preset.productServiceInfo;
        }
        if (preset.salesLetterInfo !== undefined) {
            presetData.salesLetterInfo = preset.salesLetterInfo;
        }
        if (preset.salesLetterMode !== undefined) {
            presetData.salesLetterMode = preset.salesLetterMode;
        }

        const docRef = doc(db, 'presets', preset.id);
        await setDoc(docRef, presetData);
        console.log('Preset saved successfully');
        return true;
    } catch (e) {
        console.error('Save preset error:', e);
        return false;
    }
};

// Get all presets from Firestore
export const getCloudPresets = async (): Promise<CloudPreset[]> => {
    if (!db) {
        console.log('getCloudPresets: db is null');
        return [];
    }
    try {
        console.log('Fetching presets from Firestore...');
        const querySnapshot = await getDocs(collection(db, 'presets'));
        const presets: CloudPreset[] = [];
        querySnapshot.forEach((doc) => {
            presets.push({ id: doc.id, ...doc.data() } as CloudPreset);
        });
        console.log(`Fetched ${presets.length} presets from Firestore`);
        return presets.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
        console.error('Get presets error:', e);
        return [];
    }
};

// Delete preset from Firestore
export const deleteCloudPreset = async (presetId: string): Promise<boolean> => {
    if (!db) return false;
    try {
        await deleteDoc(doc(db, 'presets', presetId));
        return true;
    } catch (e) {
        console.error('Delete preset error:', e);
        return false;
    }
};

const normalizeSelectedIndices = (selectedIndices: number[], max: number) => {
    return selectedIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < max);
};

const getSettingsImages = async (docId: string): Promise<{ images: string[]; selectedIndices: number[] }> => {
    if (!db) {
        return { images: [], selectedIndices: [] };
    }
    try {
        const docs = await loadSettingsDocs();
        const data = docs.get(docId);
        const images = Array.isArray(data?.images) ? data?.images : [];
        const rawSelected = Array.isArray(data?.selectedIndices) ? data?.selectedIndices : [];
        const selectedIndices = normalizeSelectedIndices(rawSelected, images.length);
        return { images, selectedIndices };
    } catch (e) {
        console.error(`Get settings ${docId} error:`, e);
        return { images: [], selectedIndices: [] };
    }
};

const saveSettingsImages = async (
    docId: string,
    images: string[],
    selectedIndices: number[],
    uploadFn: (base64Data: string, index: number) => Promise<string>,
    label: string
): Promise<CloudAssetSyncResult> => {
    if (!db || !storage) {
        console.log(`${label}: db or storage is null`);
        return { success: false, images, selectedIndices };
    }
    try {
        console.log(`Saving ${images.length} ${label} to cloud...`);
        const imageUrls = await Promise.all(images.map((image, index) => uploadFn(image, index)));
        const normalizedSelectedIndices = normalizeSelectedIndices(selectedIndices, imageUrls.length);
        const payload = {
            images: imageUrls,
            selectedIndices: normalizedSelectedIndices,
            updatedAt: Date.now()
        };
        await setDoc(doc(db, 'settings', docId), payload);
        updateSettingsDocCache(docId, payload);

        return {
            success: true,
            images: imageUrls,
            selectedIndices: normalizedSelectedIndices
        };
    } catch (e) {
        console.error(`Save settings ${docId} error:`, e);
        return { success: false, images, selectedIndices };
    }
};

// ===== REFERENCE IMAGES (Independent Cloud Sync) =====

// Upload reference image to Firebase Storage
const uploadReferenceImage = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `reference_images/ref_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload reference image ${index}:`, e);
        return base64Data;
    }
};

// Save reference images to Firestore (independent of presets)
export const saveReferenceImages = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages('reference_images', images, selectedIndices, uploadReferenceImage, 'reference images');
};

// Get reference images from Firestore
export const getReferenceImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getReferenceImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching reference images from cloud...');
    return getSettingsImages('reference_images');
};

// ===== CHARACTER IMAGES (Independent Cloud Sync) =====

// Upload character image to Firebase Storage
const uploadCharacterImage = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `character_images/char_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload character image ${index}:`, e);
        return base64Data;
    }
};

// Save character images to Firestore (independent of presets)
export const saveCharacterImages = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages('character_images', images, selectedIndices, uploadCharacterImage, 'character images');
};

// Get character images from Firestore
export const getCharacterImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCharacterImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching character images from cloud...');
    return getSettingsImages('character_images');
};

// ===== STORE LOGO IMAGES (Independent Cloud Sync) =====

// Upload store logo image to Firebase Storage
const uploadStoreLogoImage = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `store_logo_images/logo_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload store logo image ${index}:`, e);
        return base64Data;
    }
};

// Save store logo images to Firestore (independent of presets)
export const saveStoreLogoImages = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages('store_logo_images', images, selectedIndices, uploadStoreLogoImage, 'store logo images');
};

// Get store logo images from Firestore
export const getStoreLogoImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getStoreLogoImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching store logo images from cloud...');
    return getSettingsImages('store_logo_images');
};

// ===== CUSTOMER IMAGES (Independent Cloud Sync) =====

// Upload customer image to Firebase Storage
const uploadCustomerImage = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `customer_images/customer_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload customer image ${index}:`, e);
        return base64Data;
    }
};

// Save customer images to Firestore (independent of presets)
export const saveCustomerImages = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages('customer_images', images, selectedIndices, uploadCustomerImage, 'customer images');
};

// Get customer images from Firestore
export const getCustomerImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCustomerImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching customer images from cloud...');
    return getSettingsImages('customer_images');
};

// ===== CUSTOM ILLUSTRATIONS (Independent Cloud Sync) =====

// Upload custom illustration to Firebase Storage
const uploadCustomIllustration = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `custom_illustrations/illust_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload custom illustration ${index}:`, e);
        return base64Data;
    }
};

// Save custom illustrations to Firestore (independent of presets)
export const saveCustomIllustrations = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages(
        'custom_illustrations',
        images,
        selectedIndices,
        uploadCustomIllustration,
        'custom illustrations'
    );
};

// Get custom illustrations from Firestore
export const getCustomIllustrations = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCustomIllustrations: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching custom illustrations from cloud...');
    return getSettingsImages('custom_illustrations');
};

// ===== FRONT PRODUCT IMAGES (Independent Cloud Sync) =====

// Upload front product image to Firebase Storage
const uploadFrontProductImage = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `front_product_images/product_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload front product image ${index}:`, e);
        return base64Data;
    }
};

// Save front product images to Firestore (independent of presets)
export const saveFrontProductImages = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages(
        'front_product_images',
        images,
        selectedIndices,
        uploadFrontProductImage,
        'front product images'
    );
};

// Get front product images from Firestore
export const getFrontProductImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getFrontProductImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching front product images from cloud...');
    return getSettingsImages('front_product_images');
};

// ===== CAMPAIGN MAIN IMAGES (Independent Cloud Sync) =====

// Upload campaign main image to Firebase Storage
const uploadCampaignMainImage = async (base64Data: string, index: number): Promise<string> => {
    // If already a URL (starts with http), return as-is
    if (base64Data.startsWith('http')) return base64Data;

    if (!storage) return base64Data;

    try {
        const filename = `campaign_main_images/main_${index}_${Date.now()}.png`;
        const imageRef = ref(storage, filename);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (e) {
        console.error(`Failed to upload campaign main image ${index}:`, e);
        return base64Data;
    }
};

// Save campaign main images to Firestore (independent of presets)
export const saveCampaignMainImages = async (
    images: string[],
    selectedIndices: number[]
): Promise<CloudAssetSyncResult> => {
    return saveSettingsImages(
        'campaign_main_images',
        images,
        selectedIndices,
        uploadCampaignMainImage,
        'campaign main images'
    );
};

// Get campaign main images from Firestore
export const getCampaignMainImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCampaignMainImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    console.log('Fetching campaign main images from cloud...');
    return getSettingsImages('campaign_main_images');
};
