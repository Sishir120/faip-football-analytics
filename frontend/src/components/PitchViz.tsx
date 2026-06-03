"use client";

import { useState, useEffect } from "react";
import { Maximize2, Download, RefreshCw, AlertCircle, ZoomIn } from "lucide-react";

interface PitchVizProps {
  title: string;
  fetchUrl?: string; // Optional URL to fetch image dynamically
  base64Data?: string; // Or directly pass base64
  aspectRatio?: string; // e.g. "aspect-[10/7]"
  onRefresh?: () => void;
}

export default function PitchViz({ 
  title, 
  fetchUrl, 
  base64Data: initialBase64,
  aspectRatio = "aspect-[10/7]",
  onRefresh
}: PitchVizProps) {
  const [base64, setBase64] = useState<string | null>(initialBase64 || null);
  const [loading, setLoading] = useState(!!fetchUrl);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (initialBase64) {
      setBase64(initialBase64);
      setLoading(false);
      setError(null);
    }
  }, [initialBase64]);

  useEffect(() => {
    if (!fetchUrl) return;

    let isMounted = true;
    async function fetchImage() {
      const url = fetchUrl;
      if (!url) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`API returned status ${res.status}`);
        }
        const data = await res.json();
        if (isMounted) {
          if (data.image) {
            setBase64(data.image);
          } else if (typeof data === "string") {
            setBase64(data);
          } else if (data.report_png) {
            setBase64(data.report_png);
          } else if (data.cluster_image) {
            setBase64(data.cluster_image);
          } else {
            throw new Error("No image data found in response");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to fetch visualization");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchImage();
    return () => {
      isMounted = false;
    };
  }, [fetchUrl]);

  const handleDownload = () => {
    if (!base64) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${base64}`;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full">
        {/* Header toolbar */}
        <div className="px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h3>
          
          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button 
                onClick={onRefresh}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                title="Refresh Data"
              >
                <RefreshCw size={15} />
              </button>
            )}
            {base64 && (
              <>
                <button 
                  onClick={handleDownload}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                  title="Download PNG"
                >
                  <Download size={15} />
                </button>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                  title="Expand Visualization"
                >
                  <Maximize2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content container */}
        <div className={`relative w-full ${aspectRatio} bg-[#0b0c10] flex items-center justify-center p-2`}>
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0e1117]/85 backdrop-blur-sm z-10">
              <div className="relative flex items-center justify-center mb-3">
                <div className="w-10 h-10 border-2 border-sky-500/20 border-t-sky-400 rounded-full animate-spin"></div>
                <div className="w-6 h-6 border-2 border-violet-500/20 border-t-violet-400 rounded-full animate-spin absolute"></div>
              </div>
              <span className="text-xs font-semibold text-sky-400 tracking-widest uppercase animate-pulse-slow">
                Generating Pitch Analytics...
              </span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#0e1117]/90 z-10">
              <AlertCircle className="text-rose-500 mb-3" size={32} />
              <h4 className="text-sm font-bold text-slate-200 mb-1">Visualization Error</h4>
              <p className="text-xs text-slate-400 max-w-[280px] leading-relaxed mb-4">{error}</p>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              )}
            </div>
          )}

          {base64 ? (
            <div className="relative group w-full h-full flex items-center justify-center overflow-hidden rounded-xl">
              <img 
                src={`data:image/png;base64,${base64}`} 
                alt={title}
                className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-[1.015]"
              />
              <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-xs font-semibold text-white border border-slate-700 shadow-xl flex items-center gap-2">
                  <ZoomIn size={13} className="text-sky-400" />
                  Hovering Analytics
                </div>
              </div>
            </div>
          ) : (
            !loading && !error && (
              <div className="flex flex-col items-center justify-center text-slate-500">
                <span className="text-xs font-medium uppercase tracking-wider">No Data Loaded</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Full-Screen Expand Modal */}
      {isModalOpen && base64 && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-[#0e1117] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-white tracking-wide">{title}</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 border border-slate-700/60 rounded-xl hover:bg-slate-700/60 transition-all"
                >
                  <Download size={14} />
                  Download PNG
                </button>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900/80 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Pitch Image */}
            <div className="p-6 bg-[#07090d] flex items-center justify-center aspect-[10/7] max-h-[70vh]">
              <img 
                src={`data:image/png;base64,${base64}`} 
                alt={title}
                className="max-w-full max-h-full object-contain rounded-lg border border-slate-900"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
