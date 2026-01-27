import React, { useState } from 'react';

interface CompactAssetSectionProps {
  title: string;
  icon: string;
  iconBgColor?: string;
  iconBorderColor?: string;
  images: string[];
  selectedCount: number;
  selectedIndices?: number[];
  isCloudSync: boolean;
  children: React.ReactNode;
}

export const CompactAssetSection: React.FC<CompactAssetSectionProps> = ({
  title,
  icon,
  iconBgColor = 'bg-indigo-50',
  iconBorderColor = 'border-indigo-100',
  images,
  selectedCount,
  selectedIndices = [],
  isCloudSync,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedSet = new Set(selectedIndices);
  const prioritizedImages = [
    ...selectedIndices.map((index) => images[index]).filter(Boolean),
    ...images.filter((_, idx) => !selectedSet.has(idx))
  ].slice(0, 6);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
      >
        {/* Icon */}
        <div className={`w-8 h-8 ${iconBgColor} border ${iconBorderColor} rounded-lg flex items-center justify-center text-sm flex-shrink-0`}>
          {icon}
        </div>

        {/* Title & Status */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {selectedCount > 0 && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {selectedCount}枚選択中
            </span>
          )}
          {isCloudSync && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              ☁️
            </span>
          )}
        </div>

        {/* Thumbnails (collapsed state) */}
        {!isExpanded && images.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {prioritizedImages.map((img, idx) => (
              <div
                key={idx}
                className="w-8 h-8 rounded overflow-hidden border border-slate-200"
              >
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
            {images.length > 6 && (
              <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                +{images.length - 6}
              </div>
            )}
          </div>
        )}

        {/* Expand/Collapse Arrow */}
        <div className={`w-6 h-6 flex items-center justify-center text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default CompactAssetSection;
