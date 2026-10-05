import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  ZoomIn,
  ZoomOut,
  Search,
  PanelRightClose,
  PanelRightOpen,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Database,
  Sparkles,
} from 'lucide-react';
import type { DocumentMeta, ReadingTheme } from '../types';
import { ThemeToggle } from './common/ThemeToggle';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  currentDoc: DocumentMeta | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  theme: ReadingTheme;
  sidebarOpen: boolean;
  isSearching: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onPageChange: (page: number) => void;
  onThemeChange: (theme: ReadingTheme) => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onOpenLibrary: () => void;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onOpenAISettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentDoc,
  currentPage,
  totalPages,
  zoom,
  theme,
  sidebarOpen,
  isSearching,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onPageChange,
  onThemeChange,
  onToggleSidebar,
  onToggleSearch,
  onOpenLibrary,
  onOpenAuth,
  onOpenAdmin,
  onOpenAISettings,
}) => {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 z-20 select-none bg-white/80 dark:bg-gray-900/80 backdrop-blur border-gray-200 dark:border-gray-800">
      {/* Left: App Logo & Library trigger */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-bold text-lg text-indigo-600 dark:text-indigo-400">
          <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden md:inline font-extrabold tracking-tight">ResearchReader</span>
        </div>

        <button
          onClick={onOpenLibrary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition"
          title="Switch paper or upload new PDF"
        >
          <FolderOpen className="w-4 h-4 text-indigo-500" />
          <span>Library</span>
        </button>

        {currentDoc && (
          <div className="hidden lg:flex items-center gap-2 text-xs text-gray-500 max-w-xs truncate" title={currentDoc.original_name}>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="truncate font-medium text-gray-800 dark:text-gray-200">{currentDoc.original_name}</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono text-[10px]">
              {Math.round(currentDoc.progress_percent)}% read
            </span>
          </div>
        )}
      </div>

      {/* Middle: Page & Zoom Controls */}
      <div className="flex items-center gap-2">
        {/* Page navigation */}
        {totalPages > 0 && (
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 text-xs font-medium font-mono text-gray-700 dark:text-gray-300">
              {currentPage} / {totalPages}
            </div>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Zoom controls */}
        <div className="hidden sm:flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
          <button
            onClick={onZoomOut}
            className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-700 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onZoomReset}
            className="px-2 text-xs font-mono font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            title="Reset Zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-700 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search button */}
        <button
          onClick={onToggleSearch}
          className={`p-2 rounded-lg border transition ${
            isSearching
              ? 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950 dark:border-indigo-700 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Search in PDF (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Reading Ergonomics Themes, Split Sidebar & User Profile */}
      <div className="flex items-center gap-2">
        {/* Admin Dashboard Trigger - Only for Admins */}
        {user?.is_admin && (
          <button
            onClick={onOpenAdmin}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition"
            title="Database & AI RAG Admin Hub (Admin Only)"
          >
            <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Admin Hub</span>
          </button>
        )}

        {/* AI Model & Keys Settings Trigger */}
        {onOpenAISettings && (
          <button
            onClick={onOpenAISettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition"
            title="Configure AI Engine & API Keys (Ollama / Cloud)"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span className="hidden sm:inline">AI Settings</span>
          </button>
        )}

        <ThemeToggle theme={theme} onChange={onThemeChange} />

        <button
          onClick={onToggleSidebar}
          className={`p-2 rounded-lg border transition ${
            sidebarOpen
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title={sidebarOpen ? 'Collapse Notepad & Annotations' : 'Open Notepad & Annotations'}
        >
          {sidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>

        {/* User Account / Profile Menu */}
        {user ? (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 p-1 pl-1.5 pr-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title={user.email}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold max-w-[80px] truncate text-gray-700 dark:text-gray-300 hidden sm:inline">
                {user.username}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 p-2 z-50 animate-in fade-in duration-100">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{user.username}</p>
                    {user.is_admin && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                </div>
                {user.is_admin && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAdmin();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2 transition mt-1"
                  >
                    <Database className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Admin & RAG Hub</span>
                  </button>
                )}
                {onOpenAISettings && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAISettings();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg flex items-center gap-2 transition mt-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span>AI Engine & Keys</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg flex items-center gap-2 transition mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition"
            title="Sign in or create account to sync papers across devices"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
