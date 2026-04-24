import React from 'react';
import { IcMenu, IcPlus, IcSparkles } from './inlineIcons';

export interface AppHeaderProps {
  onOpenSidebar: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  flyerSide: 'front' | 'back';
  onTogglePresetList: () => void;
  onOpenSaveModal: () => void;
  onOpenSettings: () => void;
  apiKey: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onOpenSidebar,
  onGenerate,
  isGenerating,
  flyerSide,
  onTogglePresetList,
  onOpenSaveModal,
  onOpenSettings,
  apiKey,
}) => {
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
            className={`text-xs sm:text-sm px-2 sm:px-3 lg:px-4 py-1.5 rounded-full font-bold flex items-center gap-1 sm:gap-2 transition-all ${isGenerating ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
          >
            {isGenerating ? (
              <>
                <IcPlus className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">キュー追加</span>
              </>
            ) : (
              <>
                <IcSparkles className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{flyerSide === 'front' ? '表面作成' : '裏面作成'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onTogglePresetList}
            className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            title="プリセット読み込み"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenSaveModal}
            className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            title="プリセット保存"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`p-2 rounded-full flex items-center gap-1.5 transition-all ${apiKey ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
            title={apiKey ? 'API 接続中' : 'APIキー未設定'}
          >
            <div className={`w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full ${apiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="hidden lg:inline text-xs font-bold">{apiKey ? '接続中' : '未設定'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
