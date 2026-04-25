import React from 'react';
import { IcPlus, IcSparkles } from './inlineIcons';

export interface StickyGenerateBarProps {
  onGenerate: () => void;
  isGenerating: boolean;
  flyerSide: 'front' | 'back';
  disabled?: boolean;
}

export const StickyGenerateBar: React.FC<StickyGenerateBarProps> = ({
  onGenerate,
  isGenerating,
  flyerSide,
  disabled = false,
}) => {
  const sideLabel = flyerSide === 'front' ? '表面' : '裏面';
  const primaryLabel = isGenerating ? 'キューに追加' : `${sideLabel}チラシを生成`;

  return (
    <div
      className="flex-shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:px-6"
      role="region"
      aria-label="チラシ生成"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p className="hidden min-w-0 text-xs text-slate-500 sm:block">
          <span className="font-semibold text-slate-700">{sideLabel}</span>
          を生成します。ヘッダーのボタンと同じ操作です。
        </p>
        <p className="truncate text-xs text-slate-600 sm:hidden">
          <span className="font-bold text-slate-800">{sideLabel}</span>
        </p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={disabled}
          aria-label={
            isGenerating
              ? '生成ジョブをキューに追加'
              : `${sideLabel}チラシを生成してキューに送る`
          }
          title={primaryLabel}
          className={`inline-flex flex-shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-lg transition-all sm:px-8 sm:text-base ${
            disabled
              ? 'cursor-not-allowed bg-slate-200 text-slate-500'
              : isGenerating
                ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 text-white hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          {isGenerating ? (
            <IcPlus className="h-5 w-5 flex-shrink-0" />
          ) : (
            <IcSparkles className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="max-w-[10rem] truncate sm:max-w-none">{primaryLabel}</span>
        </button>
      </div>
    </div>
  );
};
