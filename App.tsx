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
    <div className="min-h-screen pb-32">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">FlyerGen AI - きょうしん</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowPresetList(!showPresetList)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
              プリセット管理
            </button>
            <button
              onClick={() => { setTempApiKey(apiKey); setIsSettingsOpen(true); }}
              className={`text-sm px-3 py-1 rounded-full font-medium flex items-center gap-1 ${apiKey ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {apiKey ? '✓ 設定済み' : '⚠ 設定'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Preset Management Section */}
        {showPresetList && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">📂 保存済みプリセット</h2>
              <button
                onClick={handleNewProject}
                className="text-sm text-gray-600 hover:text-blue-600 underline"
              >
                新規プロジェクト作成
              </button>
            </div>
            {presets.length === 0 ? (
              <p className="text-gray-500 text-sm">保存されたプリセットはありません。</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {presets.map(preset => (
                  <div
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset)}
                    className={`bg-white p-4 rounded-lg shadow-sm border cursor-pointer transition-all hover:shadow-md ${currentPresetId === preset.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-300'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{preset.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(preset.updatedAt).toLocaleDateString()} 更新
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          商品: {preset.products?.length || 0}点 / 背景: {preset.settings?.backgroundMode === 'white' ? '白' : 'おまかせ'}
                        </p>
                      </div>
                      <div className="pl-2">
                        <button
                          onClick={(e) => handleDeletePreset(preset.id, e)}
                          className="bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 p-2 rounded-full transition-colors z-20 relative"
                          title="削除"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-8 flex items-center justify-between sticky top-20 z-5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">現在の編集:</span>
            {currentPresetId ? (
              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                {presets.find(p => p.id === currentPresetId)?.name || '未保存のプリセット'}
              </span>
            ) : (
              <span className="font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">新規 (未保存)</span>
            )}
          </div>
          <button
            onClick={openSaveModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            プリセット保存
          </button>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">【出力設定】</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
            {/* Background Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">背景モード</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${settings.backgroundMode === 'creative' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'creative'} onChange={() => setSettings({ ...settings, backgroundMode: 'creative' })} />
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-200 to-pink-200 flex items-center justify-center text-xs border border-gray-300">✨</div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">おまかせ</div>
                    <div className="text-xs text-gray-500">AIが最適な背景を提案</div>
                  </div>
                </label>
                <label className={`flex-1 flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${settings.backgroundMode === 'white' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="backgroundMode" className="sr-only" checked={settings.backgroundMode === 'white'} onChange={() => setSettings({ ...settings, backgroundMode: 'white' })} />
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs border border-gray-300">⬜</div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">白背景</div>
                    <div className="text-xs text-gray-500">すっきりシンプルな白</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Orientation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">サイズ</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-all ${settings.orientation === 'vertical' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="orientation" className="sr-only" checked={settings.orientation === 'vertical'} onChange={() => setSettings({ ...settings, orientation: 'vertical' })} />
                  <div className="text-center">
                    <div className="w-6 h-8 border-2 border-gray-400 mx-auto mb-1 rounded-sm bg-white"></div>
                    <span className="text-sm font-medium">A4縦</span>
                  </div>
                </label>
                <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-all ${settings.orientation === 'horizontal' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="orientation" className="sr-only" checked={settings.orientation === 'horizontal'} onChange={() => setSettings({ ...settings, orientation: 'horizontal' })} />
                  <div className="text-center">
                    <div className="w-8 h-6 border-2 border-gray-400 mx-auto mb-1 rounded-sm bg-white"></div>
                    <span className="text-sm font-medium">A4横</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">解像度 (品質)</label>
              <select
                value={settings.imageSize}
                onChange={(e) => setSettings({ ...settings, imageSize: e.target.value as any })}
                className="block w-full rounded-md border-gray-300 border p-3 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white text-gray-900"
              >
                <option value="1K">1K (標準・高速)</option>
                <option value="2K">2K (高画質)</option>
                <option value="4K">4K (超高画質)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">生成パターン数</label>
              <select
                value={settings.patternCount}
                onChange={(e) => setSettings({ ...settings, patternCount: parseInt(e.target.value) })}
                className="block w-full rounded-md border-gray-300 border p-3 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white text-gray-900"
              >
                <option value="1">1 パターン</option>
                <option value="2">2 パターン</option>
                <option value="3">3 パターン</option>
                <option value="4">4 パターン</option>
                <option value="5">5 パターン</option>
              </select>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">【掲載機種】</h2>
            <button
              onClick={addProduct}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ＋ 機種を追加
            </button>
          </div>

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

        {/* Global Assets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-md font-bold text-gray-900 mb-4">【キャラ画像】</h3>
            <ImageUploader
              label="店舗キャラクター、イラストなど"
              images={characterImages}
              onImagesChange={setCharacterImages}
            />
            {characterImages.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">キャラ服装モード</label>
                <div className="flex gap-2">
                  <label className={`flex-1 flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-all text-sm ${characterClothingMode === 'fixed' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="clothingMode" className="sr-only" checked={characterClothingMode === 'fixed'} onChange={() => setCharacterClothingMode('fixed')} />
                    <span>👔 元の服装を維持</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-all text-sm ${characterClothingMode === 'match' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="clothingMode" className="sr-only" checked={characterClothingMode === 'match'} onChange={() => setCharacterClothingMode('match')} />
                    <span>🎨 チラシに合わせる</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <div id="reference-section" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-md font-bold text-gray-900 mb-4">【参考チラシ画像】</h3>
            <ImageUploader
              label="デザインの参考にしたいチラシ"
              images={referenceImages}
              onImagesChange={setReferenceImages}
            />
          </div>
        </div>

        {/* Store Logo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h3 className="text-md font-bold text-gray-900 mb-4">【店名ロゴ】</h3>
          <p className="text-xs text-gray-500 mb-2">※チラシ最下部に表示されます</p>
          <ImageUploader
            label="店名ロゴ画像"
            images={storeLogoImages}
            onImagesChange={setStoreLogoImages}
            multiple={false}
          />
        </div>

        {/* Additional Instructions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-12">
          <h3 className="text-md font-bold text-gray-900 mb-2">【追加指示】</h3>
          <textarea
            rows={4}
            placeholder="例: 冬物家電セール、暖かみのあるデザインで..."
            value={settings.additionalInstructions}
            onChange={(e) => setSettings({ ...settings, additionalInstructions: e.target.value })}
            className="block w-full rounded-md border-gray-300 border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 bg-white text-gray-900"
          />
        </div>

        <div className="flex justify-center mb-12">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`
               inline-flex items-center px-8 py-4 border border-transparent text-lg font-bold rounded-full shadow-lg text-white 
               ${isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:scale-105'}
               focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
               transition-all duration-200
             `}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                チラシを生成中...
              </>
            ) : (
              <>
                <span className="mr-2">🎨</span> チラシを生成
              </>
            )}
          </button>
        </div>

        {/* History Results */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">【生成履歴】 ({history.length}件)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.map((item, idx) => (
                <div key={item.id} className="flex flex-col border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="bg-gray-50 p-2 text-center text-sm font-bold text-gray-700 border-b border-gray-200 flex justify-between items-center px-4">
                    <span>{new Date(item.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <button onClick={() => handleDeleteImage(item.id)} className="text-gray-400 hover:text-red-500 p-1" title="削除">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>

                  <div className="aspect-[3/4] bg-gray-100">
                    <img src={item.data} alt="Generated Flyer" className="w-full h-full object-contain" />
                  </div>

                  {/* Action Buttons - Below Image */}
                  <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
                    {/* Download Button with Dropdown */}
                    <div className="relative flex-1">
                      <button
                        onClick={() => setOpenDownloadMenu(openDownloadMenu === item.id ? null : item.id)}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-bold text-sm shadow-sm transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        ダウンロード
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${openDownloadMenu === item.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Dropdown Menu - appears above button */}
                      {openDownloadMenu === item.id && (
                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                          <button
                            onClick={() => handleDownloadJpg(item.data, item.createdAt)}
                            className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3"
                          >
                            <span className="w-10 h-6 bg-gradient-to-r from-orange-400 to-orange-500 text-white text-xs font-bold rounded flex items-center justify-center shadow-sm">JPG</span>
                            <span>JPEG 画像でダウンロード</span>
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(item.data, item.createdAt)}
                            className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3 border-t border-gray-100"
                          >
                            <span className="w-10 h-6 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded flex items-center justify-center shadow-sm">PDF</span>
                            <span>PDF ドキュメントでダウンロード</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Reference Button */}
                    <button
                      onClick={() => handleUseAsReference(item.data)}
                      className="flex-1 flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md font-bold text-sm transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      参考にする
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">プリセットの保存</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">プリセット名</label>
              <input
                type="text"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                placeholder="例: エアコン冬祭り"
                className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              {currentPresetId && (
                <button
                  onClick={() => executeSavePreset(false)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                  上書き保存
                </button>
              )}
              <button
                onClick={() => executeSavePreset(true)}
                className={`w-full font-bold py-2 px-4 rounded transition-colors border ${currentPresetId ? 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700 border-transparent'}`}
              >
                {currentPresetId ? '新規として保存' : '保存'}
              </button>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="w-full mt-2 text-gray-600 hover:text-gray-800 py-2"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">⚙ API設定</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Gemini APIキー</label>
              <input
                type="password"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a> でAPIキーを取得できます。
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveApiKey}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                保存
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full mt-2 text-gray-600 hover:text-gray-800 py-2"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preset Load Confirmation Modal */}
      {presetToLoad && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">プリセットの読み込み</h3>
            <p className="text-gray-700 mb-6">
              プリセット「<span className="font-bold">{presetToLoad.name}</span>」を読み込みますか？<br />
              <span className="text-red-600 text-sm font-bold mt-2 block">※現在の入力内容はすべて破棄されます。</span>
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={confirmLoadPreset}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors"
                autoFocus
              >
                読み込む
              </button>
              <button
                onClick={() => setPresetToLoad(null)}
                className="w-full mt-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded transition-colors"
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