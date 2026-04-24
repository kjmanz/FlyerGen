import React from 'react';
import { IcTabBack, IcTabFront } from './inlineIcons';

export type MainTabType = 'front' | 'back';

interface MainTabsProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
}

const tabs: { id: MainTabType; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'front', label: '表面', Icon: IcTabFront },
  { id: 'back', label: '裏面', Icon: IcTabBack },
];

export const MainTabs: React.FC<MainTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex bg-slate-100 rounded-xl p-1.5 shadow-sm">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg font-semibold text-sm transition-all ${activeTab === tab.id
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
        >
          <tab.Icon className={`h-5 w-5 flex-shrink-0 ${activeTab === tab.id ? 'text-indigo-500' : 'text-slate-400'}`} />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default MainTabs;

