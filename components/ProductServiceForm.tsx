import React, { useState } from 'react';
import { ProductServiceInfo, ContentSections, ReviewSearchResult, FlyerSettings } from '../types';
import { ImageUploader } from './ImageUploader';
import { generateProductServiceContent, searchProductReviews } from '../services/geminiService';
import { IcSparkles, IcMagnify, IcFileText, IcX, IcPencil, IcSquare, IcPackage, IcArrowUp, IcPlus } from './inlineIcons';

interface ProductServiceFormProps {
    productServiceInfo: ProductServiceInfo;
    setProductServiceInfo: React.Dispatch<React.SetStateAction<ProductServiceInfo>>;
    settings: FlyerSettings;
    setSettings: React.Dispatch<React.SetStateAction<FlyerSettings>>;
    apiKey: string;
    onSettingsOpen: () => void;
}

export const ProductServiceForm: React.FC<ProductServiceFormProps> = ({
    productServiceInfo,
    setProductServiceInfo,
    settings,
    setSettings,
    apiKey,
    onSettingsOpen
}) => {
    const [isGeneratingProductContent, setIsGeneratingProductContent] = useState(false);
    const [isSearchingReviews, setIsSearchingReviews] = useState(false);
    const [reviewSearchResults, setReviewSearchResults] = useState<ReviewSearchResult | null>(null);

    const handleGenerateProductContent = async () => {
        if (!apiKey) {
            onSettingsOpen();
            alert("APIキーが設定されていません。");
            return;
        }
        if (!productServiceInfo.title.trim()) {
            alert("「紹介したいもの」を入力してください。");
            return;
        }

        setIsGeneratingProductContent(true);
        try {
            const result = await generateProductServiceContent(productServiceInfo.title, apiKey);
            setProductServiceInfo(prev => ({
                ...prev,
                catchCopy: result.catchCopy || prev.catchCopy,
                specs: result.specs || prev.specs,
                features: result.features && result.features.length > 0 ? result.features : prev.features,
                benefits: result.benefits && result.benefits.length > 0 ? result.benefits : prev.benefits,
                targetAudience: result.targetAudience && result.targetAudience.length > 0 ? result.targetAudience : prev.targetAudience,
                energySaving: result.energySaving || prev.energySaving,
                ecoContribution: result.ecoContribution || prev.ecoContribution
            }));
        } catch (e) {
            console.error(e);
            alert("コンテンツ生成に失敗しました。");
        } finally {
            setIsGeneratingProductContent(false);
        }
    };

    const handleSearchReviews = async () => {
        if (!apiKey) {
            onSettingsOpen();
            alert("APIキーが設定されていません。");
            return;
        }
        if (!productServiceInfo.title.trim()) {
            alert("「紹介したいもの」を入力してください。");
            return;
        }

        setIsSearchingReviews(true);
        setReviewSearchResults(null);
        try {
            const result = await searchProductReviews(productServiceInfo.title, apiKey);
            setReviewSearchResults(result);
        } catch (e) {
            console.error(e);
            alert("レビュー検索に失敗しました。");
        } finally {
            setIsSearchingReviews(false);
        }
    };

    const handleApplyReviewResults = () => {
        if (!reviewSearchResults) return;
        setProductServiceInfo(prev => ({
            ...prev,
            benefits: [...new Set([...prev.benefits.filter(b => b.trim()), ...reviewSearchResults.merits])],
            customerReviews: [...new Set([...prev.customerReviews.filter(r => r.trim()), ...reviewSearchResults.satisfactionPoints])],
            targetAudience: [...new Set([...prev.targetAudience.filter(t => t.trim()), ...reviewSearchResults.purchaseReasons])]
        }));
        setReviewSearchResults(null);
        alert("レビュー結果を反映しました！");
    };

    const sectionItems = [
        { key: 'catchCopy', label: 'キャッチコピー' },
        { key: 'specs', label: 'スペック・仕様' },
        { key: 'features', label: '特徴・機能' },
        { key: 'benefits', label: 'お客様へのメリット' },
        { key: 'targetAudience', label: 'こんな方におすすめ' },
        { key: 'beforeAfter', label: 'Before/After' },
        { key: 'customerReviews', label: 'お客様の声' },
        { key: 'caseStudies', label: '施工事例・実績' },
        { key: 'warranty', label: '保証・アフターサービス' },
        { key: 'pricing', label: '価格・料金目安' },
        { key: 'subsidies', label: '補助金・助成金' },
        { key: 'limitedOffer', label: '期間限定特典' },
        { key: 'energySaving', label: '省エネ性能' },
        { key: 'ecoContribution', label: '環境貢献' },
        { key: 'faq', label: 'よくある質問' },
        { key: 'cta', label: 'お問い合わせ' }
    ];

    return (
        <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>

            <div className="flex items-center gap-3 mb-8 relative">
                <div className="w-8 h-8 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center text-emerald-700">
                    <IcPackage className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">商品・サービス紹介（表面）</h2>
            </div>

            {/* Product/Service Title Input - AI Trigger */}
            <div className="mb-8 relative">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">紹介したいもの</label>
                <div className="flex gap-3 flex-wrap">
                    <input
                        type="text"
                        placeholder="例: エコキュート、オール電化、内窓リフォーム..."
                        value={productServiceInfo.title}
                        onChange={(e) => setProductServiceInfo({ ...productServiceInfo, title: e.target.value })}
                        className="flex-1 min-w-[200px] rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300 transition-all hover:border-slate-300"
                    />
                    <button
                        onClick={handleGenerateProductContent}
                        disabled={isGeneratingProductContent || !productServiceInfo.title.trim()}
                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-bold shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isGeneratingProductContent ? (<><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>生成中</>) : (<><IcSparkles className="h-4 w-4 flex-shrink-0" />AI生成</>)}
                    </button>
                    <button
                        onClick={handleSearchReviews}
                        disabled={isSearchingReviews || !productServiceInfo.title.trim()}
                        className="px-5 py-2.5 bg-emerald-600 text-white rounded-md text-sm font-bold shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSearchingReviews ? (<><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>検索中</>) : (<><IcMagnify className="h-4 w-4 flex-shrink-0" />レビュー検索</>)}
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-2 ml-1">入力後「AI生成」でコンテンツ自動生成、「レビュー検索」でお客様の声を収集</p>
            </div>

            {/* Review Search Results */}
            {reviewSearchResults && (
                <div className="mb-8 p-5 bg-emerald-50/80 rounded-lg border border-emerald-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                          <IcFileText className="h-4 w-4 flex-shrink-0" />
                          レビュー検索結果
                        </h3>
                        <button type="button" onClick={handleApplyReviewResults} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-xs font-bold hover:bg-emerald-700 transition-all inline-flex items-center gap-1.5">
                            <IcArrowUp className="h-3.5 w-3.5 flex-shrink-0" />
                            上記を反映
                        </button>
                    </div>
                    <div className="space-y-3 text-sm">
                        {reviewSearchResults.merits.length > 0 && (<div><div className="font-semibold text-emerald-700 mb-1">よく挙げられるメリット</div><ul className="list-disc list-inside text-slate-700">{reviewSearchResults.merits.map((m, i) => <li key={i}>{m}</li>)}</ul></div>)}
                        {reviewSearchResults.satisfactionPoints.length > 0 && (<div><div className="font-semibold text-emerald-700 mb-1">満足ポイント</div><ul className="list-disc list-inside text-slate-700">{reviewSearchResults.satisfactionPoints.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
                        {reviewSearchResults.purchaseReasons.length > 0 && (<div><div className="font-semibold text-emerald-700 mb-1">導入のきっかけ</div><ul className="list-disc list-inside text-slate-700">{reviewSearchResults.purchaseReasons.map((p, i) => <li key={i}>{p}</li>)}</ul></div>)}
                    </div>
                </div>
            )}

            {/* Content Sections Checklist */}
            <div className="mb-8">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">掲載する項目を選択</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {sectionItems.map(({ key, label }) => (
                        <label key={key} className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm transition-all ${productServiceInfo.sections[key as keyof ContentSections] ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'}`}>
                            <input
                                type="checkbox"
                                checked={productServiceInfo.sections[key as keyof ContentSections]}
                                onChange={(e) => setProductServiceInfo({ ...productServiceInfo, sections: { ...productServiceInfo.sections, [key]: e.target.checked } })}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-medium">{label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Dynamic Content Fields */}
            {productServiceInfo.sections.catchCopy && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">キャッチコピー</label>
                    <input type="text" placeholder="例: 光熱費を年間〇万円削減！" value={productServiceInfo.catchCopy} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, catchCopy: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.specs && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">スペック・仕様</label>
                    <textarea rows={2} placeholder="製品のスペックや仕様を入力..." value={productServiceInfo.specs} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, specs: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.features && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">特徴・機能</label>
                    {productServiceInfo.features.map((feature, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <input type="text" placeholder={`特徴 ${idx + 1}...`} value={feature} onChange={(e) => { const newFeatures = [...productServiceInfo.features]; newFeatures[idx] = e.target.value; setProductServiceInfo({ ...productServiceInfo, features: newFeatures }); }} className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                            {productServiceInfo.features.length > 1 && (<button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, features: productServiceInfo.features.filter((_, i) => i !== idx) })} className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md inline-flex items-center justify-center" aria-label="削除"><IcX className="h-4 w-4" /></button>)}
                        </div>
                    ))}
                    <button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, features: [...productServiceInfo.features, ''] })} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2 inline-flex items-center gap-1.5"><IcPlus className="h-4 w-4 flex-shrink-0" />特徴を追加</button>
                </div>
            )}

            {productServiceInfo.sections.benefits && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">お客様へのメリット</label>
                    {productServiceInfo.benefits.map((benefit, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <input type="text" placeholder={`メリット ${idx + 1}...`} value={benefit} onChange={(e) => { const newBenefits = [...productServiceInfo.benefits]; newBenefits[idx] = e.target.value; setProductServiceInfo({ ...productServiceInfo, benefits: newBenefits }); }} className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                            {productServiceInfo.benefits.length > 1 && (<button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, benefits: productServiceInfo.benefits.filter((_, i) => i !== idx) })} className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md inline-flex items-center justify-center" aria-label="削除"><IcX className="h-4 w-4" /></button>)}
                        </div>
                    ))}
                    <button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, benefits: [...productServiceInfo.benefits, ''] })} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2 inline-flex items-center gap-1.5"><IcPlus className="h-4 w-4 flex-shrink-0" />メリットを追加</button>
                </div>
            )}

            {productServiceInfo.sections.targetAudience && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">こんな方におすすめ</label>
                    {productServiceInfo.targetAudience.map((target, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <input type="text" placeholder={`おすすめの方 ${idx + 1}...`} value={target} onChange={(e) => { const newTargets = [...productServiceInfo.targetAudience]; newTargets[idx] = e.target.value; setProductServiceInfo({ ...productServiceInfo, targetAudience: newTargets }); }} className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                            {productServiceInfo.targetAudience.length > 1 && (<button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, targetAudience: productServiceInfo.targetAudience.filter((_, i) => i !== idx) })} className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md inline-flex items-center justify-center" aria-label="削除"><IcX className="h-4 w-4" /></button>)}
                        </div>
                    ))}
                    <button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, targetAudience: [...productServiceInfo.targetAudience, ''] })} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2 inline-flex items-center gap-1.5"><IcPlus className="h-4 w-4 flex-shrink-0" />追加</button>
                </div>
            )}

            {productServiceInfo.sections.pricing && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">価格・料金目安</label>
                    <input type="text" placeholder="例: 工事費込み 〇〇万円〜" value={productServiceInfo.pricing} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, pricing: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.subsidies && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">補助金・助成金情報</label>
                    <input type="text" placeholder="例: 最大〇万円の補助金対象" value={productServiceInfo.subsidies} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, subsidies: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.limitedOffer && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">期間限定特典</label>
                    <input type="text" placeholder="例: 今月末まで工事費無料！" value={productServiceInfo.limitedOffer} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, limitedOffer: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.energySaving && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">省エネ性能</label>
                    <input type="text" placeholder="例: ★★★★★ 省エネ達成率150%" value={productServiceInfo.energySaving} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, energySaving: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.ecoContribution && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">環境貢献</label>
                    <input type="text" placeholder="例: CO2排出量50%削減" value={productServiceInfo.ecoContribution} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, ecoContribution: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.warranty && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">保証・アフターサービス</label>
                    <input type="text" placeholder="例: 10年保証、24時間サポート" value={productServiceInfo.warranty} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, warranty: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.beforeAfter && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">Before/After比較</label>
                    <textarea rows={2} placeholder="例: 電気代 月15,000円→8,000円" value={productServiceInfo.beforeAfter} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, beforeAfter: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.caseStudies && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">施工事例・実績</label>
                    <textarea rows={2} placeholder="例: 地域No.1 年間500件施工" value={productServiceInfo.caseStudies} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, caseStudies: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {productServiceInfo.sections.customerReviews && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">お客様の声</label>
                    {productServiceInfo.customerReviews.map((review, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <input type="text" placeholder={`お客様の声 ${idx + 1}...`} value={review} onChange={(e) => { const newReviews = [...productServiceInfo.customerReviews]; newReviews[idx] = e.target.value; setProductServiceInfo({ ...productServiceInfo, customerReviews: newReviews }); }} className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                            {productServiceInfo.customerReviews.length > 1 && (<button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, customerReviews: productServiceInfo.customerReviews.filter((_, i) => i !== idx) })} className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md inline-flex items-center justify-center" aria-label="削除"><IcX className="h-4 w-4" /></button>)}
                        </div>
                    ))}
                    <button type="button" onClick={() => setProductServiceInfo({ ...productServiceInfo, customerReviews: [...productServiceInfo.customerReviews, ''] })} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2 inline-flex items-center gap-1.5"><IcPlus className="h-4 w-4 flex-shrink-0" />追加</button>
                </div>
            )}

            {productServiceInfo.sections.cta && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">お問い合わせ・来店誘導</label>
                    <input type="text" placeholder="例: お見積り無料！お気軽にご相談ください" value={productServiceInfo.cta} onChange={(e) => setProductServiceInfo({ ...productServiceInfo, cta: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                </div>
            )}

            {/* Product Images */}
            <div className="mb-6">
                <ImageUploader label="商品・サービス画像" images={productServiceInfo.productImages} onImagesChange={(images) => setProductServiceInfo({ ...productServiceInfo, productImages: images })} maxImages={5} />
            </div>

            {/* Background Mode */}
            <div className="mb-6">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">背景モード</label>
                <div className="flex gap-3">
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'creative' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="productBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'creative'} onChange={() => setSettings({ ...settings, backgroundMode: 'creative' })} />
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-400 via-rose-400 to-indigo-500 flex items-center justify-center text-white shadow-inner">
                          <IcSparkles className="h-4 w-4" />
                        </div>
                        <div><div className="text-xs font-semibold text-slate-900">おまかせ</div><div className="text-xs font-bold text-slate-500 mt-0.5">AIおすすめ</div></div>
                    </label>
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'white' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="productBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'white'} onChange={() => setSettings({ ...settings, backgroundMode: 'white' })} />
                        <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-200">
                          <IcSquare className="h-4 w-4" />
                        </div>
                        <div><div className="text-xs font-semibold text-slate-900">白配色</div><div className="text-xs font-bold text-slate-500 mt-0.5">シンプル</div></div>
                    </label>
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'custom' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="productBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'custom'} onChange={() => setSettings({ ...settings, backgroundMode: 'custom' })} />
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white shadow-inner">
                          <IcPencil className="h-4 w-4" />
                        </div>
                        <div><div className="text-xs font-semibold text-slate-900">自由記述</div><div className="text-xs font-bold text-slate-500 mt-0.5">カスタム</div></div>
                    </label>
                </div>
                {settings.backgroundMode === 'custom' && (
                    <div className="mt-4">
                        <textarea rows={3} placeholder="例: 桜の花びらが舞う春らしい背景、冬の雪景色風..." value={settings.customBackground || ''} onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                    </div>
                )}
            </div>
        </div>
    );
};
