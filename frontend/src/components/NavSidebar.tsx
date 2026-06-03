"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Tv, 
  Users, 
  BrainCircuit, 
  Database, 
  FileText,
  ChevronRight,
  TrendingUp,
  Compass,
  GitBranch,
  Menu,
  X
} from "lucide-react";

export default function NavSidebar() {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Player Comparisons", href: "/compare", icon: Users },
    { name: "Scout Lab", href: "/scout", icon: Compass },
    { name: "Team Clusters", href: "/team-clusters", icon: GitBranch },
    { name: "ML Analytics Lab", href: "/lab", icon: BrainCircuit },
    { name: "Scraper Control", href: "/scraper", icon: Database },
  ];

  const sidebarContent = (
    <>
      {/* Platform Title */}
      <div className="flex items-center gap-3 px-2 py-4 mb-8">
        <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/25">
          <TrendingUp size={22} className="animate-float" />
        </div>
        <div>
          <h1 className="font-extrabold text-lg leading-tight tracking-wide text-white">
            FAIP <span className="text-xs font-normal text-sky-400 block tracking-normal">Analytics Platform</span>
          </h1>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="space-y-1.5">
        <p className="text-[10px] uppercase font-bold text-slate-500 px-3 mb-2 tracking-widest">Core Modules</p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between px-3.5 py-3 rounded-xl transition-all duration-300 group ${
                isActive
                  ? "bg-gradient-to-r from-sky-500/15 to-violet-500/5 text-sky-400 border border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon 
                  size={19} 
                  className={`transition-all duration-300 ${
                    isActive ? "text-sky-400 scale-110" : "text-slate-400 group-hover:text-sky-400 group-hover:scale-110"
                  }`} 
                />
                <span className="text-sm font-semibold tracking-wide">{item.name}</span>
              </div>
              <ChevronRight 
                size={14} 
                className={`opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ${
                  isActive ? "text-sky-400 opacity-60 translate-x-0" : "text-slate-500"
                }`} 
              />
            </Link>
          );
        })}

        {/* Quick Stats Label for active page */}
        <div className="pt-6">
          <p className="text-[10px] uppercase font-bold text-slate-500 px-3 mb-2 tracking-widest">Active Analysis</p>
          {pathname.includes("/match/") && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-800/25 border border-slate-700/35 text-sky-400">
              <Tv size={17} className="animate-pulse" />
              <span className="text-xs font-semibold text-slate-300 truncate">Match Center Analysis</span>
            </div>
          )}
          {pathname.includes("/player/") && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-800/25 border border-slate-700/35 text-violet-400">
              <Users size={17} className="animate-pulse" />
              <span className="text-xs font-semibold text-slate-300 truncate">Player Performance</span>
            </div>
          )}
          {pathname.includes("/report/") && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-800/25 border border-slate-700/35 text-emerald-400">
              <FileText size={17} className="animate-pulse" />
              <span className="text-xs font-semibold text-slate-300 truncate">Match Intelligence Report</span>
            </div>
          )}
          {pathname.includes("/scout") && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-800/25 border border-slate-700/35 text-sky-400">
              <Compass size={17} className="animate-pulse" />
              <span className="text-xs font-semibold text-slate-300 truncate">Scout Search Active</span>
            </div>
          )}
          {pathname.includes("/team-clusters") && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-800/25 border border-slate-700/35 text-amber-400">
              <GitBranch size={17} className="animate-pulse" />
              <span className="text-xs font-semibold text-slate-300 truncate">Team Clusters Engine</span>
            </div>
          )}
          {!pathname.includes("/match/") && !pathname.includes("/player/") && !pathname.includes("/report/") && !pathname.includes("/scout") && !pathname.includes("/team-clusters") && (
            <div className="px-3.5 py-3.5 rounded-xl border border-dashed border-slate-800 text-slate-500 text-center text-xs">
              No active details page
            </div>
          )}
        </div>
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-[#0b0d13]/95 backdrop-blur-md border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/25">
            <TrendingUp size={16} />
          </div>
          <span className="font-extrabold text-sm text-white tracking-wide">FAIP</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-out drawer */}
      <aside className={`
        md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-[#0b0d13] border-r border-slate-800/60 p-5 
        flex flex-col justify-between overflow-y-auto
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="pt-12">
          {sidebarContent}
        </div>
        {/* Platform Version footer */}
        <div className="px-2 py-4 border-t border-slate-900 flex flex-col gap-1">
          <p className="text-[10px] font-semibold text-slate-500">FOOTBALL ANALYTICS IP</p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Version 1.0.0</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
        </div>
      </aside>

      {/* Desktop sidebar (unchanged layout) */}
      <aside className="hidden md:flex w-64 min-h-screen bg-[#0b0d13] border-r border-slate-800/60 p-5 flex-col justify-between shrink-0">
        <div>
          {sidebarContent}
        </div>

        {/* Platform Version footer */}
        <div className="px-2 py-4 border-t border-slate-900 flex flex-col gap-1">
          <p className="text-[10px] font-semibold text-slate-500">FOOTBALL ANALYTICS IP</p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Version 1.0.0</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
