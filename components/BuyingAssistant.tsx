
import React, { useMemo, useState, useEffect } from 'react';
import { Product, UserProfile } from '../types';
import { getBuyingDecision } from '../services/geminiService';
import { Check, X, AlertTriangle, ShieldCheck, Zap, AlertOctagon, TrendingUp, DollarSign, Clock, ArrowRight, Lock, Sparkles, ExternalLink, Globe, Info, Microscope, ListChecks, ThumbsUp, ThumbsDown, Crown, Pipette, Droplet, FlaskConical, Shield, Sun, Activity } from 'lucide-react';

interface BuyingAssistantProps {
  product: Product;
  user: UserProfile;
  shelf: Product[];
  onAddToShelf: () => void;
  onDiscard: () => void;
  onUnlockPremium: () => void;
}

const BuyingAssistant: React.FC<BuyingAssistantProps> = ({ product, user, shelf, onAddToShelf, onDiscard, onUnlockPremium }) => {
  const [isUnlocked, setIsUnlocked] = useState(!!user.isPremium);
  
  useEffect(() => {
    setIsUnlocked(!!user.isPremium);
  }, [user.isPremium]);

  const decisionData = useMemo(() => {
    return getBuyingDecision(product, shelf, user);
  }, [product, shelf, user]);

  const { verdict, audit } = decisionData;

  const getVerdictIcon = () => {
      switch(verdict.decision) {
          case 'AVOID': return <X size={18} className="text-white" />;
          case 'CAUTION': return <AlertTriangle size={18} className="text-white" />;
          default: return <Check size={18} className="text-white" />;
      }
  };

  const getVerdictGradient = () => {
      switch(verdict.color) {
          case 'rose': return 'from-rose-500 to-red-600';
          case 'amber': return 'from-amber-400 to-orange-500';
          default: return 'from-teal-500 to-emerald-600';
      }
  };

  const getProductTypeIcon = () => {
      const type = product.type;
      const size = 32;
      const stroke = 1.5;
      switch(type) {
          case 'SERUM': return <Pipette size={size} strokeWidth={stroke} />;
          case 'MOISTURIZER': return <Droplet size={size} strokeWidth={stroke} />;
          case 'CLEANSER': return <FlaskConical size={size} strokeWidth={stroke} />;
          case 'SPF': return <Sun size={size} strokeWidth={stroke} />;
          case 'TREATMENT': return <Shield size={size} strokeWidth={stroke} />;
          default: return <Activity size={size} strokeWidth={stroke} />;
      }
  };

  // Reusable Blurred Section Component
  // Fix: Make children optional in the type definition to resolve property 'children' is missing error in JSX usage
  const PremiumSection = ({ children, title, icon: Icon, delay = 0 }: { children?: React.ReactNode, title: string, icon: any, delay?: number }) => {
      // Placeholder content used ONLY if absolutely no children are provided
      const placeholderContent = (
          <div className="space-y-2 opacity-100">
              <div className="h-3 bg-zinc-200 rounded-full w-full"></div>
              <div className="h-3 bg-zinc-200 rounded-full w-[92%]"></div>
              <div className="h-3 bg-zinc-200 rounded-full w-[96%]"></div>
              <div className="h-3 bg-zinc-200 rounded-full w-[80%]"></div>
          </div>
      );

      return (
        <div className={`bg-white p-5 rounded-[2rem] border border-zinc-100 shadow-sm relative overflow-hidden transition-all duration-500 animate-in slide-in-from-bottom-4`} style={{ animationDelay: `${delay}ms` }}>
            <h3 className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Icon size={12} /> {title}
            </h3>
            
            <div className="relative">
                {/* Content Container - Blurred if Locked */}
                {/* Reduced blur to 3px to show structure better, kept opacity high */}
                <div className={`transition-all duration-500 ${!isUnlocked ? 'filter blur-[3px] select-none opacity-80 pointer-events-none' : ''}`}>
                    {(!isUnlocked && (!children || React.Children.count(children) === 0)) ? placeholderContent : children}
                </div>

                {/* Lock Overlay */}
                {!isUnlocked && (
                    <div 
                        onClick={onUnlockPremium}
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-pointer group rounded-xl"
                    >
                        {/* Gradient tint to make text harder to read but keep structure visible */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-white/40 to-white/90"></div>
                        
                        <div className="relative z-20 flex flex-col items-center">
                            <div className="w-9 h-9 bg-teal-400 text-white rounded-full flex items-center justify-center shadow-lg shadow-teal-400/30 group-hover:scale-110 transition-transform mb-2">
                                <Lock size={14} />
                            </div>
                            <span className="text-[9px] font-black text-teal-900 uppercase tracking-widest bg-white/90 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-teal-100">
                                Unlock
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
      );
  };

  return (
    <div className={`min-h-screen pb-32 bg-zinc-50 font-sans`}>
        
        {/* HEADER */}
        <div 
            className="pt-10 px-6 pb-10 rounded-b-[3rem] relative overflow-hidden shadow-xl z-20"
            style={{ backgroundColor: 'rgb(163, 206, 207)' }}
        >
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none mix-blend-overlay"></div>

            <button onClick={onDiscard} className="absolute top-6 left-6 p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors z-30 border border-white/20">
                <X size={18} />
            </button>

            {/* COMPACT HERO */}
            <div className="flex flex-col items-center text-center relative z-10">
                <div className="relative w-28 h-28 bg-white rounded-[2rem] mb-5 shadow-xl flex items-center justify-center text-teal-500 animate-in zoom-in duration-500">
                    <div className="absolute inset-3 border border-teal-50 rounded-[1.5rem]"></div>
                    {getProductTypeIcon()}
                </div>

                <h1 className="text-xl font-black text-white leading-tight mb-1 tracking-tight drop-shadow-md max-w-xs">{product.name}</h1>
                <p className="text-[10px] font-bold text-teal-50 uppercase tracking-widest mb-5 opacity-90">{product.brand || 'Analysis Complete'}</p>
                
                <div className="flex items-center gap-3">
                    <div className="px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/30 shadow-lg">
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">RM {product.estimatedPrice || '--'}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* VERDICT CARD (Overlapping) */}
        <div className="relative px-6 -mt-6 z-30">
            <div className={`rounded-[2rem] p-5 text-white shadow-xl bg-gradient-to-br ${getVerdictGradient()} ring-4 ring-white/50`}>
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 shrink-0">
                        {getVerdictIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-80 block mb-0.5">Compatibility</span>
                        <h2 className="text-xl font-black tracking-tight leading-none truncate">{verdict.title}</h2>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black leading-none tracking-tighter">{product.suitabilityScore}</span>
                        <span className="text-[9px] font-bold block opacity-80">%</span>
                    </div>
                </div>
            </div>
        </div>

        {/* ANALYSIS GRID */}
        <div className="px-5 mt-6 space-y-4">
             
             {/* 1. CLINICAL VERDICT */}
             <PremiumSection title="Clinical Review" icon={Microscope} delay={100}>
                 <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                    {isUnlocked 
                        ? (product.scientificVerdict || "This specialized formulation utilizes key actives to address common dermatological concerns associated with your specific skin profile indicators. The molecular weight of the active ingredients suggests good penetration.") 
                        : "Analysis of the full ingredient profile indicates distinct interactions with your current skin barrier health. Our algorithm has identified key active agents that directly correlate with your hydration and sensitivity metrics. We have detected specific compatibility factors that may influence long-term pore clarity and texture refinement. Unlock this report to view the complete dermatological breakdown."
                    }
                 </p>
             </PremiumSection>

             {/* 2. PROS & CONS */}
             <div className="grid grid-cols-2 gap-3">
                 <div className="bg-white p-4 rounded-[2rem] border border-zinc-100 shadow-sm relative overflow-hidden h-full">
                     <h4 className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                         <ThumbsUp size={10} /> Benefits
                     </h4>
                     <div className={`space-y-2 ${!isUnlocked ? 'filter blur-[3px] opacity-70 select-none' : ''}`}>
                         {(product.pros && product.pros.length > 0 ? product.pros : ["Supports skin barrier function", "Targeted active delivery", "Optimized pH balance"]).slice(0,3).map((pro, i) => (
                             <div key={i} className="flex items-start gap-2">
                                 <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0"></div>
                                 <span className="text-[10px] font-semibold text-zinc-600 leading-tight">{pro}</span>
                             </div>
                         ))}
                     </div>
                     {!isUnlocked && <div onClick={onUnlockPremium} className="absolute inset-0 z-10 cursor-pointer" />}
                 </div>

                 <div className="bg-white p-4 rounded-[2rem] border border-zinc-100 shadow-sm relative overflow-hidden h-full">
                     <h4 className="text-[9px] font-bold text-rose-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                         <ThumbsDown size={10} /> Risks
                     </h4>
                     <div className={`space-y-2 ${!isUnlocked ? 'filter blur-[3px] opacity-70 select-none' : ''}`}>
                         {(product.cons && product.cons.length > 0 ? product.cons : ["Potential pore clogging", "Contains common allergens", "May cause purging"]).slice(0,3).map((con, i) => (
                             <div key={i} className="flex items-start gap-2">
                                 <div className="w-1 h-1 rounded-full bg-rose-400 mt-1.5 shrink-0"></div>
                                 <span className="text-[10px] font-semibold text-zinc-600 leading-tight">{con}</span>
                             </div>
                         ))}
                     </div>
                     {!isUnlocked && <div onClick={onUnlockPremium} className="absolute inset-0 z-10 cursor-pointer" />}
                 </div>
             </div>

             {/* 3. USAGE STRATEGY */}
             <PremiumSection title="Usage Strategy" icon={Clock} delay={200}>
                 <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                    {isUnlocked 
                        ? (product.usageAdvice || "Integrate this product slowly into your routine, focusing on evening application to maximize the efficacy of its active ingredients while minimizing sun sensitivity.")
                        : "Based on the concentration of active ingredients, we recommend a specific application frequency to avoid barrier disruption. This formulation requires careful layering with your existing routine to prevent pH imbalance. Unlock the full guide to see exactly when to apply this in your AM or PM schedule for maximum efficacy."
                    }
                 </p>
             </PremiumSection>

             {/* SOURCES (Always Visible) */}
             {product.sourceUrls && product.sourceUrls.length > 0 && (
                 <div className="bg-white p-5 rounded-[2rem] border border-zinc-100 shadow-sm">
                     <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Globe size={12} className="text-teal-500" /> Verified Sources
                     </h3>
                     <div className="space-y-2">
                         {product.sourceUrls.slice(0, 2).map((source, i) => (
                             <a 
                                 key={i} 
                                 href={source.uri} 
                                 target="_blank" 
                                 rel="noopener noreferrer"
                                 className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100 hover:border-teal-200 group transition-all"
                             >
                                 <span className="text-[10px] font-bold text-zinc-600 truncate mr-4">{source.title}</span>
                                 <ExternalLink size={10} className="text-zinc-300 group-hover:text-teal-500 shrink-0" />
                             </a>
                         ))}
                     </div>
                 </div>
             )}

             {/* INGREDIENTS (If Unlocked) */}
             {isUnlocked && (
                <div className="bg-white p-5 rounded-[2rem] border border-zinc-100 shadow-sm animate-in fade-in">
                    <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <ListChecks size={12} /> INCI Profile
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                        {product.ingredients.slice(0, 10).map((ing, i) => (
                            <span key={i} className="px-2.5 py-1 bg-zinc-50 text-zinc-500 text-[9px] font-bold rounded-lg uppercase border border-zinc-100">
                                {ing}
                            </span>
                        ))}
                        {product.ingredients.length > 10 && (
                            <span className="px-2.5 py-1 text-zinc-400 text-[9px] font-bold rounded-lg uppercase">
                                +{product.ingredients.length - 10} more
                            </span>
                        )}
                    </div>
                </div>
             )}
        </div>

        {/* STICKY ACTION BAR */}
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-xl border-t border-zinc-100 z-50 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
            <div className="flex gap-3 max-w-md mx-auto">
                <button onClick={onDiscard} className="h-12 w-12 rounded-2xl bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200 transition-colors">
                    <X size={18} />
                </button>
                
                {isUnlocked ? (
                    <button 
                        onClick={onAddToShelf} 
                        className="flex-1 h-12 bg-teal-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        Save to Shelf <ArrowRight size={16} />
                    </button>
                ) : (
                    <button 
                        onClick={onUnlockPremium}
                        className="flex-1 h-12 bg-teal-400 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-teal-400/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Sparkles size={14} className="text-amber-100 fill-amber-100" /> Unlock Analysis
                    </button>
                )}
            </div>
        </div>
    </div>
  );
};

export default BuyingAssistant;
