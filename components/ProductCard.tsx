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
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative mb-6">
      <div className="absolute top-4 left-4 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
        機種 {index + 1}
      </div>
      <button
        onClick={onRemove}
        className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
        title="削除"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <ImageUploader
            label="商品画像"
            images={product.images}
            onImagesChange={(imgs) => onChange({ ...product, images: imgs })}
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">品番</label>
            <div className="flex mt-1">
              <input
                type="text"
                value={product.productCode}
                onChange={(e) => onChange({ ...product, productCode: e.target.value })}
                placeholder="例: CS-LX405D2"
                className="flex-1 block w-full rounded-l-md border-gray-300 border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white text-gray-900"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !product.productCode}
                className="inline-flex items-center px-4 py-2 border border-l-0 border-transparent text-sm font-medium rounded-r-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
              >
                {isSearching ? (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <>
                    <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    検索
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">商品名</label>
            <input
              type="text"
              value={product.productName}
              onChange={(e) => onChange({ ...product, productName: e.target.value })}
              placeholder="例: ルームエアコン LXシリーズ"
              className="mt-1 block w-full rounded-md border-gray-300 border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white text-gray-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">通常価格</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="number"
                  value={product.originalPrice}
                  onChange={(e) => onChange({ ...product, originalPrice: e.target.valueAsNumber || '' })}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-8 sm:text-sm border-gray-300 border rounded-md p-2 bg-white text-gray-900"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">円</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-red-700 font-bold">特価設定</label>
              <div className="mt-1 space-y-2">
                <input
                  type="text"
                  value={product.salePriceLabel || ''}
                  onChange={(e) => onChange({ ...product, salePriceLabel: e.target.value })}
                  placeholder="ラベル: (例) 下取り特価"
                  title="空欄の場合は「特価」と表示されます"
                  className="block w-full sm:text-xs border-gray-300 border rounded-md p-2 bg-red-50 text-gray-900 placeholder-gray-400"
                />
                <div className="relative rounded-md shadow-sm">
                  <input
                    type="number"
                    value={product.salePrice}
                    onChange={(e) => onChange({ ...product, salePrice: e.target.valueAsNumber || '' })}
                    placeholder="価格"
                    className="focus:ring-red-500 focus:border-red-500 block w-full pr-8 sm:text-sm border-red-300 border rounded-md p-2 bg-red-50 text-gray-900"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">円</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">キャッチコピー (任意)</label>
            <input
              type="text"
              value={product.catchCopy}
              onChange={(e) => onChange({ ...product, catchCopy: e.target.value })}
              placeholder="例: 今が買い時！"
              className="mt-1 block w-full rounded-md border-gray-300 border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white text-gray-900"
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">主要スペック / 特徴</label>
        <textarea
          rows={3}
          value={product.specs}
          onChange={(e) => onChange({ ...product, specs: e.target.value })}
          placeholder="検索機能で自動入力、または手動で入力"
          className="mt-1 block w-full rounded-md border-gray-300 border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white text-gray-900"
        />
      </div>
    </div>
  );
};