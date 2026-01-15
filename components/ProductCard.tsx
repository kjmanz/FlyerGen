import React, { useState } from 'react';
import { Product } from '../types';
import { ImageUploader } from './ImageUploader';
import { searchProductSpecs } from '../services/geminiService';

interface ProductCardProps {
  product: Product;
  onChange: (updatedProduct: Product) => void;
  onRemove: () => void;
  index: number;
  apiKey: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onChange, onRemove, index, apiKey }) => {
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!product.productCode) return;
    if (!apiKey) {
      alert("APIキーが設定されていません。右上の「設定」ボタンからGemini APIキーを入力してください。");
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchProductSpecs(product.productCode, apiKey);
      const combinedSpecs = `${result.specs}\n${(result.features || []).join(', ')}`;
      onChange({
        ...product,
        productName: result.productName,
        specs: combinedSpecs
      });
    } catch (e) {
      alert("スペック検索に失敗しました。もう一度お試しください。");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-[32px] shadow-premium border border-slate-100 relative mb-8 animate-slide-up overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>

      <div className="flex items-center justify-between mb-8 relative">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-indigo-600/20">
            Product {index + 1}
          </div>
          {product.productName && (
            <h4 className="text-sm font-black text-slate-400 truncate max-w-[200px]">{product.productName}</h4>
          )}
        </div>
        <button
          onClick={onRemove}
          className="w-8 h-8 rounded-xl bg-slate-50 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center border border-slate-100 active:scale-95"
          title="Remove"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Product Media</label>
          <ImageUploader
            label="Product image"
            images={product.images}
            onImagesChange={(imgs) => onChange({ ...product, images: imgs })}
          />
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Model Number</label>
            <div className="flex shadow-sm rounded-2xl overflow-hidden border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
              <input
                type="text"
                value={product.productCode}
                onChange={(e) => onChange({ ...product, productCode: e.target.value })}
                placeholder="PROD-ID00X"
                className="flex-1 block w-full py-3 px-4 sm:text-sm bg-slate-50/30 text-slate-900 font-bold placeholder:text-slate-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !product.productCode}
                className="inline-flex items-center px-6 py-3 border-l border-slate-100 text-xs font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:bg-slate-300 active:scale-[0.98]"
              >
                {isSearching ? (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  "Magic Search"
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Display Name</label>
            <input
              type="text"
              value={product.productName}
              onChange={(e) => onChange({ ...product, productName: e.target.value })}
              placeholder="Full Product Name"
              className="mt-1 block w-full rounded-2xl border-slate-100 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-slate-50/30 text-slate-900 font-bold placeholder:text-slate-300 transition-all hover:border-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">List Price</label>
              <div className="relative">
                <input
                  type="number"
                  value={product.originalPrice}
                  onChange={(e) => onChange({ ...product, originalPrice: e.target.valueAsNumber || '' })}
                  placeholder="0"
                  className="mt-1 block w-full rounded-2xl border-slate-100 border-2 py-3 pl-4 pr-10 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-slate-50/30 text-slate-900 font-bold placeholder:text-slate-300 transition-all hover:border-slate-200"
                />
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                  <span className="text-[10px] font-black text-slate-400">JPY</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2 ml-1">Special Offer</label>
              <div className="space-y-3">
                <input
                  type="text"
                  value={product.salePriceLabel || ''}
                  onChange={(e) => onChange({ ...product, salePriceLabel: e.target.value })}
                  placeholder="Offer Label (e.g. Member Disc)"
                  className="block w-full text-[10px] font-black uppercase tracking-widest border-rose-100 border-2 rounded-xl py-2 px-3 bg-rose-50/30 text-rose-600 placeholder:text-rose-200 focus:border-rose-300 focus:ring-0 transition-all"
                />
                <div className="relative">
                  <input
                    type="number"
                    value={product.salePrice}
                    onChange={(e) => onChange({ ...product, salePrice: e.target.valueAsNumber || '' })}
                    placeholder="Offer Price"
                    className="block w-full rounded-2xl border-rose-100 border-2 py-3 pl-4 pr-10 shadow-sm focus:border-rose-400 focus:ring-0 sm:text-sm bg-rose-50/50 text-rose-900 font-black placeholder:text-rose-200 transition-all"
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <span className="text-[10px] font-black text-rose-300">JPY</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Marketing Hook</label>
            <input
              type="text"
              value={product.catchCopy}
              onChange={(e) => onChange({ ...product, catchCopy: e.target.value })}
              placeholder="e.g. Limited Edition • Sale ends soon!"
              className="mt-1 block w-full rounded-2xl border-slate-100 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-slate-50/30 text-slate-900 font-bold placeholder:text-slate-300 transition-all hover:border-slate-200"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 relative">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Technical Specs & Features</label>
        <textarea
          rows={3}
          value={product.specs}
          onChange={(e) => onChange({ ...product, specs: e.target.value })}
          placeholder="Detailed specs will appear here after searching..."
          className="mt-1 block w-full rounded-2xl border-slate-100 border-2 py-4 px-5 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-slate-50/30 text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-200"
        />
      </div>
    </div>
  );
};