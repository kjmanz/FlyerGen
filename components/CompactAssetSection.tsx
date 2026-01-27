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
  ].slice(0, 4);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 hover:bg-slate-50 transition-colors text-left"
      >
        {/* Top row: Icon, Title, Arrow */}
        <div className="flex items-center gap-2 mb-2">
          {/* Icon */}
          <div className={`w-7 h-7 ${iconBgColor} border ${iconBorderColor} rounded-lg flex items-center justify-center text-sm flex-shrink-0`}>
            {icon}
          </div>

          {/* Title */}
          <h3 className="flex-1 text-sm font-bold text-slate-900 truncate">{title}</h3>

          {/* Badges */}
          {selectedCount > 0 && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {selectedCount}
            </span>
          )}
          {isCloudSync && (
            <span className="text-[10px] flex-shrink-0">☁️</span>
          )}

          {/* Expand/Collapse Arrow */}
          <div className={`w-5 h-5 flex items-center justify-center text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Bottom row: Thumbnails (when collapsed) */}
        {!isExpanded && images.length > 0 && (
          <div className="flex gap-1 mt-1">
            {prioritizedImages.map((img, idx) => (
              <div
                key={idx}
                className="w-10 h-10 rounded overflow-hidden border border-slate-200 flex-shrink-0"
              >
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
            {images.length > 4 && (
              <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">
                +{images.length - 4}
              </div>
            )}
          </div>
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-3">
          {children}
        </div>
      )}
    </div>
  );
};

export default CompactAssetSection;
