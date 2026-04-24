import React from 'react';
import type { GenerationJob } from '../generationQueue';
import { getGenerationJobStatusConfig } from '../generationQueue';

function QueueListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

export interface GenerationQueueStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

interface GenerationQueuePanelProps {
  stats: GenerationQueueStats;
  jobs: GenerationJob[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClearFinished: () => void;
  activeGenerationJobId: string | null;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onRemoveJob: (jobId: string) => void;
}

export const GenerationQueuePanel: React.FC<GenerationQueuePanelProps> = ({
  stats,
  jobs,
  isExpanded,
  onToggleExpanded,
  onClearFinished,
  activeGenerationJobId,
  onCancelJob,
  onRetryJob,
  onRemoveJob,
}) => {
  if (stats.total <= 0) return null;

  return (
    <div className="mb-10 overflow-hidden rounded-lg border border-indigo-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-stretch gap-2 border-b border-indigo-50/80 p-3 sm:p-4">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left transition-colors hover:bg-slate-50"
        >
          <QueueListIcon className="h-5 w-5 flex-shrink-0 text-indigo-500" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">生成キュー</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {stats.total}件
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              実行中 {stats.running} · 待機 {stats.pending}
              <span className="hidden sm:inline">
                {' '}
                · 完了 {stats.completed}
                {stats.failed > 0 ? ` · 失敗 ${stats.failed}` : ''}
              </span>
              {' · '}
              {isExpanded ? 'タップで閉じる' : 'タップでジョブ一覧'}
            </p>
          </div>
          <span
            className={`flex-shrink-0 self-center text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          onClick={onClearFinished}
          className="self-center rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-all"
        >
          完了を整理
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2.5 p-4 sm:p-5 pt-3 sm:pt-4">
          <div className="flex flex-wrap gap-1.5 pb-1 text-xs">
            <span className="rounded-full bg-sky-50 px-2 py-0.5 font-bold text-sky-700">
              実行中 {stats.running}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
              待機 {stats.pending}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
              完了 {stats.completed}
            </span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">失敗 {stats.failed}</span>
          </div>
          {jobs.map((job) => {
            const status = getGenerationJobStatusConfig(job.status);
            const canCancel = job.status === 'pending' || job.status === 'running';
            const canRetry = job.status === 'failed' || job.status === 'canceled';
            const canRemove = job.status !== 'running' && activeGenerationJobId !== job.id;
            return (
              <div key={job.id} className="border border-slate-200 rounded-md p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      {job.side === 'front' ? '表面' : '裏面'} / {job.snapshot.settings.patternCount}案
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(job.createdAt).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all ${job.status === 'failed' ? 'bg-rose-500' : job.status === 'canceled' ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-600">
                    {job.error ? `${job.message}: ${job.error}` : job.message}
                  </div>
                  <div className="flex gap-1.5">
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => onCancelJob(job.id)}
                        className="text-xs font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
                      >
                        キャンセル
                      </button>
                    )}
                    {canRetry && (
                      <button
                        type="button"
                        onClick={() => onRetryJob(job.id)}
                        className="text-xs font-bold px-2.5 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 transition-all"
                      >
                        再試行
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemoveJob(job.id)}
                        className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
