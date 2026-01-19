import React, { useRef, useState } from 'react';

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (newImages: string[]) => void;
  label: string;
  multiple?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onImagesChange,
  label,
  multiple = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file =>
      file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg'
    );

    if (imageFiles.length === 0) return;

    const promises: Promise<string>[] = [];

    imageFiles.forEach((file: File) => {
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

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

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
        {images.map((img, idx) => (
          <div key={idx} className="relative group aspect-square bg-gray-100 rounded-md overflow-hidden border border-gray-200">
            <img src={img} alt="preview" className="w-full h-full object-cover" />
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
        ))}

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
    </div>
  );
};
