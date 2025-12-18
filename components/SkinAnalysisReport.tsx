import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SkinMetrics, Product, UserProfile } from '../types';
import { auditProduct, getClinicalTreatmentSuggestions } from '../services/geminiService';
import { RefreshCw, Sparkles, Sun, Moon, Ban, CheckCircle2, AlertTriangle, Target, BrainCircuit, Stethoscope, Plus, Microscope, X, FlaskConical, Search, ArrowRight, Pipette, Droplet, Layers, Fingerprint, Info, AlertOctagon, GitBranch, ArrowUpRight, Syringe, Zap, Activity, MessageCircle, ShieldAlert, TrendingUp, TrendingDown, Minus, ShoppingBag, ScanBarcode, ShieldCheck, ChevronDown, Lock, Crown, ListChecks, HelpCircle, ThumbsUp, ThumbsDown, AlertCircle } from 'lucide-react';

// --- SUB COMPONENTS ---

const renderVerdict = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-teal-800">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
};

const HeroTooltip: React.FC<{ 
    children: React.ReactNode; 
    title: string; 
    content: string;
    align?: 'left' | 'right';
}> = ({ children, title, content, align = 'left' }) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className="relative">
            <button 
                onClick={(e) => { e.stopPropagation(); setIsVisible(!isVisible); }}
                className="text-left group outline-none w-full"
            >
                {children}
            </button>
            
            {isVisible && (
                <>
                    <div className="fixed inset-0 z-30 cursor-default" onClick={(e) => { e.stopPropagation(); setIsVisible(false); }} />
                    <div className={`absolute bottom-full mb-3 w-56 bg-zinc-900/95 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-2xl z-40 animate-in fade-in zoom-in-95 ${align === 'right' ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'}`}>
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">{title}</span>
                        </div>
                        <p className="text-[11px] font-medium text-white/90 leading-relaxed">
                            {content}
                        </p>
                        <div className={`absolute -bottom-1.5 w-3 h-3 bg-zinc-900 rotate-45 border-b border-r border-white/20 ${align === 'right' ? 'right-6' : 'left-6'}`}></div>
                    </div>
                </>
            )}
        </div>
    );
};

interface MetricRingProps {
  label: string;
  value: number;
  metricKey: keyof SkinMetrics;
  onSelect: (key: keyof SkinMetrics) => void;
}

const MetricRing: React.FC<MetricRingProps> = ({ label, value, metricKey, onSelect }) => {
  let colorClass = "text-zinc-300"; 
  if (value < 60) colorClass = "text-rose-500"; 
  else if (value > 89) colorClass = "text-emerald-500"; 
  
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
      const observer = new IntersectionObserver(
          ([entry]) => {
              if (entry.isIntersecting) {
                  // Fixed: Removed undefined setIsChartVisible call which was incorrectly included here
                  setIsVisible(true);
                  observer.disconnect(); 
              }
          },
          { threshold: 0.1 } 
      );

      if (elementRef.current) {
          observer.observe(elementRef.current);
      }

      return () => observer.disconnect();
  }, []);

  useEffect(() => {
      if (!isVisible) return;

      let start = 0;
      const duration = 1500;
      const startTime = performance.now();

      const animate = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 4);
          
          setDisplayValue(Math.round(start + (value - start) * ease));

          if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
  }, [value, isVisible]);

  return (
      <button 
        ref={elementRef}
        onClick={() => onSelect(metricKey)}
        className="flex flex-col items-center justify-center p-2 relative transition-transform w-full group hover:scale-110 duration-300 ease-out"
      >
          <div className="relative w-11 h-11 flex items-center justify-center mb-3">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  <circle
                    cx="50" cy="50" r="40"
                    className="text-black transition-colors opacity-10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8" 
                  />
                  <circle
                    cx="50" cy="50" r="40"
                    className={`${colorClass} transition-all duration-1000 ease-out`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${displayValue * 2.51}, 251`}
                    strokeLinecap="round"
                    style={{ 
                        opacity: isVisible ? 1 : 0,
                        transition: 'opacity 0.5s ease-out'
                    }}
                  />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-[10px] font-black tracking-tighter text-black`}>{displayValue}</span>
              </div>
          </div>
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest truncate w-full text-center group-hover:text-teal-600 transition-colors">{label}</span>
      </button>
  );
};

