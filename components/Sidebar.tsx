import React from 'react';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, children }) => {
    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed lg:sticky top-0 left-0 z-50 lg:z-10
                    h-screen w-[320px] lg:w-[300px] bg-white border-r border-slate-200
                    transform transition-transform duration-300 ease-in-out
                    lg:transform-none lg:translate-x-0
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                    overflow-y-auto overflow-x-hidden
                    flex-shrink-0
                    scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent
                `}
            >
                {/* Header - PC版も表示 */}
                <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-violet-600 p-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">⚙️</span>
                        <span className="font-bold text-white text-sm">設定・アセット</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="lg:hidden p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Sidebar content */}
                <div className="p-3">
                    {children}
                </div>
            </aside>
        </>
    );
};

export default Sidebar;

