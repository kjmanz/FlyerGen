import React from 'react';
import type { BrandRules, FlyerSettings } from '../types';
import { BRAND_TONE_LABELS } from '../brandToneLabels';
import { uiFieldLabel, uiTierLabel } from './uiTokens';

interface SidebarGenerationOptionsProps {
  settings: FlyerSettings;
  setSettings: React.Dispatch<React.SetStateAction<FlyerSettings>>;
  activeBrandRules: BrandRules;
  updateBrandRules: (patch: Partial<BrandRules>) => void;
  isBrandRulesDetailOpen: boolean;
  setIsBrandRulesDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SidebarGenerationOptions: React.FC<SidebarGenerationOptionsProps> = ({
  settings,
  setSettings,
  activeBrandRules,
  updateBrandRules,
  isBrandRulesDetailOpen,
  setIsBrandRulesDetailOpen,
}) => {
  return (
    <div className="mb-2">
      <div className={`${uiTierLabel} mb-3`}>3 · 生成オプション</div>

      <div className="mb-4">
        <label className={`${uiFieldLabel} mb-2`}>チラシ形式</label>
        <div className="flex gap-2">
          <label
            className={`flex-1 flex flex-col items-center p-2 border-2 rounded-md cursor-pointer transition-all ${settings.orientation === 'vertical' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'}`}
          >
            <input
              type="radio"
              name="orientation-sidebar"
              className="sr-only"
              checked={settings.orientation === 'vertical'}
              onChange={() => setSettings({ ...settings, orientation: 'vertical' })}
            />
            <div className="w-4 h-6 border-2 border-slate-400 rounded bg-white mb-1" />
            <span className="text-xs font-medium text-slate-700">縦</span>
          </label>
          <label
            className={`flex-1 flex flex-col items-center p-2 border-2 rounded-md cursor-pointer transition-all ${settings.orientation === 'horizontal' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'}`}
          >
            <input
              type="radio"
              name="orientation-sidebar"
              className="sr-only"
              checked={settings.orientation === 'horizontal'}
              onChange={() => setSettings({ ...settings, orientation: 'horizontal' })}
            />
            <div className="w-6 h-4 border-2 border-slate-400 rounded bg-white mb-1" />
            <span className="text-xs font-medium text-slate-700">横</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label className={`${uiFieldLabel} mb-1`}>解像度</label>
          <select
            value={settings.imageSize}
            onChange={(e) => setSettings({ ...settings, imageSize: e.target.value as FlyerSettings['imageSize'] })}
            className="w-full text-sm border border-slate-200 rounded-md py-2 px-2 bg-white font-medium"
          >
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>
        <div>
          <label className={`${uiFieldLabel} mb-1`}>パターン</label>
          <select
            value={settings.patternCount}
            onChange={(e) => setSettings({ ...settings, patternCount: parseInt(e.target.value, 10) })}
            className="w-full text-sm border border-slate-200 rounded-md py-2 px-2 bg-white font-medium"
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className={`${uiFieldLabel} mb-2`}>背景</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSettings({ ...settings, backgroundMode: 'creative' })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${settings.backgroundMode === 'creative' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            おまかせ
          </button>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, backgroundMode: 'white' })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${settings.backgroundMode === 'white' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            白
          </button>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, backgroundMode: 'custom' })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${settings.backgroundMode === 'custom' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            カスタム
          </button>
        </div>
        {settings.backgroundMode === 'custom' && (
          <textarea
            rows={2}
            placeholder="背景の指定..."
            value={settings.customBackground || ''}
            onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })}
            className="mt-2 w-full text-sm border border-slate-200 rounded-md py-2 px-2"
          />
        )}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label className="text-xs font-semibold text-slate-500">ブランドルール</label>
          <button
            type="button"
            onClick={() => updateBrandRules({ enabled: !activeBrandRules.enabled })}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${activeBrandRules.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
            title="ブランドルールを有効化"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${activeBrandRules.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
        <p className="text-xs text-slate-600 leading-snug mb-2">
          {activeBrandRules.enabled
            ? `${activeBrandRules.brandName?.trim() || 'ブランド名未設定'} · ${BRAND_TONE_LABELS[activeBrandRules.tone]}`
            : 'オフ（生成時のブランド縛りなし）'}
        </p>
        <button
          type="button"
          onClick={() => setIsBrandRulesDetailOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-md py-1.5 text-left text-xs font-bold text-indigo-600 hover:bg-indigo-50/60 px-1 -mx-1"
        >
          <span>{isBrandRulesDetailOpen ? '詳細を閉じる' : '色・フレーズ・ロゴ方針を編集'}</span>
          <span className={`text-slate-400 transition-transform ${isBrandRulesDetailOpen ? 'rotate-180' : ''}`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {isBrandRulesDetailOpen && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
            <input
              type="text"
              value={activeBrandRules.brandName}
              onChange={(e) => updateBrandRules({ brandName: e.target.value })}
              placeholder="ブランド名（例: ○○電器）"
              className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
              disabled={!activeBrandRules.enabled}
            />

            <select
              value={activeBrandRules.tone}
              onChange={(e) => updateBrandRules({ tone: e.target.value as BrandRules['tone'] })}
              className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
              disabled={!activeBrandRules.enabled}
            >
              <option value="trust">信頼感</option>
              <option value="friendly">親しみやすさ</option>
              <option value="premium">高級感</option>
              <option value="energetic">元気・活気</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                メイン色
                <input
                  type="color"
                  value={activeBrandRules.primaryColor}
                  onChange={(e) => updateBrandRules({ primaryColor: e.target.value })}
                  className="mt-1 h-8 w-full rounded border border-slate-200 bg-white"
                  disabled={!activeBrandRules.enabled}
                />
              </label>
              <label className="text-xs text-slate-500">
                補助色
                <input
                  type="color"
                  value={activeBrandRules.secondaryColor}
                  onChange={(e) => updateBrandRules({ secondaryColor: e.target.value })}
                  className="mt-1 h-8 w-full rounded border border-slate-200 bg-white"
                  disabled={!activeBrandRules.enabled}
                />
              </label>
            </div>

            <textarea
              rows={2}
              value={activeBrandRules.requiredPhrases.join('\n')}
              onChange={(e) =>
                updateBrandRules({
                  requiredPhrases: e.target.value
                    .split(/\n|,|、/)
                    .map((text) => text.trim())
                    .filter((text) => text.length > 0),
                })
              }
              placeholder="必須フレーズ（改行で複数）"
              className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
              disabled={!activeBrandRules.enabled}
            />

            <textarea
              rows={2}
              value={activeBrandRules.forbiddenPhrases.join('\n')}
              onChange={(e) =>
                updateBrandRules({
                  forbiddenPhrases: e.target.value
                    .split(/\n|,|、/)
                    .map((text) => text.trim())
                    .filter((text) => text.length > 0),
                })
              }
              placeholder="禁止フレーズ（改行で複数）"
              className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white"
              disabled={!activeBrandRules.enabled}
            />

            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={activeBrandRules.strictLogoPolicy}
                onChange={(e) => updateBrandRules({ strictLogoPolicy: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600"
                disabled={!activeBrandRules.enabled}
              />
              ロゴ改変を絶対禁止（強制）
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