interface GroupSectionProps {
    title: string;
    score: number;
    delayClass?: string;
    children?: React.ReactNode;
}

const GroupSection: React.FC<GroupSectionProps> = ({ title, score, delayClass = "", children }) => (
  <div className={`modern-card rounded-[2rem] p-6 tech-reveal ${delayClass} hover:shadow-lg transition-shadow duration-500`}>
      <div className="flex justify-between items-center mb-6 px-1 border-b border-zinc-50 pb-4">
          <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest">{title}</h3>
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${score > 89 ? 'bg-emerald-50 text-emerald-600' : score < 60 ? 'bg-rose-50 text-rose-600' : 'text-zinc-400 bg-zinc-50'}`}>
              Avg: {Math.round(score)}
          </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
          {children}
      </div>
  </div>
);

interface MetricModalProps {
    metric: string; 
    score: number;
    age: number;
    observation?: string;
    onClose: () => void;
}

const MetricModal: React.FC<MetricModalProps> = ({ metric, score, age, observation, onClose }) => {
    const getAverage = () => {
        if (metric === 'sagging' || metric === 'wrinkleFine') return age < 30 ? 85 : 65;
        if (metric === 'oiliness') return age < 30 ? 60 : 80;
        return 75;
    };
    
    const avg = getAverage();
    const performance = score >= avg ? 'Above Average' : 'Needs Care';

    const getObservation = () => {
        if (observation) return observation;
        
        const ROIMap: Record<string, string> = {
            'acneActive': 'Cheeks and Chin',
            'acneScars': 'Cheeks and Jawline',
            'poreSize': 'Nose area',
            'blackheads': 'Nose and Chin',
            'wrinkleFine': 'Forehead and eyes',
            'wrinkleDeep': 'Forehead',
            'sagging': 'Jawline',
            'pigmentation': 'Cheeks and forehead',
            'redness': 'Cheeks and nose',
            'texture': 'Skin surface',
            'hydration': 'Overall face',
            'oiliness': 'Forehead and Nose',
            'darkCircles': 'Under-eyes',
        };

        const location = ROIMap[metric] || 'Face';
        const severity = score < 60 ? 'Significant' : score < 80 ? 'Some' : 'Minimal';
        
        if (metric === 'poreSize') return `${severity} visible pores detected on your ${location}.`;
        if (metric === 'acneActive') return `${severity} active acne breakouts found on your ${location}.`;
        if (metric === 'redness') return `${severity} skin redness seen on your ${location}.`;
        if (metric === 'wrinkleFine') return `${severity} fine lines appearing on your ${location}.`;
        if (metric === 'pigmentation') return `${severity} dark spots seen on your ${location}.`;
        if (metric === 'acneScars') return `${severity} scarring visible on your ${location}.`;
        
        if (score > 85) return `Your skin looks very healthy and clear on your ${location}.`;
        return `${severity} changes seen on your ${location}.`;
    }

    const getDisplayTerm = (m: string) => {
        if (m === 'acneActive') return 'Acne';
        if (m === 'wrinkleFine') return 'Lines';
        if (m === 'wrinkleDeep') return 'Wrinkles';
        if (m === 'poreSize') return 'Pores';
        if (m === 'acneScars') return 'Scars';
        if (m === 'pigmentation') return 'Spots';
        return m.charAt(0).toUpperCase() + m.slice(1);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-md animate-in fade-in duration-300">
             <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 relative animate-in zoom-in-95 shadow-2xl">
                 <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-zinc-50 rounded-full text-zinc-400 hover:text-zinc-900 transition-colors">
                     <X size={20} />
                 </button>

                 <div className="text-center mb-10 mt-4 tech-reveal">
                     <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{getDisplayTerm(metric)}</span>
                     <h2 className="text-7xl font-black text-zinc-900 mt-4 mb-4 tracking-tighter">{Math.round(score)}</h2>
                     <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wide ${score > avg ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                         {performance}
                     </span>
                 </div>

                 <div className="mb-10 tech-reveal delay-100">
                     <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                         <span>Average ({avg})</span>
                         <span>You ({Math.round(score)})</span>
                     </div>
                     <div className="h-3 bg-zinc-100 rounded-full overflow-hidden relative">
                         <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-400 z-10" style={{ left: `${avg}%` }} />
                         <div className={`h-full rounded-full transition-all duration-1000 draw-stroke ${score > 80 ? 'bg-emerald-400' : score > 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${score}%` }} />
                     </div>
                 </div>

                 <div className="bg-teal-50/50 rounded-2xl p-6 border border-teal-100/50 tech-reveal delay-200">
                     <h4 className="text-xs font-bold text-teal-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Info size={14} /> Analysis
                     </h4>
                     <p className="text-sm text-zinc-600 leading-relaxed font-medium">
                         {getObservation()}
                     </p>
                 </div>
             </div>
        </div>
    )
}

interface SkinAnalysisReportProps {
  userProfile: UserProfile;
  shelf: Product[];
  onRescan: () => void;
  onConsultAI: (query: string) => void;
  onViewProgress?: () => void;
  onLoginRequired: (reason: string) => void;
  onOpenRoutineBuilder: () => void;
  onUnlockPremium: () => void;
}

const SkinAnalysisReport: React.FC<SkinAnalysisReportProps> = ({ userProfile, shelf, onRescan, onConsultAI, onViewProgress, onLoginRequired, onOpenRoutineBuilder, onUnlockPremium }) => {
  const metrics = userProfile.biometrics;
  const age = userProfile.age || 25; 
  const [selectedMetric, setSelectedMetric] = useState<keyof SkinMetrics | null>(null);
  const [isChartVisible, setIsChartVisible] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(!!userProfile.isPremium);

  useEffect(() => {
    setIsPremiumUnlocked(!!userProfile.isPremium);
  }, [userProfile.isPremium]);

  useEffect(() => {
      const observer = new IntersectionObserver(
          ([entry]) => {
              if (entry.isIntersecting) {
                  setIsChartVisible(true);
                  observer.disconnect();
              }
          },
          { threshold: 0.3 }
      );
      if (chartRef.current) observer.observe(chartRef.current);
      return () => observer.disconnect();
  }, []);

  const calculatedSkinType = useMemo(() => {
      const parts = [];
      const isSensitive = metrics.redness < 60;
      const isCriticallyDry = metrics.hydration < 45;
      const isOily = metrics.oiliness < 50;
      const isDry = metrics.hydration < 55;
      if (isSensitive) parts.push("Sensitive");
      if (isCriticallyDry) parts.push("Dry");
      else if (isOily) parts.push("Oily");
      else if (isDry) parts.push("Dry");
      else if (metrics.oiliness > 50 && metrics.oiliness < 70) parts.push("Combination");
      else parts.push("Normal");
      return parts.join(" + ");
  }, [metrics]);

  const groupAnalysis = useMemo(() => {
      // Priority scoring logic: Blemishes, Health, Aging
      // Each category is an average of 4 metrics to match UI sections
      const blemishScore = (metrics.acneActive + metrics.acneScars + metrics.poreSize + metrics.pigmentation) / 4;
      const healthScore = (metrics.hydration + metrics.oiliness + metrics.redness + metrics.texture) / 4;
      const agingScore = (metrics.wrinkleFine + metrics.wrinkleDeep + metrics.sagging + metrics.darkCircles) / 4;
      
      const categories = [
          { name: 'Blemishes', val: blemishScore },
          { name: 'Health', val: healthScore },
          { name: 'Aging', val: agingScore }
      ];
      
      // Highest priority is the area with the lowest score
      const sorted = [...categories].sort((a,b) => a.val - b.val);
      const lowest = sorted[0];
      
      return { 
          blemishScore, 
          healthScore, 
          agingScore, 
          priorityCategory: lowest.name, 
          priorityScore: lowest.val 
      };
  }, [metrics]);

  const verdict = useMemo(() => {
    let description = metrics.analysisSummary || "Visual analysis reveals a healthy skin barrier with minor imperfections. The surface appears significantly clear of inflammatory markers, with micro-texture primarily centered around the nasal region. Under current observation conditions, your skin exhibits strong resilience and even pigmentation levels.";

    const lowestMetrics = Object.entries(metrics)
        .filter(([k, v]) => typeof v === 'number' && k !== 'overallScore' && k !== 'skinAge' && k !== 'timestamp')
        .sort((a,b) => (a[1] as number) - (b[1] as number));
    
    const lowKey = lowestMetrics[0][0];
    const lowVal = lowestMetrics[0][1] as number;

    if (lowVal < 50 && !metrics.analysisSummary) {
        if (lowKey === 'hydration') {
            description = "Current diagnostics indicate significant **surface dehydration** across the mid-face. While sebum levels remain stable, the skin lacks critical moisture retention, leading to a loss of plumpness.";
        } else if (lowKey === 'redness') {
            description = "We have detected elevated **inflammatory markers** primarily on the cheeks. This indicates a temporarily compromised barrier, likely reacting to environmental stressors or product sensitivity.";
        } else if (lowKey === 'acneActive') {
            description = "A concentration of **active acne breakouts** is visible in the jawline region. These lesions suggest localized congestion that may require targeted antibacterial interventions.";
        }
    }
    
    return { description };
  }, [metrics]);

  const handleRescan = () => {
      if (userProfile.isAnonymous) onLoginRequired('RESCAN_FACE');
      else onRescan();
  };

  return (
    <div className="space-y-12 pb-48 font-sans">
        {/* PROGRESS TRACKER OVERLAY ON HERO */}
        <div className="modern-card rounded-[2.5rem] overflow-hidden relative group hover:shadow-2xl transition-shadow duration-500">
            <div className="relative w-full overflow-hidden aspect-[4/5] sm:aspect-[16/9] bg-black">
                 {userProfile.faceImage ? (
                    <img src={userProfile.faceImage} className="w-full h-full object-cover opacity-100" alt="Skin Scan" />
                 ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 font-mono text-xs uppercase">No Scan Data</div>
                 )}
                 <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                 
                 <button onClick={handleRescan} className="absolute top-6 right-6 z-20 bg-black/40 backdrop-blur-md text-white px-5 py-2.5 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:bg-black/60 transition-colors border border-white/10 shadow-lg">
                    <RefreshCw size={12} /> Rescan
                 </button>

                 <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white z-10">
                     <div className="flex justify-between items-start border-t border-white/10 pt-4 tech-reveal delay-100">
                        <HeroTooltip title="Health Score" content="Your overall skin rating. Higher means your skin is healthier and clearer.">
                            <div>
                                 <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Score</span>
                                 <span className="text-xl font-black text-white">{metrics.overallScore}</span>
                            </div>
                        </HeroTooltip>
                        
                        <HeroTooltip title="Main Goal" content="This is the main area your skin needs help with right now.">
                            <div className="text-center">
                                 <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Priority</span>
                                 <span className="text-xl font-black text-white">{groupAnalysis.priorityCategory}</span>
                            </div>
                        </HeroTooltip>

                        <HeroTooltip title="Your Skin Type" content="Calculated from your current oil and water levels." align="right">
                            <div className="text-right sm:text-left">
                                 <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Skin State</span>
                                 <span className="text-xl font-black text-white">{calculatedSkinType.split('+')[0].trim()}</span>
                            </div>
                        </HeroTooltip>
                     </div>
                 </div>
            </div>
        </div>

        {/* AI VERDICT SECTION - CLEAN CLINICAL STYLE WITH TEAL LEFT LINE */}
        <div className="px-5 -mt-8 z-30 relative">
            <div className="bg-white rounded-[1.5rem] p-6 shadow-sm border border-zinc-100/50">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-teal-600">
                        <Stethoscope size={16} />
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">AI VERDICT</h3>
                    </div>
                    <div className="bg-zinc-100 px-3 py-1 rounded-md">
                        <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider">BASELINE ESTABLISHED</span>
                    </div>
                </div>

                {/* Left Teal Border Added, Use font-light for content */}
                <div className="border-l-2 border-teal-500 pl-4">
                    <p className="text-[14px] text-zinc-600 font-light leading-[1.6] tracking-tight">
                        {renderVerdict(verdict.description)}
                    </p>
                </div>
            </div>

            {onViewProgress && (
                 <button 
                    onClick={() => onViewProgress()}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 text-zinc-600 rounded-2xl px-5 py-3.5 text-xs font-bold uppercase tracking-wide border border-zinc-200 transition-colors shadow-sm"
                 >
                    <TrendingUp size={14} /> View History & Progress
                 </button>
            )}
        </div>

        {/* BALANCE MATRIX */}
        <div ref={chartRef} className="modern-card rounded-[2.5rem] p-10 flex flex-col items-center relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-100 chart-container group cursor-crosshair">
             <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest mb-10">Skin Balance</h3>
             
             <div className="relative w-full max-w-[240px] aspect-square chart-zoom">
                 <svg viewBox="-10 -10 140 140" className="w-full h-full">
                     {[20, 40, 60].map(r => (
                        <circle key={r} cx="60" cy="60" r={r/2} fill="none" stroke="#F4F4F5" strokeWidth="1" className={isChartVisible ? "draw-stroke" : "opacity-0"} />
                     ))}
                     {[0, 60, 120, 180, 240, 300].map(deg => {
                         const rad = deg * Math.PI / 180;
                         return <line key={deg} x1="60" y1="60" x2={60 + 30*Math.cos(rad)} y2={60 + 30*Math.sin(rad)} stroke="#F4F4F5" strokeWidth="1" className={isChartVisible ? "draw-stroke" : "opacity-0"} />
                     })}
                     {(() => {
                         const pts = [
                             { v: metrics.acneActive, a: -Math.PI/2 }, { v: metrics.redness, a: -Math.PI/6 },
                             { v: metrics.texture, a: Math.PI/6 }, { v: metrics.oiliness, a: Math.PI/2 },
                             { v: metrics.hydration, a: 5*Math.PI/6 }, { v: metrics.wrinkleFine, a: 7*Math.PI/6 }
                         ].map(p => {
                             const r = (p.v / 100) * 30; 
                             return { x: 60 + r * Math.cos(p.a), y: 60 + r * Math.sin(p.a) };
                         });
                         const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
                         return (
                            <g className={isChartVisible ? "opacity-100 transition-opacity duration-1000" : "opacity-0"}>
                                <polygon points={polyPoints} fill="rgba(13, 148, 136, 0.15)" stroke="#0F766E" strokeWidth="2" strokeLinejoin="round" className="draw-stroke" />
                                {pts.map((p, i) => (
                                    <circle key={i} cx={p.x} cy={p.y} r="2" fill="#0D9488" className="animate-pulse" />
                                ))}
                            </g>
                         )
                     })()}
                     <text x="60" y="22" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">ACNE</text>
                     <text x="94" y="42" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">SPOTS</text>
                     <text x="94" y="78" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">SOFT</text>
                     <text x="60" y="98" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">OIL</text>
                     <text x="26" y="78" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">WATER</text>
                     <text x="26" y="42" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">LINES</text>
                 </svg>
             </div>
        </div>

        <div className="space-y-6 px-1">
             <GroupSection title="Blemishes" score={groupAnalysis.blemishScore} delayClass="delay-200">
                 <MetricRing label="Acne" value={metrics.acneActive} metricKey="acneActive" onSelect={setSelectedMetric} />
                 <MetricRing label="Scars" value={metrics.acneScars} metricKey="acneScars" onSelect={setSelectedMetric} />
                 <MetricRing label="Pores" value={metrics.poreSize} metricKey="poreSize" onSelect={setSelectedMetric} />
                 <MetricRing label="Spots" value={metrics.pigmentation} metricKey="pigmentation" onSelect={setSelectedMetric} />
             </GroupSection>
             <GroupSection title="Health" score={groupAnalysis.healthScore} delayClass="delay-300">
                 <MetricRing label="Water" value={metrics.hydration} metricKey="hydration" onSelect={setSelectedMetric} />
                 <MetricRing label="Oil" value={metrics.oiliness} metricKey="oiliness" onSelect={setSelectedMetric} />
                 <MetricRing label="Calm" value={metrics.redness} metricKey="redness" onSelect={setSelectedMetric} />
                 <MetricRing label="Soft" value={metrics.texture} metricKey="texture" onSelect={setSelectedMetric} />
             </GroupSection>
             <GroupSection title="Aging" score={groupAnalysis.agingScore} delayClass="delay-500">
                 <MetricRing label="Lines" value={metrics.wrinkleFine} metricKey="wrinkleFine" onSelect={setSelectedMetric} />
                 <MetricRing label="Wrinkles" value={metrics.wrinkleDeep} metricKey="wrinkleDeep" onSelect={setSelectedMetric} />
                 <MetricRing label="Firmness" value={metrics.sagging} metricKey="sagging" onSelect={setSelectedMetric} />
                 <MetricRing label="Eyes" value={metrics.darkCircles} metricKey="darkCircles" onSelect={setSelectedMetric} />
             </GroupSection>
        </div>

        {/* PREMIUM HUB */}
        <div 
            className="rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-500"
            style={{ backgroundColor: 'rgb(163, 206, 207)' }}
        >
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
             {!isPremiumUnlocked ? (
                 <div className="text-center relative z-10 py-4">
                      <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/30">
                          <Lock className="text-white" size={32} />
                      </div>
                      <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Personal Routine</h2>
                      <p className="text-white/90 font-medium text-sm mb-8 max-w-xs mx-auto leading-relaxed">
                         Get your own product plan and deep skin analysis. RM 9.90 one-time payment.
                      </p>
                      <button 
                        onClick={onUnlockPremium}
                        className="bg-white text-teal-900 px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 mx-auto"
                      >
                          <Sparkles size={14} className="text-teal-600" /> Unlock Everything
                      </button>
                 </div>
             ) : (
                 <div className="relative z-10 animate-in fade-in duration-500">
                      <div className="flex justify-between items-start mb-8">
                          <div>
                              <h3 className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1 flex items-center gap-2">
                                 <Sparkles size={12} /> Premium Routine
                              </h3>
                              <h2 className="text-3xl font-black text-white tracking-tight">Routine Architect</h2>
                          </div>
                      </div>
                      <button 
                        onClick={onOpenRoutineBuilder}
                        className="w-full group relative overflow-hidden rounded-[2rem] p-6 text-left transition-all hover:shadow-2xl bg-white/10 border border-white/30 backdrop-blur-md"
                      >
                           <div className="flex items-center justify-between">
                              <div>
                                 <h3 className="text-xl font-black text-white mb-1">Build My Routine</h3>
                                 <p className="text-white/90 text-xs font-bold">3-Tier Plan: Save • Value • Premium</p>
                              </div>
                              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:translate-x-1 transition-transform">
                                 <ArrowRight size={18} className="text-teal-600" />
                              </div>
                           </div>
                      </button>
                 </div>
             )}
        </div>

        {selectedMetric && (
            <MetricModal 
                metric={selectedMetric} 
                score={metrics[selectedMetric] as number} 
                age={age}
                observation={metrics.observations?.[selectedMetric]}
                onClose={() => setSelectedMetric(null)} 
            />
        )}
    </div>
  );
};

export default SkinAnalysisReport;