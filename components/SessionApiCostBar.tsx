import React from 'react';
import { SESSION_API_COST_DISCLAIMER } from '../config/sessionApiCostYen';

type Props = {
  totalJpy: number;
  onReset: () => void;
};

const formatJpy = (n: number) => {
  if (Number.isInteger(n)) {
    return n.toLocaleString('ja-JP');
  }
  return n.toLocaleString('ja-JP', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
};

export const SessionApiCostBar: React.FC<Props> = ({ totalJpy, onReset }) => {
  return (
    <div className="mb-5 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">今回の作業の API 目安（円）</p>
          <p className="text-lg font-bold tabular-nums text-slate-900">
            約 {formatJpy(totalJpy)}<span className="text-sm font-semibold"> 円</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          目安をリセット
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{SESSION_API_COST_DISCLAIMER}</p>
    </div>
  );
};
