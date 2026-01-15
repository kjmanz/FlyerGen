// Firebase configuration
// ユーザーはFirebaseコンソールで自分のプロジェクトを作成し、
// この設定をFirebase設定画面からコピーして置き換えてください

import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';

// Firebase configuration - ユーザーが自分のFirebaseプロジェクトの設定に置き換える
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let app: ReturnType<typeof initializeApp> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

// Initialize Firebase only if config is set
export const initFirebase = (config?: typeof firebaseConfig) => {
    const cfg = config || firebaseConfig;
    if (!cfg.apiKey || !cfg.projectId) {
        console.log('Firebase not configured');
        return false;
    }
    try {
        app = initializeApp(cfg);
        storage = getStorage(app);
        db = getFirestore(app);
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
    if (!storage) return null;
    try {
        const imageRef = ref(storage, `flyers/${filename}`);
        await uploadString(imageRef, base64Data, 'data_url');
        const url = await getDownloadURL(imageRef);
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
        const images: CloudImage[] = [];

        for (const itemRef of result.items) {
            const url = await getDownloadURL(itemRef);
            // Extract timestamp from filename (format: flyer_TIMESTAMP.png)
            const match = itemRef.name.match(/flyer_(\d+)/);
            const timestamp = match ? parseInt(match[1]) : Date.now();
            images.push({
                id: itemRef.name,
                url,
                createdAt: timestamp
            });
        }

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

// Save preset to Firestore
export const saveCloudPreset = async (preset: CloudPreset): Promise<boolean> => {
    if (!db) return false;
    try {
        const docRef = doc(db, 'presets', preset.id);
        await setDoc(docRef, {
            ...preset,
            updatedAt: Date.now()
        });
        return true;
    } catch (e) {
        console.error('Save preset error:', e);
        return false;
    }
};

// Get all presets from Firestore
export const getCloudPresets = async (): Promise<CloudPreset[]> => {
    if (!db) return [];
    try {
        const querySnapshot = await getDocs(collection(db, 'presets'));
        const presets: CloudPreset[] = [];
        querySnapshot.forEach((doc) => {
            presets.push({ id: doc.id, ...doc.data() } as CloudPreset);
        });
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
