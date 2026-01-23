// Firebase configuration
// ユーザーはFirebaseコンソールで自分のプロジェクトを作成し、
// この設定をFirebase設定画面からコピーして置き換えてください

import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';

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
        const metadataMap = new Map<string, { tags?: string[]; isFavorite?: boolean; isUpscaled?: boolean; upscaleScale?: number; isEdited?: boolean; is4KRegenerated?: boolean; imageSize?: '1K' | '2K' | '4K'; createdAt?: number }>();
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
    createdAt: number;
}

// Save flyer metadata (tags and flags) to Firestore
export const saveFlyerMetadata = async (
    id: string,
    tags: string[],
    createdAt: number,
    options?: { isUpscaled?: boolean; upscaleScale?: number; isEdited?: boolean; is4KRegenerated?: boolean; imageSize?: '1K' | '2K' | '4K' }
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

// ===== PRESETS (Firestore) =====

export interface CloudPreset {
    id: string;
    name: string;
    products: any[];
    settings: any;
    characterImages: string[];
    characterClothingMode: string;
    referenceImages: string[];
    storeLogoImages: string[];
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
    const results: string[] = [];
    for (let i = 0; i < images.length; i++) {
        const url = await uploadPresetImage(images[i], presetId, prefix, i);
        results.push(url);
    }
    return results;
};

// Save preset to Firestore (with images uploaded to Storage)
export const saveCloudPreset = async (preset: CloudPreset): Promise<boolean> => {
    if (!db) {
        console.log('saveCloudPreset: db is null');
        return false;
    }
    try {
        console.log(`Saving preset to Firestore: ${preset.name} (${preset.id})`);

        // Upload images to Storage first to avoid Firestore 1MB limit
        const [characterImageUrls, referenceImageUrls, storeLogoUrls] = await Promise.all([
            uploadImagesArray(preset.characterImages || [], preset.id, 'char'),
            uploadImagesArray(preset.referenceImages || [], preset.id, 'ref'),
            uploadImagesArray(preset.storeLogoImages || [], preset.id, 'logo')
        ]);

        // Upload product images
        const productsWithUrls = await Promise.all(preset.products.map(async (product, pIndex) => {
            const productImageUrls = await uploadImagesArray(product.images || [], preset.id, `prod${pIndex}`);
            return { ...product, images: productImageUrls };
        }));

        // Save to Firestore with URLs instead of base64
        const presetData = {
            id: preset.id,
            name: preset.name,
            products: productsWithUrls,
            settings: preset.settings,
            characterImages: characterImageUrls,
            characterClothingMode: preset.characterClothingMode,
            referenceImages: referenceImageUrls,
            storeLogoImages: storeLogoUrls,
            createdAt: preset.createdAt || Date.now(),
            updatedAt: Date.now()
        };

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
export const saveReferenceImages = async (images: string[], selectedIndices: number[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveReferenceImages: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} reference images to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadReferenceImage(img, i))
        );

        // Save URLs and selected indices to Firestore
        const docRef = doc(db, 'settings', 'reference_images');
        await setDoc(docRef, {
            images: imageUrls,
            selectedIndices: selectedIndices,
            updatedAt: Date.now()
        });

        console.log('Reference images saved successfully');
        return true;
    } catch (e) {
        console.error('Save reference images error:', e);
        return false;
    }
};

// Get reference images from Firestore
export const getReferenceImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getReferenceImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    try {
        console.log('Fetching reference images from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        let selectedIndices: number[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'reference_images') {
                const data = d.data();
                images = data.images || [];
                selectedIndices = data.selectedIndices || [];
            }
        });

        console.log(`Fetched ${images.length} reference images from cloud`);
        return { images, selectedIndices };
    } catch (e) {
        console.error('Get reference images error:', e);
        return { images: [], selectedIndices: [] };
    }
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
export const saveCharacterImages = async (images: string[], selectedIndices: number[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveCharacterImages: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} character images to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadCharacterImage(img, i))
        );

        // Save URLs and selected indices to Firestore
        const docRef = doc(db, 'settings', 'character_images');
        await setDoc(docRef, {
            images: imageUrls,
            selectedIndices: selectedIndices,
            updatedAt: Date.now()
        });

        console.log('Character images saved successfully');
        return true;
    } catch (e) {
        console.error('Save character images error:', e);
        return false;
    }
};

// Get character images from Firestore
export const getCharacterImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCharacterImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    try {
        console.log('Fetching character images from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        let selectedIndices: number[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'character_images') {
                const data = d.data();
                images = data.images || [];
                selectedIndices = data.selectedIndices || [];
            }
        });

        console.log(`Fetched ${images.length} character images from cloud`);
        return { images, selectedIndices };
    } catch (e) {
        console.error('Get character images error:', e);
        return { images: [], selectedIndices: [] };
    }
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
export const saveStoreLogoImages = async (images: string[], selectedIndices: number[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveStoreLogoImages: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} store logo images to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadStoreLogoImage(img, i))
        );

        // Save URLs and selected indices to Firestore
        const docRef = doc(db, 'settings', 'store_logo_images');
        await setDoc(docRef, {
            images: imageUrls,
            selectedIndices: selectedIndices,
            updatedAt: Date.now()
        });

        console.log('Store logo images saved successfully');
        return true;
    } catch (e) {
        console.error('Save store logo images error:', e);
        return false;
    }
};

