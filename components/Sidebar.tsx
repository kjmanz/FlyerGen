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
          h-screen w-[280px] bg-white border-r border-slate-200
          transform transition-transform duration-300 ease-in-out
          lg:transform-none lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          overflow-y-auto
          flex-shrink-0
        `}
            >
                {/* Mobile close button */}
                <div className="lg:hidden sticky top-0 bg-white border-b border-slate-100 p-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-700">設定・アセット</span>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Sidebar content */}
                <div className="p-4">
                    {children}
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
