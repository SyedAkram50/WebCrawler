import React from 'react';
import { Search, Terminal, Activity, Database, LogOut, User as UserIcon } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, socketConnected, user, onLogout }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/20">
              <Search size={22} className="stroke-[2.5]" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">
              Crawler
            </span>
          </div>

          {/* Navigation Links & User Actions */}
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1 sm:gap-2 border-r border-slate-800 pr-4 mr-1">
              <button
                onClick={() => setActiveTab('search')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'search'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Search size={16} />
                Search
              </button>
              <button
                onClick={() => setActiveTab('console')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'console'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Terminal size={16} />
                Crawl Console
              </button>
            </nav>

            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300 font-medium bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800">
                  <UserIcon size={14} className="text-indigo-400" />
                  {user.name}
                </div>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
                  title="Logout"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
