import React from 'react';
import { IcMenu, IcPlus, IcSparkles } from './inlineIcons';
import type { ImageGenerationProvider } from '../types';

export interface AppHeaderProps {
  onOpenSidebar: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  flyerSide: 'front' | 'back';
  onTogglePresetList: () => void;
  isPresetListOpen: boolean;
  onOpenSaveModal: () => void;
  onOpenSettings: () => void;
  isImageApiConfigured: boolean;
  imageProvider: ImageGenerationProvider;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onOpenSidebar,
  onGenerate,
  isGenerating,
  flyerSide,
  onTogglePresetList,
  isPresetListOpen,
  onOpenSaveModal,
  onOpenSettings,
  isImageApiConfigured,
  imageProvider,
}) => {
  const imageProviderLabel = imageProvider === 'openai' ? 'OpenAI' : 'Gemini';

  return (
    <header className="bg-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="チラシ設定"
          >
            <IcMenu />
          </button>
          <img src="./logo.png" alt="Logo" className="w-8 h-8 lg:w-10 lg:h-10 rounded-md" />
          <h1 className="text-base lg:text-xl font-semibold text-slate-900 tracking-tight hidden sm:block">
            チラシ作成ソフト
          </h1>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 lg:gap-4">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!isImageApiConfigured}
            aria-label={
              !isImageApiConfigured
                ? `${imageProviderLabel} APIキーを設定してから生成できます`
                : isGenerating
                  ? '生成ジョブをキューに追加'
                  : `${flyerSide === 'front' ? '表面' : '裏面'}チラシを生成`
            }
            title={
              !isImageApiConfigured
                ? `${imageProviderLabel} APIキー未設定`
                : isGenerating
                  ? 'キューに追加'
                  : `${flyerSide === 'front' ? '表面' : '裏面'}チラシを生成`
            }
            className={`text-xs sm:text-sm px-2 sm:px-3 lg:px-4 py-1.5 rounded-full font-bold flex items-center gap-1 sm:gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${isGenerating ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
          >
            {isGenerating ? (
              <>
                <IcPlus className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">キューに追加</span>
              </>
            ) : (
              <>
                <IcSparkles className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{flyerSide === 'front' ? '表面チラシ生成' : '裏面チラシ生成'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onTogglePresetList}
            aria-expanded={isPresetListOpen}
            aria-haspopup="dialog"
            className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all sm:px-3 ${isPresetListOpen ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
            title="保存済みプリセットを開く"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
            </svg>
            <span className="hidden md:inline">プリセット</span>
          </button>
          <button
            type="button"
            onClick={onOpenSaveModal}
            className="inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-indigo-50 hover:text-indigo-700 sm:px-3"
            title="プリセット保存"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
            <span className="hidden md:inline">保存</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`p-2 rounded-full flex items-center gap-1.5 transition-all ${isImageApiConfigured ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
            title={isImageApiConfigured ? `${imageProviderLabel} 画像生成API 接続中` : `${imageProviderLabel} APIキー未設定`}
          >
            <div className={`w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full ${isImageApiConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="hidden lg:inline text-xs font-bold">{isImageApiConfigured ? `${imageProviderLabel} 接続中` : `${imageProviderLabel} 未設定`}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
