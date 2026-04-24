import React from 'react';
import { uiTierLabelAccent } from './uiTokens';

export interface SidebarContextSummary {
  title: string;
  subtitle: string;
  presetName: string | null;
}

interface SidebarContextCardProps {
  summary: SidebarContextSummary;
}

export const SidebarContextCard: React.FC<SidebarContextCardProps> = ({ summary }) => {
  return (
    <div className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className={`${uiTierLabelAccent} mb-1.5`}>1 · 文脈</div>
      <p className="text-sm font-bold text-slate-900 leading-snug">{summary.title}</p>
      <p className="text-xs text-slate-600 mt-1.5 line-clamp-3 break-words">{summary.subtitle}</p>
      {summary.presetName ? (
        <p className="text-xs font-semibold text-indigo-700 mt-2 truncate" title={summary.presetName}>
          プリセット: {summary.presetName}
        </p>
      ) : (
        <p className="text-xs text-slate-400 mt-2">プリセット未選択（新規）</p>
      )}
    </div>
  );
};
