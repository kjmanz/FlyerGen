import React from 'react';
import type { FrontFlyerType } from '../types';
import type { MainTabType } from './MainTabs';

export interface FlyerSetupChecklistProps {
  apiKey: string;
  onOpenSettings: () => void;
  mainTab: MainTabType;
  frontFlyerType: FrontFlyerType;
  salesLetterMode: boolean;
  campaignDescription: string;
  campaignHeadline: string;
  campaignName: string;
  campaignContent: string;
  productServiceTitle: string;
  productsCount: number;
  hasRecommendedAssets: boolean;
}

function CheckRow({
  ok,
  label,
  detail,
  action,
}: {
  ok: boolean;
  label: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
        }`}
        aria-hidden
      >
        {ok ? '✓' : '!'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-800">{label}</div>
        <p className="mt-0.5 text-xs text-slate-500 leading-snug">{detail}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export const FlyerSetupChecklist: React.FC<FlyerSetupChecklistProps> = ({
  apiKey,
  onOpenSettings,
  mainTab,
  frontFlyerType,
  salesLetterMode,
  campaignDescription,
  campaignHeadline,
  campaignName,
  campaignContent,
  productServiceTitle,
  productsCount,
  hasRecommendedAssets,
}) => {
  const apiOk = !!apiKey.trim();

  let contentOk = false;
  let contentDetail = '';

  if (mainTab === 'back') {
    contentOk = productsCount > 0;
    contentDetail = contentOk
      ? `掲載商品 ${productsCount}件が設定されています。`
      : '裏面では「掲載商品」に1件以上あるとスムーズです。';
  } else if (frontFlyerType === 'campaign') {
    const hasCampaignText =
      !!campaignDescription.trim() ||
      !!campaignHeadline.trim() ||
      !!campaignName.trim() ||
      !!campaignContent.trim();
    contentOk = hasCampaignText;
    contentDetail = contentOk
      ? 'キャンペーン情報が入力されています。'
      : '「何のキャンペーン？」やヘッドライン・キャンペーン名のいずれかを入力してください。';
  } else {
    const hasProductIntro = !!productServiceTitle.trim();
    const hasProducts = productsCount > 0;
    contentOk = hasProductIntro || hasProducts;
    contentDetail = salesLetterMode
      ? contentOk
        ? 'セールスレター用の入力があります。'
        : '商品名の一括検索用フィールド、または掲載商品を埋めてください。'
      : contentOk
        ? '商品・サービス紹介の入力があります。'
        : '「紹介したいもの」または掲載商品を設定してください。';
  }

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">生成までのチェック</h2>
      <p className="mb-3 text-xs text-slate-500">次の3点を意識すると、生成がスムーズです。</p>
      <div className="divide-y divide-slate-100 rounded-md border border-slate-100 bg-slate-50/50 px-3">
        <CheckRow
          ok={apiOk}
          label="1. API 接続"
          detail={apiOk ? 'Gemini API が設定されています。' : 'API キーが未設定です。生成には設定が必要です。'}
          action={
            !apiOk ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                API 設定を開く
              </button>
            ) : undefined
          }
        />
        <CheckRow ok={contentOk} label="2. チラシの内容" detail={contentDetail} />
        <CheckRow
          ok={hasRecommendedAssets}
          label="3. 推奨アセット（任意）"
          detail={
            hasRecommendedAssets
              ? 'キャラ・参考画像などが1つ以上あります。'
              : 'キャラクターや参考デザインを追加すると再現性が上がります（サイドバー「2 · アセット」）。'
          }
        />
      </div>
    </div>
  );
};