// Get store logo images from Firestore
export const getStoreLogoImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getStoreLogoImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    try {
        console.log('Fetching store logo images from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        let selectedIndices: number[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'store_logo_images') {
                const data = d.data();
                images = data.images || [];
                selectedIndices = data.selectedIndices || [];
            }
        });

        console.log(`Fetched ${images.length} store logo images from cloud`);
        return { images, selectedIndices };
    } catch (e) {
        console.error('Get store logo images error:', e);
        return { images: [], selectedIndices: [] };
    }
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
export const saveCustomerImages = async (images: string[], selectedIndices: number[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveCustomerImages: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} customer images to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadCustomerImage(img, i))
        );

        // Save URLs and selected indices to Firestore
        const docRef = doc(db, 'settings', 'customer_images');
        await setDoc(docRef, {
            images: imageUrls,
            selectedIndices: selectedIndices,
            updatedAt: Date.now()
        });

        console.log('Customer images saved successfully');
        return true;
    } catch (e) {
        console.error('Save customer images error:', e);
        return false;
    }
};

// Get customer images from Firestore
export const getCustomerImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCustomerImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    try {
        console.log('Fetching customer images from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        let selectedIndices: number[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'customer_images') {
                const data = d.data();
                images = data.images || [];
                selectedIndices = data.selectedIndices || [];
            }
        });

        console.log(`Fetched ${images.length} customer images from cloud`);
        return { images, selectedIndices };
    } catch (e) {
        console.error('Get customer images error:', e);
        return { images: [], selectedIndices: [] };
    }
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
export const saveCustomIllustrations = async (images: string[], selectedIndices: number[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveCustomIllustrations: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} custom illustrations to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadCustomIllustration(img, i))
        );

        // Save URLs and selected indices to Firestore
        const docRef = doc(db, 'settings', 'custom_illustrations');
        await setDoc(docRef, {
            images: imageUrls,
            selectedIndices: selectedIndices,
            updatedAt: Date.now()
        });

        console.log('Custom illustrations saved successfully');
        return true;
    } catch (e) {
        console.error('Save custom illustrations error:', e);
        return false;
    }
};

// Get custom illustrations from Firestore
export const getCustomIllustrations = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getCustomIllustrations: db is null');
        return { images: [], selectedIndices: [] };
    }
    try {
        console.log('Fetching custom illustrations from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        let selectedIndices: number[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'custom_illustrations') {
                const data = d.data();
                images = data.images || [];
                selectedIndices = data.selectedIndices || [];
            }
        });

        console.log(`Fetched ${images.length} custom illustrations from cloud`);
        return { images, selectedIndices };
    } catch (e) {
        console.error('Get custom illustrations error:', e);
        return { images: [], selectedIndices: [] };
    }
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
export const saveFrontProductImages = async (images: string[], selectedIndices: number[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveFrontProductImages: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} front product images to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadFrontProductImage(img, i))
        );

        // Save URLs and selected indices to Firestore
        const docRef = doc(db, 'settings', 'front_product_images');
        await setDoc(docRef, {
            images: imageUrls,
            selectedIndices: selectedIndices,
            updatedAt: Date.now()
        });

        console.log('Front product images saved successfully');
        return true;
    } catch (e) {
        console.error('Save front product images error:', e);
        return false;
    }
};

// Get front product images from Firestore
export const getFrontProductImages = async (): Promise<{ images: string[], selectedIndices: number[] }> => {
    if (!db) {
        console.log('getFrontProductImages: db is null');
        return { images: [], selectedIndices: [] };
    }
    try {
        console.log('Fetching front product images from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        let selectedIndices: number[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'front_product_images') {
                const data = d.data();
                images = data.images || [];
                selectedIndices = data.selectedIndices || [];
            }
        });

        console.log(`Fetched ${images.length} front product images from cloud`);
        return { images, selectedIndices };
    } catch (e) {
        console.error('Get front product images error:', e);
        return { images: [], selectedIndices: [] };
    }
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
export const saveCampaignMainImages = async (images: string[]): Promise<boolean> => {
    if (!db || !storage) {
        console.log('saveCampaignMainImages: db or storage is null');
        return false;
    }
    try {
        console.log(`Saving ${images.length} campaign main images to cloud...`);

        // Upload all images to Storage
        const imageUrls = await Promise.all(
            images.map((img, i) => uploadCampaignMainImage(img, i))
        );

        // Save URLs to Firestore
        const docRef = doc(db, 'settings', 'campaign_main_images');
        await setDoc(docRef, {
            images: imageUrls,
            updatedAt: Date.now()
        });

        console.log('Campaign main images saved successfully');
        return true;
    } catch (e) {
        console.error('Save campaign main images error:', e);
        return false;
    }
};

// Get campaign main images from Firestore
export const getCampaignMainImages = async (): Promise<{ images: string[] }> => {
    if (!db) {
        console.log('getCampaignMainImages: db is null');
        return { images: [] };
    }
    try {
        console.log('Fetching campaign main images from cloud...');
        const docSnap = await getDocs(collection(db, 'settings'));

        let images: string[] = [];
        docSnap.forEach((d) => {
            if (d.id === 'campaign_main_images') {
                const data = d.data();
                images = data.images || [];
            }
        });

        console.log(`Fetched ${images.length} campaign main images from cloud`);
        return { images };
    } catch (e) {
        console.error('Get campaign main images error:', e);
        return { images: [] };
    }
};
