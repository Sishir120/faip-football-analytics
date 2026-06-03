"use client";

import { useState } from "react";
import PitchViz from "@/components/PitchViz";
import { 
  BrainCircuit, 
  Settings, 
  Play, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Cpu
} from "lucide-react";
import { API_URL } from "@/lib/api";

export default function MLLabPage() {
  const [algorithm, setAlgorithm] = useState<string>("logistic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleTrain = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/ml/xg-model/train?algorithm=${algorithm}`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to train xG model");
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to run ML model training");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 p-8 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <span className="w-fit px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/25 text-xs font-bold tracking-wider uppercase">
          AI & Machine Learning Laboratory
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
          Tactical Predictive <span className="gradient-text">Scouting Lab</span>
        </h2>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Train custom tactical models on cached event logs. Select hyperparameters, inspect learning curve evaluations, and extract feature coefficients to analyze shot threat probabilities.
        </p>
      </div>

      {/* Grid: Controls & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Controls Card */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-5 lg:col-span-1">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Settings size={15} className="text-violet-400" />
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
              Training Configuration
            </h4>
          </div>

          {/* Model selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Model Type</label>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setAlgorithm("logistic")}
                className={`text-left px-3.5 py-3 rounded-xl border flex flex-col gap-1.5 transition-all ${
                  algorithm === "logistic"
                    ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Activity size={13} />
                  Logistic Regression
                </div>
                <span className="text-[10px] text-slate-500 leading-normal">
                  Statistically robust estimator. Best for linear coefficients mapping.
                </span>
              </button>

              <button
                onClick={() => setAlgorithm("random_forest")}
                className={`text-left px-3.5 py-3 rounded-xl border flex flex-col gap-1.5 transition-all ${
                  algorithm === "random_forest"
                    ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Cpu size={13} />
                  Random Forest Classifier
                </div>
                <span className="text-[10px] text-slate-500 leading-normal">
                  Decision tree ensemble. Handles non-linear feature interactions.
                </span>
              </button>
            </div>
          </div>

          {/* Features Checklist */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Event Features</label>
            <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Distance to Center of Goal</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Angle to Goalpost</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Is Header Bodypart?</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Is Volley Shot?</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Play Pattern: From Corner</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Under Opponent Pressure</span>
              </div>
            </div>
          </div>

          {/* Train trigger */}
          <button
            onClick={handleTrain}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2 ${
              loading
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                : "bg-gradient-to-r from-violet-500 to-sky-500 hover:opacity-95 shadow-lg shadow-violet-500/10"
            }`}
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border border-slate-400 border-t-white rounded-full animate-spin"></div>
                Optimizing Weights...
              </>
            ) : (
              <>
                <Play size={13} fill="white" />
                Execute Training Sequence
              </>
            )}
          </button>
        </div>

        {/* Evaluation Output panel */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {error && (
            <div className="p-4 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-400 flex items-center gap-3">
              <AlertCircle size={20} />
              <span className="text-sm font-semibold">{error}</span>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="glass-panel p-8 rounded-2xl text-center flex flex-col items-center justify-center min-h-[400px] text-slate-500">
              <BrainCircuit className="text-slate-700 mb-3 animate-pulse" size={40} />
              <h4 className="text-sm font-bold text-slate-300 mb-1">Model State: Uninitialized</h4>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Click "Execute Training Sequence" on the left to extract cached shot events and fit an Expected Goals model. Learning curves will compile instantly.
              </p>
            </div>
          )}

          {loading && (
            <div className="glass-panel p-8 rounded-2xl text-center flex flex-col items-center justify-center min-h-[400px] text-sky-400">
              <div className="relative w-12 h-12 flex items-center justify-center mb-4">
                <div className="w-12 h-12 border-2 border-violet-500/15 border-t-violet-400 rounded-full animate-spin"></div>
                <div className="w-8 h-8 border-2 border-sky-500/15 border-t-sky-400 rounded-full animate-spin absolute"></div>
              </div>
              <h4 className="text-xs uppercase font-extrabold tracking-wider animate-pulse-slow">
                Fitting Classifier weights
              </h4>
              <span className="text-[10px] text-slate-500 mt-1">Executing standard SGD & Backpropagation epochs...</span>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-6">
              {/* Stats highlights row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-panel p-4 rounded-xl flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Evaluation Metric (AUC)</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xl font-extrabold text-sky-400">{(result.auc_score * 100).toFixed(1)}%</span>
                    <TrendingUp size={16} className="text-sky-400" />
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Sample Size (Shots)</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xl font-extrabold text-white">{result.n_shots} shots</span>
                    <span className="text-[10px] font-semibold text-slate-400">Train: {result.n_train}</span>
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Model ID Signature</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-slate-300 truncate max-w-[130px]">{result.model_id}</span>
                    <HelpCircle size={14} className="text-slate-500" />
                  </div>
                </div>
              </div>

              {/* ROC & Feature Importance Images */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <PitchViz 
                  title="ROC Curve Metric" 
                  base64Data={result.roc_curve_image} 
                  aspectRatio="aspect-[1.1/1]"
                />
                
                <PitchViz 
                  title="Feature Coefficients" 
                  base64Data={result.feature_importance_image} 
                  aspectRatio="aspect-[1.1/1]"
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
