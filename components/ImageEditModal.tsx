import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Edit region types
type EditMode = 'point' | 'area';

interface EditPoint {
    id: string;
    type: 'point';
    x: number;  // percentage
    y: number;  // percentage
    prompt: string;
}

interface EditArea {
    id: string;
    type: 'area';
    x: number;      // start position %
    y: number;
    width: number;  // %
    height: number;
    prompt: string;
}

type EditRegion = EditPoint | EditArea;

interface ImageEditModalProps {
    imageUrl: string;
    onClose: () => void;
    onGenerate: (regions: EditRegion[]) => void;
    isGenerating: boolean;
}

export const ImageEditModal: React.FC<ImageEditModalProps> = ({
    imageUrl,
    onClose,
    onGenerate,
    isGenerating
}) => {
    const [mode, setMode] = useState<EditMode>('point');
    const [regions, setRegions] = useState<EditRegion[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [tempArea, setTempArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const lastMoveTime = useRef<number>(0);

    // Get percentage position from mouse event
    const getPercentagePosition = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    }, []);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (mode === 'point') {
            // Add point marker
            const { x, y } = getPercentagePosition(e);
            const newPoint: EditPoint = {
                id: uuidv4(),
                type: 'point',
                x,
                y,
                prompt: ''
            };
            setRegions([...regions, newPoint]);
        } else {
            // Start area selection
            const { x, y } = getPercentagePosition(e);
            setIsDragging(true);
            setDragStart({ x, y });
            setTempArea({ x, y, width: 0, height: 0 });
        }
    };

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStart) return;

        // Throttle to max 60fps for smooth performance
        const now = Date.now();
        if (now - lastMoveTime.current < 16) return;
        lastMoveTime.current = now;

        const { x, y } = getPercentagePosition(e);
        const width = x - dragStart.x;
        const height = y - dragStart.y;

        setTempArea({
            x: width >= 0 ? dragStart.x : x,
            y: height >= 0 ? dragStart.y : y,
            width: Math.abs(width),
            height: Math.abs(height)
        });
    }, [isDragging, dragStart, getPercentagePosition]);

    const handleMouseUp = () => {
        if (isDragging && tempArea && tempArea.width > 2 && tempArea.height > 2) {
            const newArea: EditArea = {
                id: uuidv4(),
                type: 'area',
                x: tempArea.x,
                y: tempArea.y,
                width: tempArea.width,
                height: tempArea.height,
                prompt: ''
            };
            setRegions([...regions, newArea]);
        }
        setIsDragging(false);
        setDragStart(null);
        setTempArea(null);
    };

    const updateRegionPrompt = (id: string, prompt: string) => {
        setRegions(regions.map(r => r.id === id ? { ...r, prompt } : r));
    };

    const removeRegion = (id: string) => {
        setRegions(regions.filter(r => r.id !== id));
    };

    const handleGenerate = () => {
        const validRegions = regions.filter(r => r.prompt.trim() !== '');
        if (validRegions.length === 0) {
            alert('少なくとも1つの編集箇所にプロンプトを入力してください。');
            return;
        }
        onGenerate(validRegions);
    };

    // Get position description for display
    const getPositionDescription = (region: EditRegion): string => {
        if (region.type === 'point') {
            const xPos = region.x < 33 ? '左' : region.x > 66 ? '右' : '中央';
            const yPos = region.y < 33 ? '上' : region.y > 66 ? '下' : '中央';
            return `${yPos}${xPos}`;
        } else {
            return `範囲選択`;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 max-h-[95vh] overflow-hidden flex flex-col">
                {/* Compact Header with Toolbar */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-lg">✏️</div>
                        <h2 className="text-lg font-bold text-slate-900">画像編集</h2>
                    </div>

                    {/* Mode Selection - Centered */}
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setMode('point')}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${mode === 'point'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            📍 ポイント
                        </button>
                        <button
                            onClick={() => setMode('area')}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${mode === 'area'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            ⬜ 範囲選択
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                            {regions.length}箇所を選択中
                        </span>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Image Canvas */}
                    <div className="flex-1 p-6 bg-slate-50 flex items-center justify-center overflow-auto">
                        <div
                            ref={containerRef}
                            className="relative cursor-crosshair select-none"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <img
                                src={imageUrl}
                                alt="Edit target"
                                className="max-w-full max-h-[60vh] object-contain pointer-events-none"
                                draggable={false}
                            />

                            {/* Render point markers */}
                            {regions.filter(r => r.type === 'point').map((region, idx) => (
                                <div
                                    key={region.id}
                                    className="absolute w-8 h-8 -ml-4 -mt-4 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg border-2 border-white"
                                    style={{
                                        left: `${region.x}%`,
                                        top: `${region.y}%`
                                    }}
                                >
                                    {regions.indexOf(region) + 1}
                                </div>
                            ))}

                            {/* Render area selections */}
                            {regions.filter(r => r.type === 'area').map((region, idx) => {
                                const area = region as EditArea;
                                return (
                                    <div
                                        key={region.id}
                                        className="absolute bg-indigo-500/30 border-2 border-indigo-600 border-dashed"
                                        style={{
                                            left: `${area.x}%`,
                                            top: `${area.y}%`,
                                            width: `${area.width}%`,
                                            height: `${area.height}%`
                                        }}
                                    >
                                        <span className="absolute -top-3 -left-3 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                            {regions.indexOf(region) + 1}
                                        </span>
                                    </div>
                                );
                            })}

                            {/* Temp area while dragging */}
                            {tempArea && (
                                <div
                                    className="absolute bg-indigo-500/20 border-2 border-indigo-400 border-dashed pointer-events-none"
                                    style={{
                                        left: `${tempArea.x}%`,
                                        top: `${tempArea.y}%`,
                                        width: `${tempArea.width}%`,
                                        height: `${tempArea.height}%`
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Edit List Panel */}
                    <div className="w-80 border-l border-slate-100 flex flex-col bg-white">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">編集箇所</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {regions.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-8">
                                    画像上をクリックまたは<br />ドラッグして編集箇所を<br />追加してください
                                </p>
                            ) : (
                                regions.map((region, idx) => (
                                    <div key={region.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold text-slate-700">
                                                {idx + 1}. {getPositionDescription(region)}
                                                {region.type === 'point' ? ' 📍' : ' ⬜'}
                                            </span>
                                            <button
                                                onClick={() => removeRegion(region.id)}
                                                className="text-rose-400 hover:text-rose-600 text-lg"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                        <textarea
                                            value={region.prompt}
                                            onChange={(e) => updateRegionPrompt(region.id, e.target.value)}
                                            placeholder="編集指示を入力..."
                                            className="w-full p-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            rows={2}
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 flex items-center justify-between">
                    <button
                        onClick={() => setRegions([])}
                        className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                        disabled={regions.length === 0}
                    >
                        すべてクリア
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                        >
                            キャンセル
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || regions.length === 0}
                            className={`px-6 py-3 text-sm font-bold text-white rounded-lg transition-all ${isGenerating || regions.length === 0
                                ? 'bg-slate-300 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                        >
                            {isGenerating ? '生成中...' : '✨ 編集画像を作成'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export type { EditRegion, EditPoint, EditArea };
