"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import PitchViz from "@/components/PitchViz";
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Activity, 
  Award,
  CheckCircle2
} from "lucide-react";

export default function MatchReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const matchId = Number(resolvedParams.id);

  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`http://localhost:8000/api/report/match?match_id=${matchId}`);
        if (!res.ok) {
          throw new Error("Failed to compile match intelligence report. Ensure match is cached.");
        }
        const data = await res.json();
        setReportData(data);
      } catch (err: any) {
        setError(err.message || "Failed to compile report");
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mb-4"></div>
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 animate-pulse-slow">
          Compiling 6-Panel Composite Intel...
        </span>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-rose-500 mb-4 animate-bounce">
          <FileText size={32} />
        </div>
        <h3 className="text-lg font-extrabold text-white mb-2">Report Compilation Error</h3>
        <p className="text-slate-400 text-xs leading-relaxed mb-6">
          Failed to compile the tactical composite report. Please verify that this match has full events seeded in the local database.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/match/${matchId}`}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white hover:bg-slate-700/80 transition"
          >
            Go to Match Center
          </Link>
          <Link
            href="/"
            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-violet-500 rounded-xl text-xs font-bold text-white hover:opacity-95 transition"
          >
            Back Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <Link
          href={`/match/${matchId}`}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Match Center Analysis
        </Link>
        
        {/* PDF Download Direct Anchor linking to API download endpoint */}
        <a
          href={`http://localhost:8000/api/report/match/download-pdf?match_id=${matchId}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-95 shadow-lg shadow-emerald-500/10 text-xs font-bold transition-all"
        >
          <Download size={14} />
          Download PDF Scouting Dossier
        </a>
      </div>

      {/* Intelligence dossier heading */}
      <div className="flex flex-col gap-2 p-8 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <span className="w-fit px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-xs font-bold tracking-wider uppercase">
          Match Scouting Dossier
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
          Tactical Match Intelligence <span className="gradient-text">Scout Report</span>
        </h2>
        <div className="flex items-center gap-3 text-slate-400 text-sm mt-1.5">
          <Award size={16} className="text-sky-400" />
          <span>{reportData.home_team} vs {reportData.away_team} ({reportData.score})</span>
          <span className="text-slate-600">•</span>
          <CheckCircle2 size={15} className="text-emerald-400" />
          <span>Composite Verified</span>
        </div>
      </div>

      {/* Composite 6-panel viewer */}
      <div className="grid grid-cols-1 gap-8">
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
              Composite Visual Preview (Matplotlib 6-Panel compilation)
            </h4>
            <span className="text-[10px] text-slate-500 italic">22x28 Inches • 150 DPI Render</span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-[#07090d] border border-slate-900 flex justify-center p-2">
            <img 
              src={`data:image/png;base64,${reportData.report_png}`}
              alt="Composite Tactical Match Report"
              className="w-full max-w-4xl object-contain rounded border border-slate-800/20 shadow-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
