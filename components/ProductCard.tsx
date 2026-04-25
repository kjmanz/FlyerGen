import React, { useState } from 'react';
import { Product } from '../types';
import { ImageUploader } from './ImageUploader';
import { searchProductSpecs } from '../services/geminiService';
import { SESSION_API_COST_YEN } from '../config/sessionApiCostYen';
import { useSessionApiCost } from '../context/SessionApiCostContext';
import { IcMagnify } from './inlineIcons';

interface ProductCardProps {
  product: Product;
  onChange: (updatedProduct: Product) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  index: number;
  apiKey: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onChange, onRemove, onDuplicate, index, apiKey }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { add: addSessionApiCost } = useSessionApiCost();

  const handleSearch = async () => {
    if (!product.productCode) return;
    if (!apiKey) {
      alert("APIキーが設定されていません。右上の「設定」ボタンからGemini APIキーを入力してください。");
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchProductSpecs(product.productCode, apiKey);
      addSessionApiCost(SESSION_API_COST_YEN.productSpecSearch);
      const combinedSpecs = `${result.specs}\n${(result.features || []).join(', ')}`;
      onChange({
        ...product,
        productName: result.productName,
        specs: combinedSpecs,
        customerReviews: result.customerReviews || product.customerReviews || '',
        benefits: result.benefits || product.benefits || ''
      });
    } catch (e) {
      alert("スペック検索に失敗しました。もう一度お試しください。");
    } finally {
      setIsSearching(false);
    }
  };

  // Display summary for collapsed state
  const getSummary = () => {
    if (product.productName) return product.productName;
    if (product.productCode) return product.productCode;
    return '未入力';
  };

  return (
    <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 mb-4 relative">
      {/* Loading Overlay */}
      {isSearching && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 rounded-lg flex flex-col items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-indigo-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm font-semibold text-indigo-600">スペック検索中...</p>
          <p className="text-xs text-gray-500 mt-1">しばらくお待ちください</p>
        </div>
      )}
      {/* Header - always visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="px-2 py-0.5 bg-indigo-600 text-white text-xs font-semibold rounded">
            商品 {index + 1}
          </span>
          <span className="text-sm text-gray-600 truncate max-w-[100px] sm:max-w-[180px] md:max-w-[250px]">
            {getSummary()}
          </span>
          {product.salePrice && (
            <span className="text-xs sm:text-sm font-bold text-rose-600 whitespace-nowrap">
              ¥{typeof product.salePrice === 'number' ? product.salePrice.toLocaleString() : product.salePrice}（税込）
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onDuplicate}
            className="text-gray-400 hover:text-indigo-500 p-1"
            title="複製"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-rose-500 p-1"
            title="削除"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Image */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">商品画像</label>
              <ImageUploader
                label="商品画像"
                images={product.images}
                onImagesChange={(imgs) => onChange({ ...product, images: imgs })}
              />
            </div>

            {/* Right: Fields */}
            <div className="space-y-4">
              {/* Product Code + Search */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">品番</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={product.productCode}
                    onChange={(e) => onChange({ ...product, productCode: e.target.value })}
                    placeholder="例: CS-X403D2"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={isSearching || !product.productCode}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-300 inline-flex items-center justify-center gap-1"
                  >
                    {isSearching ? '検索中...' : (<><IcMagnify className="h-3.5 w-3.5 flex-shrink-0" />検索</>)}
                  </button>
                </div>
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">商品名</label>
                <input
                  type="text"
                  value={product.productName}
                  onChange={(e) => onChange({ ...product, productName: e.target.value })}
                  placeholder="商品の正式名称"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">通常価格（税込）</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={product.originalPrice}
                      onChange={(e) => onChange({ ...product, originalPrice: e.target.valueAsNumber || '' })}
                      placeholder="0"
                      className="w-full px-3 py-2 pr-8 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">円</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rose-500 mb-1">特価（税込）</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={product.salePrice}
                      onChange={(e) => onChange({ ...product, salePrice: e.target.valueAsNumber || '' })}
                      placeholder="販売価格"
                      className="w-full px-3 py-2 pr-8 border border-rose-200 rounded-md text-sm bg-rose-50 focus:border-rose-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-rose-400">円</span>
                  </div>
                </div>
              </div>

              {/* Sale Price Label */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">価格ラベル（任意）</label>
                <input
                  type="text"
                  value={product.salePriceLabel || ''}
                  onChange={(e) => onChange({ ...product, salePriceLabel: e.target.value })}
                  placeholder="例: 会員価格、在庫限り"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
                />
              </div>

              {/* Catch Copy */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">キャッチコピー</label>
                <input
                  type="text"
                  value={product.catchCopy}
                  onChange={(e) => onChange({ ...product, catchCopy: e.target.value })}
                  placeholder="例: 数量限定・在庫限り！"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Specs - Full Width */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">スペック・特徴</label>
            <textarea
              rows={3}
              value={product.specs}
              onChange={(e) => onChange({ ...product, specs: e.target.value })}
              placeholder="検索後、スペックが自動入力されます..."
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
            />
          </div>

          {/* Customer Reviews */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">お客様の声・レビュー</label>
            <textarea
              rows={2}
              value={product.customerReviews || ''}
              onChange={(e) => onChange({ ...product, customerReviews: e.target.value })}
              placeholder="SNSやECサイトの口コミが自動入力されます..."
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
            />
          </div>

          {/* Benefits */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">機種の良いところ・ベネフィット</label>
            <textarea
              rows={2}
              value={product.benefits || ''}
              onChange={(e) => onChange({ ...product, benefits: e.target.value })}
              placeholder="例: 電気代が安くなる、お手入れが簡単"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};