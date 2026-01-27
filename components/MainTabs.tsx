import React from 'react';

export type MainTabType = 'common' | 'front' | 'back' | 'assets';

interface MainTabsProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
}

const tabs: { id: MainTabType; label: string; icon: string }[] = [
  { id: 'common', label: '共通設定', icon: '⚙️' },
  { id: 'front', label: '表面', icon: '📄' },
  { id: 'back', label: '裏面', icon: '📋' },
  { id: 'assets', label: 'アセット', icon: '🎨' },
];

export const MainTabs: React.FC<MainTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex bg-slate-100 rounded-xl p-1.5 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
            activeTab === tab.id
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
          }`}
        >
          <span className="text-base">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default MainTabs;
