import React, { useEffect, useMemo, useState } from 'react';

type Accent = 'indigo' | 'emerald' | 'rose';

interface AssetSelectionGridProps {
  images: string[];
  selectedIndices: Set<number>;
  onToggleSelect: (index: number) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onRemoveDuplicates?: () => void;
  selectedCountLabel?: string;
  accent?: Accent;
  columns?: number;
  previewOnClick?: boolean;
  previewHintLabel?: string;
}

const ACCENT_STYLES: Record<Accent, { selected: string; badge: string }> = {
  indigo: { selected: 'border-indigo-600 ring-2 ring-indigo-200', badge: 'bg-indigo-600' },
  emerald: { selected: 'border-emerald-500 ring-2 ring-emerald-200', badge: 'bg-emerald-500' },
  rose: { selected: 'border-rose-600 ring-2 ring-rose-200', badge: 'bg-rose-600' }
};

export const AssetSelectionGrid: React.FC<AssetSelectionGridProps> = ({
  images,
  selectedIndices,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onRemoveDuplicates,
  selectedCountLabel,
  accent = 'indigo',
  columns = 4,
  previewOnClick = false,
  previewHintLabel = '画像クリックで拡大 / 右上で選択'
}) => {
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const selectedCount = selectedIndices.size;

  useEffect(() => {
    if (selectedCount === 0 && showOnlySelected) {
      setShowOnlySelected(false);
    }
  }, [selectedCount, showOnlySelected]);

  useEffect(() => {
    if (previewIndex === null) return;
    if (!images[previewIndex]) {
      setPreviewIndex(null);
    }
  }, [images, previewIndex]);

  useEffect(() => {
    if (previewIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewIndex]);

  const displayItems = useMemo(
    () =>
      images
        .map((img, idx) => ({ img, idx }))
        .filter(item => !showOnlySelected || selectedIndices.has(item.idx)),
    [images, selectedIndices, showOnlySelected]
  );

  const accentStyles = ACCENT_STYLES[accent];
  const canSelectAll = typeof onSelectAll === 'function';
  const canClearSelection = typeof onClearSelection === 'function';
  const previewImage = previewIndex !== null ? images[previewIndex] : null;

  if (images.length === 0) return null;

  const gridColsClass = columns === 3 ? 'grid-cols-3' : columns === 5 ? 'grid-cols-5' : 'grid-cols-4';

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-xs text-slate-500">
          {selectedCountLabel ?? `選択中: ${selectedCount}枚`}
        </div>
        <div className="flex flex-wrap gap-2">
          {canSelectAll && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              全選択
            </button>
          )}
          {canClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              解除
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowOnlySelected(prev => !prev)}
            disabled={selectedCount === 0}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
              showOnlySelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            } ${selectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={selectedCount === 0 ? '選択中の画像がありません' : '選択中のみ表示'}
          >
            選択のみ
          </button>
          {onRemoveDuplicates && (
            <button
              type="button"
              onClick={onRemoveDuplicates}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              重複削除
            </button>
          )}
        </div>
      </div>

      {previewOnClick && (
        <div className="text-[10px] text-slate-500 mb-2">{previewHintLabel}</div>
      )}

      <div className={`grid ${gridColsClass} gap-2`}>
        {displayItems.map(item => {
          const isSelected = selectedIndices.has(item.idx);
          return (
            <div
              key={item.idx}
              onClick={() => {
                if (previewOnClick) {
                  setPreviewIndex(item.idx);
                  return;
                }
                onToggleSelect(item.idx);
              }}
              className={`relative group aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                isSelected ? accentStyles.selected : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <img
                src={item.img}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
              {previewOnClick ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(item.idx);
                  }}
                  className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                    isSelected
                      ? `${accentStyles.badge} text-white`
                      : 'bg-white/90 border border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                  title={isSelected ? '選択解除' : 'この画像を選択'}
                >
                  {isSelected ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-[11px] font-bold leading-none">+</span>
                  )}
                </button>
              ) : (
                isSelected && (
                  <div className={`absolute top-1 right-1 w-5 h-5 ${accentStyles.badge} rounded-full flex items-center justify-center`}>
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {previewOnClick && previewImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewIndex(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage}
              alt={`preview-${previewIndex !== null ? previewIndex + 1 : ''}`}
              className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl"
              loading="eager"
              decoding="async"
            />
            <button
              type="button"
              onClick={() => setPreviewIndex(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/75 text-white text-lg leading-none flex items-center justify-center"
              aria-label="プレビューを閉じる"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetSelectionGrid;
