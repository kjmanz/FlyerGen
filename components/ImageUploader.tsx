import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (newImages: string[]) => void;
  label?: string;
  multiple?: boolean;
  maxImages?: number;
  showStats?: boolean;
}

interface ImageMeta {
  width?: number;
  height?: number;
  sizeBytes?: number;
}

interface TrashImageItem {
  id: string;
  image: string;
  originalIndex: number;
  deletedAt: number;
}

const UNDO_WINDOW_MS = 8000;
const TRASH_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_TRASH_ITEMS = 30;

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onImagesChange,
  label,
  multiple = true,
  maxImages,
  showStats = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbnailMap, setThumbnailMap] = useState<Record<string, string>>({});
  const thumbnailMapRef = useRef<Record<string, string>>({});
  const [metaMap, setMetaMap] = useState<Record<string, ImageMeta>>({});
  const metaMapRef = useRef<Record<string, ImageMeta>>({});
  const [trashItems, setTrashItems] = useState<TrashImageItem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [pendingUndoItem, setPendingUndoItem] = useState<TrashImageItem | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    thumbnailMapRef.current = thumbnailMap;
  }, [thumbnailMap]);

  useEffect(() => {
    metaMapRef.current = metaMap;
  }, [metaMap]);

  const clearUndoTimer = () => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearUndoTimer();
    };
  }, []);

  useEffect(() => {
    const pruneExpiredTrash = () => {
      const now = Date.now();
      setTrashItems(prev => prev.filter(item => now - item.deletedAt <= TRASH_RETENTION_MS));
    };

    pruneExpiredTrash();
    const intervalId = window.setInterval(pruneExpiredTrash, 60 * 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  };

  const estimateDataUrlBytes = (dataUrl: string) => {
    const base64Index = dataUrl.indexOf('base64,');
    if (base64Index === -1) return undefined;
    const base64 = dataUrl.slice(base64Index + 7);
    const paddingMatch = base64.match(/=*$/);
    const padding = paddingMatch ? paddingMatch[0].length : 0;
    return Math.max(0, (base64.length * 3) / 4 - padding);
  };

  const createThumbnail = async (dataUrl: string, maxSize = 240): Promise<{ thumb: string; width: number; height: number }> => {
    try {
      if (!('createImageBitmap' in window)) {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });

        const originalWidth = img.width || img.naturalWidth || 0;
        const originalHeight = img.height || img.naturalHeight || 0;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return { thumb: dataUrl, width: originalWidth, height: originalHeight };
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return { thumb: canvas.toDataURL('image/jpeg', 0.7), width: originalWidth, height: originalHeight };
      }

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const originalWidth = bitmap.width;
      const originalHeight = bitmap.height;
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return { thumb: dataUrl, width: originalWidth, height: originalHeight };
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return { thumb: canvas.toDataURL('image/jpeg', 0.7), width: originalWidth, height: originalHeight };
    } catch {
      return { thumb: dataUrl, width: 0, height: 0 };
    }
  };

  useEffect(() => {
    let cancelled = false;

    const syncThumbnails = async () => {
      const updates: Record<string, string> = {};
      const metaUpdates: Record<string, ImageMeta> = {};
      for (const img of images) {
        const needsThumb = !thumbnailMapRef.current[img];
        const needsMeta = !metaMapRef.current[img];

        if (img.startsWith('data:')) {
          if (!needsThumb && !needsMeta) continue;
          const { thumb, width, height } = await createThumbnail(img);
          if (cancelled) return;
          if (needsThumb) updates[img] = thumb;
          if (needsMeta) {
            metaUpdates[img] = {
              width,
              height,
              sizeBytes: estimateDataUrlBytes(img)
            };
          }
          continue;
        }

        if (needsMeta) {
          const dimensions = await new Promise<ImageMeta>((resolve) => {
            const image = new Image();
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = () => resolve({});
            image.src = img;
          });
          if (cancelled) return;
          metaUpdates[img] = dimensions;
        }
      }

      if (!cancelled && Object.keys(updates).length > 0) {
        setThumbnailMap(prev => ({ ...prev, ...updates }));
      }
      if (!cancelled && Object.keys(metaUpdates).length > 0) {
        setMetaMap(prev => ({ ...prev, ...metaUpdates }));
      }
    };

    syncThumbnails();

    setThumbnailMap(prev => {
      const next: Record<string, string> = {};
      images.forEach(img => {
        if (prev[img]) next[img] = prev[img];
      });
      return next;
    });

    setMetaMap(prev => {
      const next: Record<string, ImageMeta> = {};
      images.forEach(img => {
        if (prev[img]) next[img] = prev[img];
      });
      return next;
    });

    return () => {
      cancelled = true;
    };
  }, [images]);

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file =>
      file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg'
    );

    if (imageFiles.length === 0) return;

    let limitedFiles = imageFiles;
    if (multiple && maxImages) {
      const availableSlots = Math.max(0, maxImages - images.length);
      limitedFiles = imageFiles.slice(0, availableSlots);
    }

    if (limitedFiles.length === 0) return;

    const promises: Promise<string>[] = [];

    limitedFiles.forEach((file: File) => {
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as string);
          }
        };
      });
      reader.readAsDataURL(file);
      promises.push(promise);
    });

    Promise.all(promises).then(base64Images => {
      if (multiple) {
        onImagesChange([...images, ...base64Images]);
      } else {
        onImagesChange(base64Images.slice(0, 1));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const openUndoWindow = (item: TrashImageItem) => {
    clearUndoTimer();
    setPendingUndoItem(item);
    undoTimerRef.current = window.setTimeout(() => {
      setPendingUndoItem(current => (current?.id === item.id ? null : current));
    }, UNDO_WINDOW_MS);
  };

  const restoreFromTrash = (item: TrashImageItem) => {
    if (!multiple) {
      onImagesChange([item.image]);
    } else {
      if (typeof maxImages === 'number' && images.length >= maxImages) {
        alert('復元するには空き枠が必要です。先に画像を1枚減らしてください。');
        return;
      }
      const insertIndex = Math.min(Math.max(item.originalIndex, 0), images.length);
      const nextImages = [...images];
      nextImages.splice(insertIndex, 0, item.image);
      onImagesChange(nextImages);
    }

    setTrashItems(prev => prev.filter(trash => trash.id !== item.id));
    if (pendingUndoItem?.id === item.id) {
      clearUndoTimer();
      setPendingUndoItem(null);
    }
  };

  const removeImage = (index: number) => {
    const targetImage = images[index];
    if (!targetImage) return;

    const shouldConfirmDelete = images.length <= 1;
    if (
      shouldConfirmDelete &&
      !window.confirm('最後の1枚を削除しますか？\n削除後もゴミ箱から復元できます。')
    ) {
      return;
    }

    const deletedItem: TrashImageItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      image: targetImage,
      originalIndex: index,
      deletedAt: Date.now()
    };
    setTrashItems(prev => [deletedItem, ...prev].slice(0, MAX_TRASH_ITEMS));
    openUndoWindow(deletedItem);

    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const stats = useMemo(() => {
    if (!showStats || images.length === 0) return null;
    const metas = images.map(img => metaMap[img]).filter(Boolean) as ImageMeta[];
    const totalBytes = metas.reduce((sum, meta) => sum + (meta.sizeBytes || 0), 0);
    const hasSizeData = metas.some(meta => typeof meta.sizeBytes === 'number');
    const maxWidth = metas.reduce((max, meta) => Math.max(max, meta.width || 0), 0);
    const maxHeight = metas.reduce((max, meta) => Math.max(max, meta.height || 0), 0);
    const WARN_SINGLE_BYTES = 5 * 1024 * 1024;
    const WARN_TOTAL_BYTES = 25 * 1024 * 1024;
    const hasLargeImage = metas.some(meta => (meta.sizeBytes || 0) >= WARN_SINGLE_BYTES);
    const isLargeTotal = hasSizeData && totalBytes >= WARN_TOTAL_BYTES;
    return {
      totalBytes,
      hasSizeData,
      maxWidth,
      maxHeight,
      warning: hasLargeImage || isLargeTotal
    };
  }, [images, metaMap, showStats]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-lg transition-all ${
        isDragging
          ? 'ring-2 ring-indigo-500 ring-offset-2 bg-indigo-50'
          : ''
      }`}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-100/80 border-2 border-dashed border-indigo-500 rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-indigo-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-bold text-indigo-600">ここにドロップ</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {images.map((img, idx) => {
          const previewSrc = thumbnailMap[img] || img;
          const meta = metaMap[img];
          const title = meta?.width && meta?.height
            ? `${meta.width}x${meta.height}${meta.sizeBytes ? ` / ${formatBytes(meta.sizeBytes)}` : ''}`
            : 'サイズ情報なし';
          return (
            <div key={idx} className="relative group aspect-square bg-gray-100 rounded-md overflow-hidden border border-gray-200" title={title}>
              <img src={previewSrc} alt="preview" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                <button
                  onClick={() => removeImage(idx)}
                  className="bg-rose-500 text-white rounded-md p-1.5 hover:bg-rose-600"
                  title="削除"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>
          );
        })}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-md text-gray-400 hover:border-indigo-400 hover:text-indigo-500 bg-gray-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span className="text-xs mt-1">追加</span>
          <span className="text-[9px] mt-0.5 text-gray-400">D&D可</span>
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg"
        multiple={multiple}
        className="hidden"
      />

      {stats && (
        <div className="mt-2 text-[10px] text-slate-500 flex flex-wrap gap-2 items-center">
          <span>合計 {images.length}枚</span>
          <span>容量: {stats.hasSizeData ? formatBytes(stats.totalBytes) : '不明'}</span>
          <span>最大解像度: {stats.maxWidth && stats.maxHeight ? `${stats.maxWidth}x${stats.maxHeight}` : '不明'}</span>
          {stats.warning && (
            <span className="text-amber-600 font-semibold">サイズが大きめです</span>
          )}
        </div>
      )}

      {(pendingUndoItem || trashItems.length > 0) && (
        <div className="mt-2 space-y-2">
          {pendingUndoItem && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-amber-900">画像を削除しました</span>
              <button
                type="button"
                onClick={() => restoreFromTrash(pendingUndoItem)}
                className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
              >
                元に戻す
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowTrash(prev => !prev)}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              ゴミ箱 {trashItems.length}件
            </button>
            {trashItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTrashItems([]);
                  setPendingUndoItem(null);
                  clearUndoTimer();
                }}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100"
              >
                ゴミ箱を空にする
              </button>
            )}
          </div>

          {showTrash && (
            <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
              {trashItems.length === 0 ? (
                <div className="text-[10px] text-slate-500">ゴミ箱は空です</div>
              ) : (
                trashItems.map((item) => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded p-1.5 flex items-center gap-2">
                    <img src={item.image} alt="" className="w-9 h-9 rounded object-cover bg-slate-100" loading="lazy" decoding="async" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-slate-600">
                        {new Date(item.deletedAt).toLocaleString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreFromTrash(item)}
                      className="text-[10px] font-bold px-2 py-1 rounded bg-slate-700 text-white hover:bg-slate-800"
                    >
                      復元
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
