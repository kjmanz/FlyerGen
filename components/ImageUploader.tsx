import React, { useRef } from 'react';

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const promises: Promise<string>[] = [];

    Array.from(files).forEach((file: File) => {
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
      onImagesChange([...images, ...base64Images]);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  return (
    <div className="mb-0">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {images.map((img, idx) => (
          <div key={idx} className="relative group aspect-square bg-slate-50 rounded-2xl overflow-hidden border-2 border-slate-100 transition-all hover:border-indigo-200">
            <img src={img} alt="preview" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
              <button
                onClick={() => removeImage(idx)}
                className="bg-rose-500 text-white rounded-xl p-2.5 shadow-xl transform scale-90 group-hover:scale-100 transition-all hover:bg-rose-600 active:scale-90"
                title="Remove"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-indigo-500 hover:bg-indigo-50/30 hover:text-indigo-600 transition-all bg-slate-50/50 group active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:shadow-md transition-shadow">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Add Media</span>
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
