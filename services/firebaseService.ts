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

// Get all images from Firebase Storage
export const getCloudImages = async (): Promise<CloudImage[]> => {
    if (!storage) return [];
    try {
        const listRef = ref(storage, 'flyers');
        const result = await listAll(listRef);

        // 並列でURLを取得（N+1問題の解消）
        const imagePromises = result.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            // Extract timestamp from filename (format: flyer_TIMESTAMP.png)
            const match = itemRef.name.match(/flyer_(\d+)/);
            const timestamp = match ? parseInt(match[1]) : Date.now();
            return {
                id: itemRef.name,
                url,
                createdAt: timestamp
            };
        });

        const images = await Promise.all(imagePromises);

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
        return true;
    } catch (e) {
        console.error('Delete error:', e);
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
