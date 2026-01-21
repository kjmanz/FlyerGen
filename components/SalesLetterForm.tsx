import React, { useState } from 'react';
import { SalesLetterInfo, SalesFramework, FlyerSettings } from '../types';
import { ImageUploader } from './ImageUploader';
import { searchSalesFieldData, searchAllSalesFields } from '../services/geminiService';

interface SalesLetterFormProps {
    salesLetterInfo: SalesLetterInfo;
    setSalesLetterInfo: React.Dispatch<React.SetStateAction<SalesLetterInfo>>;
    settings: FlyerSettings;
    setSettings: React.Dispatch<React.SetStateAction<FlyerSettings>>;
    apiKey: string;
    onSettingsOpen: () => void;
}

export const SalesLetterForm: React.FC<SalesLetterFormProps> = ({
    salesLetterInfo,
    setSalesLetterInfo,
    settings,
    setSettings,
    apiKey,
    onSettingsOpen
}) => {
    const [searchingField, setSearchingField] = useState<string | null>(null);
    const [searchingAll, setSearchingAll] = useState(false);

    // 一括AI検索（商品名から全フィールドを自動入力）
    const handleSearchAll = async () => {
        if (!apiKey) {
            onSettingsOpen();
            alert("APIキーが設定されていません。");
            return;
        }
        if (!salesLetterInfo.productName.trim()) {
            alert("商品・サービス名を入力してください。");
            return;
        }

        setSearchingAll(true);
        try {
            const result = await searchAllSalesFields(
                salesLetterInfo.productName,
                salesLetterInfo.framework,
                apiKey
            );

            setSalesLetterInfo(prev => ({
                ...prev,
                headline: result.headline || prev.headline,
                problems: result.problems.length > 0 ? result.problems : prev.problems,
                benefits: result.benefits.length > 0 ? result.benefits : prev.benefits,
                affinity: result.affinity || prev.affinity,
                solution: result.solution || prev.solution,
                offer: result.offer || prev.offer,
                narrowing: result.narrowing || prev.narrowing,
                desire: result.desire || prev.desire,
                cta: result.cta || prev.cta,
                socialProof: {
                    experience: result.socialProof.experience || prev.socialProof.experience,
                    cases: result.socialProof.cases || prev.socialProof.cases,
                    customerVoices: result.socialProof.customerVoices.length > 0
                        ? result.socialProof.customerVoices
                        : prev.socialProof.customerVoices
                }
            }));

            alert("全フィールドにAI検索結果を反映しました！");
        } catch (e) {
            console.error(e);
            alert("AI検索に失敗しました。もう一度お試しください。");
        } finally {
            setSearchingAll(false);
        }
    };

    const handleSearch = async (fieldType: 'headline' | 'problems' | 'benefits' | 'affinity' | 'solution' | 'offer' | 'desire' | 'socialProof') => {
        if (!apiKey) {
            onSettingsOpen();
            alert("APIキーが設定されていません。");
            return;
        }
        if (!salesLetterInfo.productName.trim()) {
            alert("商品名を入力してください。");
            return;
        }

        setSearchingField(fieldType);
        try {
            const result = await searchSalesFieldData(salesLetterInfo.productName, fieldType, apiKey);

            if (fieldType === 'headline') {
                setSalesLetterInfo(prev => ({ ...prev, headline: result.suggestions[0] || prev.headline }));
            } else if (fieldType === 'problems') {
                setSalesLetterInfo(prev => ({ ...prev, problems: [...new Set([...prev.problems.filter(p => p.trim()), ...result.suggestions])] }));
            } else if (fieldType === 'benefits') {
                setSalesLetterInfo(prev => ({ ...prev, benefits: [...new Set([...prev.benefits.filter(b => b.trim()), ...result.suggestions])] }));
            } else if (fieldType === 'affinity') {
                setSalesLetterInfo(prev => ({ ...prev, affinity: result.suggestions[0] || prev.affinity }));
            } else if (fieldType === 'solution') {
                setSalesLetterInfo(prev => ({ ...prev, solution: result.suggestions[0] || prev.solution }));
            } else if (fieldType === 'offer') {
                setSalesLetterInfo(prev => ({ ...prev, offer: result.suggestions.join('／') || prev.offer }));
            } else if (fieldType === 'desire') {
                setSalesLetterInfo(prev => ({ ...prev, desire: result.suggestions[0] || prev.desire }));
            } else if (fieldType === 'socialProof') {
                setSalesLetterInfo(prev => ({
                    ...prev,
                    socialProof: {
                        ...prev.socialProof,
                        customerVoices: [...new Set([...prev.socialProof.customerVoices.filter(v => v.trim()), ...result.suggestions.slice(0, 3)])]
                    }
                }));
            }
            alert("検索結果を反映しました！");
        } catch (e) {
            console.error(e);
            alert("検索に失敗しました。");
        } finally {
            setSearchingField(null);
        }
    };

    const SearchButton = ({ fieldType, disabled }: { fieldType: string; disabled?: boolean }) => (
        <button
            onClick={() => handleSearch(fieldType as any)}
            disabled={searchingField !== null || disabled}
            className="px-3 py-2 bg-emerald-600 text-white rounded-md text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-1"
        >
            {searchingField === fieldType ? (
                <><svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></>
            ) : (<>🔍 AI検索</>)}
        </button>
    );

    return (
        <div className="bg-white rounded-lg shadow-premium border border-slate-100 p-8 mb-10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>

            <div className="flex items-center gap-3 mb-8 relative">
                <div className="w-8 h-8 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center text-sm">📝</div>
                <h2 className="text-xl font-semibold text-slate-900">セールスレターモード</h2>
            </div>

            {/* Framework Selection */}
            <div className="mb-8">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">フレームワーク選択</label>
                <div className="grid grid-cols-2 gap-4">
                    <label className={`flex flex-col items-center justify-center p-5 border-2 rounded-lg cursor-pointer transition-all ${salesLetterInfo.framework === 'aida' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="salesFramework" className="sr-only" checked={salesLetterInfo.framework === 'aida'} onChange={() => setSalesLetterInfo({ ...salesLetterInfo, framework: 'aida' })} />
                        <div className="text-2xl mb-2">📊</div>
                        <div className="text-sm font-bold text-slate-900">AIDA</div>
                        <div className="text-[10px] text-slate-500 mt-1 text-center">Attention→Interest→<br />Desire→Action</div>
                    </label>
                    <label className={`flex flex-col items-center justify-center p-5 border-2 rounded-lg cursor-pointer transition-all ${salesLetterInfo.framework === 'pasona' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="salesFramework" className="sr-only" checked={salesLetterInfo.framework === 'pasona'} onChange={() => setSalesLetterInfo({ ...salesLetterInfo, framework: 'pasona' })} />
                        <div className="text-2xl mb-2">🤝</div>
                        <div className="text-sm font-bold text-slate-900">新PASONA</div>
                        <div className="text-[10px] text-slate-500 mt-1 text-center">Problem→Affinity→<br />Solution→Offer→N→A</div>
                    </label>
                </div>
            </div>

            {/* Product Name */}
            <div className="mb-8 relative">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">商品・サービス名</label>
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="例: エコキュート、内窓リフォーム..."
                        value={salesLetterInfo.productName}
                        onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, productName: e.target.value })}
                        className="flex-1 rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                    />
                    <button
                        onClick={handleSearchAll}
                        disabled={searchingAll || searchingField !== null || !salesLetterInfo.productName.trim()}
                        className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md text-sm font-bold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg whitespace-nowrap"
                    >
                        {searchingAll ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                検索中...
                            </>
                        ) : (
                            <>✨ AI一括検索</>
                        )}
                    </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 ml-1">商品名を入力して「AI一括検索」を押すと、下のフィールドが自動で埋まります</p>
            </div>

            {/* Headline */}
            <div className="mb-6 p-4 bg-amber-50/50 rounded-lg border border-amber-100">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold tracking-wide text-amber-700">
                        {salesLetterInfo.framework === 'pasona' ? 'P：問題提起（ヘッドライン）' : 'A：Attention（キャッチコピー）'}
                    </label>
                    <SearchButton fieldType="headline" disabled={!salesLetterInfo.productName.trim()} />
                </div>
                <input
                    type="text"
                    placeholder="例: エアコンの電気代、まだ損してませんか？"
                    value={salesLetterInfo.headline}
                    onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, headline: e.target.value })}
                    className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-amber-500 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                />
            </div>

            {/* Problems / Interest */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold tracking-wide text-slate-400">
                        {salesLetterInfo.framework === 'pasona' ? '問題点の詳細' : 'I：Interest（興味喚起）'}
                    </label>
                    <SearchButton fieldType="problems" disabled={!salesLetterInfo.productName.trim()} />
                </div>
                {salesLetterInfo.problems.map((problem, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                        <input
                            type="text"
                            placeholder={`悩み ${idx + 1}...`}
                            value={problem}
                            onChange={(e) => {
                                const newProblems = [...salesLetterInfo.problems];
                                newProblems[idx] = e.target.value;
                                setSalesLetterInfo({ ...salesLetterInfo, problems: newProblems });
                            }}
                            className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                        />
                        {salesLetterInfo.problems.length > 1 && (
                            <button onClick={() => setSalesLetterInfo({ ...salesLetterInfo, problems: salesLetterInfo.problems.filter((_, i) => i !== idx) })} className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md">✕</button>
                        )}
                    </div>
                ))}
                <button onClick={() => setSalesLetterInfo({ ...salesLetterInfo, problems: [...salesLetterInfo.problems, ''] })} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2">＋ 追加</button>
            </div>

            {/* PASONA: Affinity */}
            {salesLetterInfo.framework === 'pasona' && (
                <div className="mb-6 p-4 bg-pink-50/50 rounded-lg border border-pink-100">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-semibold tracking-wide text-pink-700">A：Affinity（共感・寄り添い）★重要</label>
                        <SearchButton fieldType="affinity" disabled={!salesLetterInfo.productName.trim()} />
                    </div>
                    <textarea
                        rows={3}
                        placeholder="例: 「多くのお客様が同じ悩みを抱えていらっしゃいます。私自身も以前は...」"
                        value={salesLetterInfo.affinity}
                        onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, affinity: e.target.value })}
                        className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-pink-500 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                    />
                    <p className="text-[10px] text-pink-600 mt-2">※ 売り手でなく「理解者」として語る。ストーリー調が効果的。</p>
                </div>
            )}

            {/* PASONA: Solution / AIDA: Desire */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold tracking-wide text-slate-400">
                        {salesLetterInfo.framework === 'pasona' ? 'S：Solution（解決策の提示）' : 'D：Desire（欲求喚起）'}
                    </label>
                    <SearchButton fieldType={salesLetterInfo.framework === 'pasona' ? 'solution' : 'desire'} disabled={!salesLetterInfo.productName.trim()} />
                </div>
                <textarea
                    rows={3}
                    placeholder={salesLetterInfo.framework === 'pasona' ? "この商品でどう解決するか..." : "商品を使った後の魅力的な未来像..."}
                    value={salesLetterInfo.framework === 'pasona' ? salesLetterInfo.solution : salesLetterInfo.desire}
                    onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, [salesLetterInfo.framework === 'pasona' ? 'solution' : 'desire']: e.target.value })}
                    className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                />
            </div>

            {/* Benefits */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold tracking-wide text-slate-400">ベネフィット（具体的数値付き）</label>
                    <SearchButton fieldType="benefits" disabled={!salesLetterInfo.productName.trim()} />
                </div>
                {salesLetterInfo.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                        <input
                            type="text"
                            placeholder={`メリット ${idx + 1}（数値込み）...`}
                            value={benefit}
                            onChange={(e) => {
                                const newBenefits = [...salesLetterInfo.benefits];
                                newBenefits[idx] = e.target.value;
                                setSalesLetterInfo({ ...salesLetterInfo, benefits: newBenefits });
                            }}
                            className="flex-1 rounded-md border-slate-200 border-2 py-2.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                        />
                        {salesLetterInfo.benefits.length > 1 && (
                            <button onClick={() => setSalesLetterInfo({ ...salesLetterInfo, benefits: salesLetterInfo.benefits.filter((_, i) => i !== idx) })} className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-md">✕</button>
                        )}
                    </div>
                ))}
                <button onClick={() => setSalesLetterInfo({ ...salesLetterInfo, benefits: [...salesLetterInfo.benefits, ''] })} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 mt-2">＋ 追加</button>
            </div>

            {/* PASONA: Offer */}
            {salesLetterInfo.framework === 'pasona' && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-semibold tracking-wide text-slate-400">O：Offer（提案・特典）</label>
                        <SearchButton fieldType="offer" disabled={!salesLetterInfo.productName.trim()} />
                    </div>
                    <input
                        type="text"
                        placeholder="例: 今回は地域最安値級の○○円、工事費込み・10年保証付き"
                        value={salesLetterInfo.offer}
                        onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, offer: e.target.value })}
                        className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                    />
                </div>
            )}

            {/* PASONA: Narrowing */}
            {salesLetterInfo.framework === 'pasona' && (
                <div className="mb-6">
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">N：Narrowing（絞り込み・限定）</label>
                    <input
                        type="text"
                        placeholder="例: 今月対応できるのは先着5名様まで"
                        value={salesLetterInfo.narrowing}
                        onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, narrowing: e.target.value })}
                        className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                    />
                </div>
            )}

            {/* Social Proof */}
            <div className="mb-6 p-4 bg-slate-50/80 rounded-lg border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold tracking-wide text-slate-600">証拠・信頼性</label>
                    <SearchButton fieldType="socialProof" disabled={!salesLetterInfo.productName.trim()} />
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">実績年数</label>
                        <input
                            type="text"
                            placeholder="例: 地域で30年の実績"
                            value={salesLetterInfo.socialProof.experience}
                            onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, socialProof: { ...salesLetterInfo.socialProof, experience: e.target.value } })}
                            className="block w-full rounded-md border-slate-200 border py-2 px-3 shadow-sm focus:border-indigo-600 focus:ring-0 text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">施工件数</label>
                        <input
                            type="text"
                            placeholder="例: 年間500件"
                            value={salesLetterInfo.socialProof.cases}
                            onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, socialProof: { ...salesLetterInfo.socialProof, cases: e.target.value } })}
                            className="block w-full rounded-md border-slate-200 border py-2 px-3 shadow-sm focus:border-indigo-600 focus:ring-0 text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">お客様の声</label>
                    {salesLetterInfo.socialProof.customerVoices.map((voice, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <input
                                type="text"
                                placeholder={`お客様の声 ${idx + 1}...`}
                                value={voice}
                                onChange={(e) => {
                                    const newVoices = [...salesLetterInfo.socialProof.customerVoices];
                                    newVoices[idx] = e.target.value;
                                    setSalesLetterInfo({ ...salesLetterInfo, socialProof: { ...salesLetterInfo.socialProof, customerVoices: newVoices } });
                                }}
                                className="flex-1 rounded-md border-slate-200 border py-2 px-3 shadow-sm focus:border-indigo-600 focus:ring-0 text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                            />
                            {salesLetterInfo.socialProof.customerVoices.length > 1 && (
                                <button onClick={() => setSalesLetterInfo({ ...salesLetterInfo, socialProof: { ...salesLetterInfo.socialProof, customerVoices: salesLetterInfo.socialProof.customerVoices.filter((_, i) => i !== idx) } })} className="px-2 py-1 text-rose-500 hover:bg-rose-50 rounded-md text-sm">✕</button>
                            )}
                        </div>
                    ))}
                    <button onClick={() => setSalesLetterInfo({ ...salesLetterInfo, socialProof: { ...salesLetterInfo.socialProof, customerVoices: [...salesLetterInfo.socialProof.customerVoices, ''] } })} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 mt-1">＋ 追加</button>
                </div>
            </div>

            {/* CTA */}
            <div className="mb-6 p-4 bg-emerald-50/50 rounded-lg border border-emerald-100">
                <label className="block text-xs font-semibold tracking-wide text-emerald-700 mb-3">
                    {salesLetterInfo.framework === 'pasona' ? 'A：Action（行動喚起）' : 'CTA（行動喚起）'}
                </label>
                <input
                    type="text"
                    placeholder="例: 今すぐお電話ください、まずは無料のお見積りから"
                    value={salesLetterInfo.cta}
                    onChange={(e) => setSalesLetterInfo({ ...salesLetterInfo, cta: e.target.value })}
                    className="block w-full rounded-md border-slate-200 border-2 py-3.5 px-4 shadow-sm focus:border-emerald-500 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300"
                />
            </div>

            {/* Background Mode */}
            <div className="mb-6">
                <label className="block text-xs font-semibold tracking-wide text-slate-400 mb-3 ml-1">背景モード</label>
                <div className="flex gap-3">
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'creative' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="salesBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'creative'} onChange={() => setSettings({ ...settings, backgroundMode: 'creative' })} />
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-400 via-rose-400 to-indigo-500 flex items-center justify-center text-sm shadow-inner">✨</div>
                        <div><div className="text-xs font-semibold text-slate-900">おまかせ</div></div>
                    </label>
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'white' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="salesBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'white'} onChange={() => setSettings({ ...settings, backgroundMode: 'white' })} />
                        <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-sm shadow-sm border border-slate-200">⬜</div>
                        <div><div className="text-xs font-semibold text-slate-900">白配色</div></div>
                    </label>
                    <label className={`flex-1 flex flex-col gap-2 p-3 border-2 rounded-md cursor-pointer transition-all ${settings.backgroundMode === 'custom' ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="salesBackgroundMode" className="sr-only" checked={settings.backgroundMode === 'custom'} onChange={() => setSettings({ ...settings, backgroundMode: 'custom' })} />
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-sm shadow-inner">✏️</div>
                        <div><div className="text-xs font-semibold text-slate-900">自由記述</div></div>
                    </label>
                </div>
                {settings.backgroundMode === 'custom' && (
                    <div className="mt-4">
                        <textarea rows={2} placeholder="例: 桜の花びらが舞う春らしい背景..." value={settings.customBackground || ''} onChange={(e) => setSettings({ ...settings, customBackground: e.target.value })} className="block w-full rounded-md border-slate-200 border-2 py-3 px-4 shadow-sm focus:border-indigo-600 focus:ring-0 sm:text-sm bg-white text-slate-900 font-medium placeholder:text-slate-300" />
                    </div>
                )}
            </div>
        </div>
    );
};
