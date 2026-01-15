import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { get, set } from 'idb-keyval';
import { Product, FlyerSettings, GeneratedImage, Preset } from './types';
import { ProductCard } from './components/ProductCard';
import { ImageUploader } from './components/ImageUploader';
import { generateFlyerImage } from './services/geminiService';

const DB_KEY_HISTORY = 'flyergen_history_v1';
const DB_KEY_PRESETS = 'flyergen_presets_v1';
const DB_KEY_API_KEY = 'flyergen_api_key';

const App: React.FC = () => {
  // State
  const [products, setProducts] = useState<Product[]>([
    { id: uuidv4(), images: [], productCode: '', productName: '', specs: '', originalPrice: '', salePrice: '', salePriceLabel: '', catchCopy: '' }
  ]);
  const [characterImages, setCharacterImages] = useState<string[]>([]);
  const [characterClothingMode, setCharacterClothingMode] = useState<'fixed' | 'match'>('fixed');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [storeLogoImages, setStoreLogoImages] = useState<string[]>([]);
  const [settings, setSettings] = useState<FlyerSettings>({
    orientation: 'vertical',
    imageSize: '2K',
    patternCount: 1,
    backgroundMode: 'creative',
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

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [tempApiKey, setTempApiKey] = useState<string>("");

  // Download Dropdown State
  const [openDownloadMenu, setOpenDownloadMenu] = useState<string | null>(null);

  // Preset Load Confirmation Modal State
  const [presetToLoad, setPresetToLoad] = useState<Preset | null>(null);



  // Load History, Presets & API Key from IDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedHistory, savedPresets, savedApiKey] = await Promise.all([
          get<GeneratedImage[]>(DB_KEY_HISTORY),
          get<Preset[]>(DB_KEY_PRESETS),
          get<string>(DB_KEY_API_KEY)
        ]);

        if (savedHistory) setHistory(savedHistory);
        if (savedPresets) setPresets(savedPresets);
        if (savedApiKey) {
          setApiKey(savedApiKey);
          setTempApiKey(savedApiKey);
        }
      } catch (e) {
        console.error("Failed to load data", e);
      }
    };
    loadData();
  }, []);

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

  const handleGenerate = async () => {
    if (!apiKey) {
      setIsSettingsOpen(true);
      alert("APIキーが設定されていません。設定画面からGemini APIキーを入力してください。");
      return;
    }

    setIsGenerating(true);

    try {
      const results = await generateFlyerImage(products, settings, characterImages, characterClothingMode, referenceImages, storeLogoImages, apiKey);

      const newItems: GeneratedImage[] = results.map(data => ({
        id: uuidv4(),
        data,
        createdAt: Date.now()
      }));

      const updatedHistory = [...newItems, ...history];
      setHistory(updatedHistory);
      await set(DB_KEY_HISTORY, updatedHistory);

    } catch (e) {
      alert("チラシの生成に失敗しました。時間をおいて再試行してください。");
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!window.confirm("この画像を削除してもよろしいですか？")) return;

    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
    await set(DB_KEY_HISTORY, updatedHistory);
  };

  const handleUseAsReference = (imageData: string) => {
    setReferenceImages(prev => [...prev, imageData]);
    alert("「参考チラシ画像」に追加しました！");
    const refSection = document.getElementById('reference-section');
    if (refSection) {
      refSection.scrollIntoView({ behavior: 'smooth' });
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
            // Explicit filename and MIME type
            const filename = `Flyer_${formatDateForFilename(timestamp)}.jpg`;
            triggerDownload(blob, filename, 'image/jpeg');
          }
        }, 'image/jpeg', 0.95);
      }
    };
    img.src = imageData;
    setOpenDownloadMenu(null);
  };

  const handleDownloadPng = (imageData: string, timestamp: number) => {
    const blob = dataUrlToBlob(imageData, 'image/png');
    const filename = `Flyer_${formatDateForFilename(timestamp)}.png`;
    triggerDownload(blob, filename, 'image/png');
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

    let targetId = uuidv4();
    if (!asNew && currentPresetId) {
      targetId = currentPresetId;
    }

    // Clone data to avoid reference issues
    const newPreset: Preset = {
      id: targetId,
      name: savePresetName,
      products: JSON.parse(JSON.stringify(products)),
      characterImages: [...characterImages],
      characterClothingMode: characterClothingMode,
      referenceImages: [...referenceImages],
      storeLogoImages: [...storeLogoImages],
      settings: { ...settings },
      updatedAt: Date.now()
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
    await set(DB_KEY_PRESETS, updatedPresets);

    setIsSaveModalOpen(false);
    // Optional: Show a toast or small notification instead of alert
    alert(`「${savePresetName}」を保存しました`);
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
    setCharacterImages(data.characterImages || []);
    setCharacterClothingMode(data.characterClothingMode || 'fixed');
    setReferenceImages(data.referenceImages || []);
    setStoreLogoImages(data.storeLogoImages || []);

    // Ensure settings has all required fields with defaults
    setSettings({
      orientation: data.settings?.orientation || 'vertical',
      imageSize: data.settings?.imageSize || '2K',
      patternCount: data.settings?.patternCount || 1,
      backgroundMode: data.settings?.backgroundMode || 'creative',
      additionalInstructions: data.settings?.additionalInstructions || ''
    });

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
    }
  };

  const handleNewProject = () => {
    if (window.confirm("現在の入力をクリアして新規作成しますか？")) {
      setProducts([{ id: uuidv4(), images: [], productCode: '', productName: '', specs: '', originalPrice: '', salePrice: '', salePriceLabel: '', catchCopy: '' }]);
      setCharacterImages([]);
      setReferenceImages([]);
      setStoreLogoImages([]);
      setSettings({
        orientation: 'vertical',
        imageSize: '2K',
        patternCount: 1,
        backgroundMode: 'creative',
        additionalInstructions: ''
      });
      setCurrentPresetId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen pb-32 bg-slate-50/50">
      {/* Header */}
      <header className="glass sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg">
              <span className="text-white font-black text-xl">F</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              FlyerGen <span className="text-indigo-600">AI</span>
              <span className="ml-2 text-xs font-medium text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded-md bg-white">v1.2</span>
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setShowPresetList(!showPresetList)}
              className="text-sm font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400 group-hover:text-indigo-500 transition-colors" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
              プリセット
            </button>
            <button
              onClick={() => { setTempApiKey(apiKey); setIsSettingsOpen(true); }}
              className={`text-sm px-4 py-1.5 rounded-full font-bold flex items-center gap-2 transition-all ${apiKey ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}
            >
              <div className={`w-2 h-2 rounded-full ${apiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              {apiKey ? 'API Active' : 'API Key Required'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">

        {/* Preset Management Section */}
        {showPresetList && (
          <div className="bg-white/40 backdrop-blur-md border border-indigo-100 rounded-3xl p-8 mb-10 animate-slide-up shadow-xl shadow-indigo-500/5">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📂</span>
                <h2 className="text-xl font-black text-slate-900">Saved Presets</h2>
              </div>
              <button
                onClick={handleNewProject}
                className="text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-4 py-2 rounded-full transition-all"
              >
                ＋ Create New
              </button>
            </div>
            {presets.length === 0 ? (
              <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm font-medium">No presets saved yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {presets.map(preset => (
                  <div
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset)}
                    className={`group bg-white p-5 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${currentPresetId === preset.id ? 'border-indigo-500 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">{preset.name}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2 flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Updated {new Date(preset.updatedAt).toLocaleDateString()}
                        </p>
                        <div className="flex gap-2 mt-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded-md">{preset.products?.length || 0} Products</span>
                          <span className="px-2 py-0.5 bg-indigo-50 text-[10px] font-bold text-indigo-500 rounded-md">{preset.settings?.orientation === 'vertical' ? 'Portrait' : 'Landscape'}</span>
                        </div>
                      </div>
                      <div className="pl-2">
                        <button
                          onClick={(e) => handleDeletePreset(preset.id, e)}
                          className="bg-slate-50 hover:bg-rose-50 text-slate-300 hover:text-rose-500 p-2 rounded-xl transition-all group-hover:opacity-100 sm:opacity-0"
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

        {/* Action Bar for Current State */}
        <div className="glass border-slate-200/50 rounded-3xl p-5 mb-10 flex items-center justify-between sticky top-20 z-20 shadow-xl shadow-slate-200/20">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${currentPresetId ? 'bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'bg-slate-300'}`}></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Current Status</p>
              {currentPresetId ? (
                <p className="font-extrabold text-indigo-700">
                  Editing: {presets.find(p => p.id === currentPresetId)?.name || 'Unsaved Preset'}
                </p>
              ) : (
                <p className="font-extrabold text-slate-700">New Project (Unsaved)</p>
              )}
            </div>
          </div>
          <button
            onClick={openSaveModal}
            className="btn-premium flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Save Preset
          </button>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-[32px] shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>

          <div className="flex items-center gap-3 mb-8 relative">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">⚙️</div>
            <h2 className="text-xl font-black text-slate-900">Output Configuration</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10 relative">
            {/* Background Mode */}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Background Mode</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex flex-col gap-3 p-4 border-2 rounded-2xl cursor-pointer transition-all ${settings.backgroundMode === 'creative' ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'creative'} onChange={() => setSettings({ ...settings, backgroundMode: 'creative' })} />
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-rose-400 to-indigo-500 flex items-center justify-center text-lg shadow-inner">✨</div>
                  <div>
                    <div className="text-sm font-black text-slate-900">Creative</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">AI Recommendations</div>
                  </div>
                </label>
                <label className={`flex-1 flex flex-col gap-3 p-4 border-2 rounded-2xl cursor-pointer transition-all ${settings.backgroundMode === 'white' ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'white'} onChange={() => setSettings({ ...settings, backgroundMode: 'white' })} />
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg shadow-sm border border-slate-200">⬜</div>
                  <div>
                    <div className="text-sm font-black text-slate-900">White</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Clean & Simple</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Orientation */}
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Flyer Format</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex flex-col items-center justify-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${settings.orientation === 'vertical' ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="orientation" className="sr-only" checked={settings.orientation === 'vertical'} onChange={() => setSettings({ ...settings, orientation: 'vertical' })} />
                  <div className="w-6 h-9 border-[2.5px] border-slate-400 mx-auto mb-2 rounded-md bg-white shadow-sm"></div>
                  <span className="text-sm font-black text-slate-900">Portrait</span>
                </label>
                <label className={`flex-1 flex flex-col items-center justify-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${settings.orientation === 'horizontal' ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="orientation" className="sr-only" checked={settings.orientation === 'horizontal'} onChange={() => setSettings({ ...settings, orientation: 'horizontal' })} />
                  <div className="w-9 h-6 border-[2.5px] border-slate-400 mx-auto mb-2 rounded-md bg-white shadow-sm"></div>
                  <span className="text-sm font-black text-slate-900">Landscape</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Resolution & Quality</label>
              <div className="relative">
                <select
                  value={settings.imageSize}
                  onChange={(e) => setSettings({ ...settings, imageSize: e.target.value as any })}
                  className="block w-full rounded-2xl border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-bold appearance-none transition-all hover:border-slate-300"
                >
                  <option value="1K">1K (Standard • Fast)</option>
                  <option value="2K">2K (High Definition)</option>
                  <option value="4K">4K (Premium Ultra)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Variations</label>
              <div className="relative">
                <select
                  value={settings.patternCount}
                  onChange={(e) => setSettings({ ...settings, patternCount: parseInt(e.target.value) })}
                  className="block w-full rounded-2xl border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-bold appearance-none transition-all hover:border-slate-300"
                >
                  {[1, 2, 3, 4, 5].map(v => (
                    <option key={v} value={v}>{v} {v === 1 ? 'Pattern' : 'Patterns'}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">📱</div>
              <h2 className="text-xl font-black text-slate-900">Featured Products</h2>
            </div>
            <button
              onClick={addProduct}
              className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-bold rounded-2xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all shadow-sm active:scale-95"
            >
              ＋ Add Product
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
                apiKey={apiKey}
              />
            ))}
          </div>
        </div>

        {/* Global Assets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-[32px] shadow-premium border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">👤</div>
              <h3 className="text-lg font-black text-slate-900">Characters</h3>
            </div>
            <ImageUploader
              label="Store characters, mascots, or illustrations"
              images={characterImages}
              onImagesChange={setCharacterImages}
            />
            {characterImages.length > 0 && (
              <div className="mt-6 p-5 bg-slate-50/80 rounded-2xl border border-slate-100">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Character Outfit Mode</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center gap-2.5 p-3 border-2 rounded-xl cursor-pointer transition-all text-xs font-bold ${characterClothingMode === 'fixed' ? 'border-indigo-600 bg-white shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                    <input type="radio" name="clothingMode" className="sr-only" checked={characterClothingMode === 'fixed'} onChange={() => setCharacterClothingMode('fixed')} />
                    <span>👔 Keep Original</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2.5 p-3 border-2 rounded-xl cursor-pointer transition-all text-xs font-bold ${characterClothingMode === 'match' ? 'border-indigo-600 bg-white shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                    <input type="radio" name="clothingMode" className="sr-only" checked={characterClothingMode === 'match'} onChange={() => setCharacterClothingMode('match')} />
                    <span>🎨 Match Flyer Design</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <div id="reference-section" className="bg-white rounded-[32px] shadow-premium border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">🖼️</div>
              <h3 className="text-lg font-black text-slate-900">Reference Designs</h3>
            </div>
            <ImageUploader
              label="Flyers for design inspiration"
              images={referenceImages}
              onImagesChange={setReferenceImages}
            />
          </div>
        </div>

        {/* Store Logo */}
        <div className="bg-white rounded-[32px] shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">🏪</div>
            <h3 className="text-lg font-black text-slate-900">Store Branding</h3>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-6 ml-11">Appears at the footer of the flyer</p>
          <ImageUploader
            label="Upload store logo image"
            images={storeLogoImages}
            onImagesChange={setStoreLogoImages}
            multiple={false}
          />
        </div>

        {/* Additional Instructions */}
        <div className="bg-white rounded-[32px] shadow-premium border border-slate-100 p-8 mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-sm">📝</div>
            <h3 className="text-lg font-black text-slate-900">Special Instructions</h3>
          </div>
          <textarea
            rows={4}
            placeholder="e.g. Winter appliance sale, warm design tones, focused on family..."
            value={settings.additionalInstructions}
            onChange={(e) => setSettings({ ...settings, additionalInstructions: e.target.value })}
            className="block w-full rounded-2xl border-slate-200 border-2 py-4 px-5 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-slate-50/30 text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
          />
        </div>

        <div className="flex justify-center mb-20">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`
               btn-premium inline-flex items-center px-12 py-5 border border-transparent text-xl font-black rounded-[24px] shadow-2xl text-white 
               ${isGenerating ? 'bg-slate-400 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 hover:scale-105 active:scale-95 shadow-indigo-500/30'}
               focus:outline-none transition-all duration-300
             `}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-4 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span className="tracking-tight uppercase">Generating Magic...</span>
              </>
            ) : (
              <>
                <span className="mr-3 text-2xl">✨</span>
                <span className="tracking-tight uppercase">Generate Flyer</span>
              </>
            )}
          </button>
        </div>

        {/* History Results */}
        {history.length > 0 && (
          <div className="bg-white/60 backdrop-blur-sm rounded-[40px] shadow-premium border border-white/50 p-8 sm:p-12 animate-slide-up">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center text-lg">📁</div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Generation Gallery <span className="text-indigo-600 ml-2">({history.length})</span></h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {history.map((item, idx) => (
                <div key={item.id} className="group flex flex-col bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
                  <div className="bg-slate-50/50 p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 flex justify-between items-center px-5">
                    <span className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                      {new Date(item.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={() => handleDeleteImage(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors bg-white w-6 h-6 flex items-center justify-center rounded-lg shadow-sm" title="Delete">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>

                  <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                    <img src={item.data} alt="Generated Flyer" className="w-full h-full object-contain transform transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-6 justify-center">
                      <button
                        onClick={() => window.open(item.data, '_blank')}
                        className="bg-white/20 backdrop-blur-md text-white border border-white/30 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-indigo-600 transition-all shadow-xl"
                      >
                        View Fullscreen
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons - Below Image */}
                  <div className="p-4 bg-white flex gap-3">
                    {/* Download Button with Dropdown */}
                    <div className="relative flex-[2]">
                      <button
                        onClick={() => setOpenDownloadMenu(openDownloadMenu === item.id ? null : item.id)}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/10 transition-all active:scale-95"
                      >
                        Download
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${openDownloadMenu === item.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Dropdown Menu - appears above button */}
                      {openDownloadMenu === item.id && (
                        <div className="absolute bottom-full left-0 right-0 mb-3 bg-white/90 backdrop-blur-xl border border-indigo-50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 overflow-hidden animate-slide-up">
                          <button
                            onClick={() => handleDownloadPng(item.data, item.createdAt)}
                            className="w-full text-left px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-4"
                          >
                            <span className="w-10 h-6 bg-emerald-500 text-white text-[9px] font-black rounded flex items-center justify-center">PNG</span>
                            <span>HQ IMAGE</span>
                          </button>
                          <button
                            onClick={() => handleDownloadJpg(item.data, item.createdAt)}
                            className="w-full text-left px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-4 border-t border-slate-50"
                          >
                            <span className="w-10 h-6 bg-amber-500 text-white text-[9px] font-black rounded flex items-center justify-center">JPG</span>
                            <span>OPTIMIZED</span>
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(item.data, item.createdAt)}
                            className="w-full text-left px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-4 border-t border-slate-50"
                          >
                            <span className="w-10 h-6 bg-rose-500 text-white text-[9px] font-black rounded flex items-center justify-center">PDF</span>
                            <span>DOCUMENT</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Reference Button */}
                    <button
                      onClick={() => handleUseAsReference(item.data)}
                      className="flex-1 flex items-center justify-center bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 p-3 rounded-2xl transition-all active:scale-95 border border-slate-100"
                      title="Use as Reference"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
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
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl mb-6 shadow-inner border border-indigo-100">💾</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Save Preset</h3>
            <p className="text-sm font-medium text-slate-400 mb-8">Store current configuration for future use.</p>

            <div className="mb-8">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Preset Name</label>
              <input
                type="text"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                placeholder="e.g. Winter Sale 2026"
                className="w-full border-2 border-slate-100 rounded-2xl shadow-sm py-4 px-5 focus:ring-0 focus:border-indigo-600 bg-slate-50/50 text-slate-900 font-bold placeholder:text-slate-300 transition-all auto-focus"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-3">
              {currentPresetId && (
                <button
                  onClick={() => executeSavePreset(false)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                  Overwrite Existing
                </button>
              )}
              <button
                onClick={() => executeSavePreset(true)}
                className={`w-full font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl transition-all border-2 active:scale-95 ${currentPresetId ? 'bg-white text-indigo-600 border-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-lg shadow-indigo-600/20'}`}
              >
                {currentPresetId ? 'Save as New Preset' : 'Save Prescription'}
              </button>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="w-full mt-2 text-slate-400 hover:text-slate-600 text-xs font-black uppercase tracking-[0.2em] py-2 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-xl mb-6 shadow-inner border border-amber-100">🔑</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">API Connection</h3>
            <p className="text-sm font-medium text-slate-400 mb-8">Secure your access to Gemini AI services.</p>

            <div className="mb-8">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Gemini API Key</label>
              <input
                type="password"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder="Paste your API key here..."
                className="w-full border-2 border-slate-100 rounded-2xl shadow-sm py-4 px-5 focus:ring-0 focus:border-indigo-600 bg-slate-50/50 text-slate-900 font-bold placeholder:text-slate-300 transition-all"
                autoFocus
              />
              <div className="mt-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <p className="text-[11px] font-bold text-indigo-700 leading-relaxed flex items-start gap-3">
                  <span className="text-lg">💡</span>
                  <span>
                    Get your free API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline font-black">Google AI Studio</a>. Keys are stored locally on your device.
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSaveApiKey}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
              >
                Secure & Connect
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full mt-2 text-slate-400 hover:text-slate-600 text-xs font-black uppercase tracking-[0.2em] py-2 transition-colors"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preset Load Confirmation Modal */}
      {presetToLoad && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8 animate-slide-up border border-white">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl mb-6 shadow-inner border border-indigo-100">📥</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Load Preset</h3>
            <p className="text-sm font-medium text-slate-400 mb-8 leading-relaxed">
              Applying "<span className="text-indigo-600 font-black">{presetToLoad.name}</span>".
              Existing unsaved data will be replaced.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={confirmLoadPreset}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                autoFocus
              >
                Confirm Load
              </button>
              <button
                onClick={() => setPresetToLoad(null)}
                className="w-full mt-2 bg-slate-50 hover:bg-slate-100 text-slate-500 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl transition-all active:scale-95"
              >
                Nevermind
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
