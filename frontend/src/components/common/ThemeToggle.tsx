import React from 'react';
import { Sun, Coffee, Moon } from 'lucide-react';
import type { ReadingTheme } from '../../types';

interface ThemeToggleProps {
  theme: ReadingTheme;
  onChange: (theme: ReadingTheme) => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onChange }) => {
  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => onChange('light')}
        title="Light Mode (Standard)"
        className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
          theme === 'light'
            ? 'bg-white shadow-sm text-amber-600 font-semibold'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Light</span>
      </button>

      <button
        onClick={() => onChange('sepia')}
        title="Sepia Mode (Warm Paper / Eye Comfort)"
        className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
          theme === 'sepia'
            ? 'bg-[#eddcc1] text-[#603b1d] shadow-sm font-semibold'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
        }`}
      >
        <Coffee className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Sepia</span>
      </button>

      <button
        onClick={() => onChange('dark')}
        title="Dark Mode (Night Reader)"
        className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
          theme === 'dark'
            ? 'bg-gray-900 text-blue-400 shadow-sm font-semibold'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dark</span>
      </button>
    </div>
  );
};
