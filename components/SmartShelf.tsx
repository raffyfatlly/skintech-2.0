
import React, { useState, useMemo } from 'react';
import { Product, UserProfile, SkinMetrics } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, AlertTriangle, Layers, AlertOctagon, Target, ShieldCheck, X, FlaskConical, Clock, Ban, ArrowRightLeft, CheckCircle2, Microscope, Dna, Palette, Brush, SprayCan, Stamp, DollarSign, TrendingUp, TrendingDown, Wallet, ArrowUpRight, Edit2, Save, Info, ArrowUpCircle, Check, Globe, ExternalLink } from 'lucide-react';
import { auditProduct, analyzeShelfHealth, analyzeProductContext, getBuyingDecision } from '../services/geminiService';

interface SmartShelfProps {
  products: Product[];
  onRemoveProduct: (id: string) => void;
  onScanNew: () => void;
  onUpdateProduct: (product: Product) => void;
  userProfile: UserProfile;
}

const SmartShelf: React.FC<SmartShelfProps> = ({ products, onRemoveProduct, onScanNew, onUpdateProduct, userProfile }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ROUTINE' | 'VANITY'>('ROUTINE');
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>('');

  const shelfIQ = useMemo(() => analyzeShelfHealth(products, userProfile), [products, userProfile]);
  const makeupTypes = ['FOUNDATION', 'CONCEALER', 'POWDER', 'PRIMER', 'SETTING_SPRAY', 'BLUSH', 'BRONZER'];

  const filteredProducts = useMemo(() => {
      return activeTab === 'ROUTINE' 
        ? products.filter(p => !makeupTypes.includes(p.type))
        : products.filter(p => makeupTypes.includes(p.type));
  }, [products, activeTab]);

  const handleStartEditPrice = (p: Product) => {
      setTempPrice((p.estimatedPrice || 0).toString());
      setIsEditingPrice(true);
  };

  const handleSavePrice = () => {
      if (selectedProduct) {
          const newPrice = parseFloat(tempPrice);
          if (!isNaN(newPrice)) onUpdateProduct({ ...selectedProduct, estimatedPrice: newPrice });
          setIsEditingPrice(false);
      }
  };

  return (
    <div className="pb-32 animate-in fade-in duration-500">
       <div className="px-6 space-y-8">
          <div className="flex justify-between items-end pt-6">
              <div>
                  <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Digital Shelf</h2>
                  <p className="text-zinc-400 font-medium text-sm mt-1">Grounded analysis.</p>
              </div>
              <button onClick={onScanNew} className="w-14 h-14 rounded-[1.2rem] bg-teal-600 text-white flex items-center justify-center shadow-xl shadow-teal-200">
                  <Plus size={24} />
              </button>
          </div>

          {/* DASHBOARD SUMMARY */}
          <div className="modern-card rounded-[2.5rem] p-8 bg-white shadow-sm border border-zinc-100">
              <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 font-black">
                      {shelfIQ.analysis.grade}
                  </div>
                  <div>
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Shelf Grade</h3>
                      <p className="text-sm font-bold text-zinc-900">Routine Health Status</p>
                  </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-zinc-50 rounded-xl">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Products</span>
                      <span className="text-lg font-black text-zinc-900">{products.length}</span>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Conflicts</span>
                      <span className="text-lg font-black text-rose-500">0</span>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Match</span>
                      <span className="text-lg font-black text-teal-600">88%</span>
                  </div>
              </div>
          </div>
       </div>

       {/* TABS */}
       <div className="px-6 mt-10">
           <div className="flex bg-zinc-100/50 p-1 rounded-2xl mb-6 border border-zinc-100">
               <button onClick={() => setActiveTab('ROUTINE')} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all ${activeTab === 'ROUTINE' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400'}`}>Skincare</button>
               <button onClick={() => setActiveTab('VANITY')} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all ${activeTab === 'VANITY' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400'}`}>Vanity</button>
           </div>
       </div>

       {/* PRODUCT LIST */}
       <div className="px-6 grid grid-cols-2 gap-4">
           {filteredProducts.map((p) => (
               <button key={p.id} onClick={() => setSelectedProduct(p)} className="modern-card rounded-[2rem] p-5 text-left flex flex-col items-start min-h-[160px] bg-white border border-zinc-100">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 mb-4 font-black">🧴</div>
                    <h3 className="font-bold text-xs text-zinc-900 leading-tight mb-1 line-clamp-2">{p.name}</h3>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase mb-auto">{p.brand}</p>
                    <div className="w-full flex justify-between items-center mt-3 pt-3 border-t border-zinc-50">
                        <span className="text-[9px] font-black text-zinc-800">RM {p.estimatedPrice}</span>
                        <span className="text-[9px] font-bold text-teal-600">{p.suitabilityScore}%</span>
                    </div>
               </button>
           ))}
           <button onClick={onScanNew} className="rounded-[2rem] border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-2 min-h-[160px] text-zinc-400 hover:bg-zinc-50 transition-colors">
               <Plus size={20} />
               <span className="text-[9px] font-bold uppercase">Add New</span>
           </button>
       </div>

       {/* PRODUCT DETAIL MODAL */}
       {selectedProduct && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in">
                <div className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[85vh] sm:h-auto overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 relative">
                    <button onClick={() => setSelectedProduct(null)} className="absolute top-6 right-6 p-2 bg-zinc-100 rounded-full text-zinc-500 z-10"><X size={20}/></button>
                    
                    <div className="p-8 pb-4 text-center border-b border-zinc-50">
                        <div className="w-16 h-16 bg-teal-50 rounded-2xl mx-auto flex items-center justify-center text-teal-600 mb-4 font-black text-2xl">🧴</div>
                        <h2 className="text-xl font-black text-zinc-900 mb-1">{selectedProduct.name}</h2>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-4">{selectedProduct.brand}</p>
                        
                        <div className="inline-flex items-center gap-3 bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-100">
                            <span className="text-xs font-black text-zinc-900">RM {selectedProduct.estimatedPrice}</span>
                            <div className="w-px h-3 bg-zinc-200"></div>
                            <span className="text-xs font-black text-teal-600">{selectedProduct.suitabilityScore}% Match</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* VERIFIED SOURCES IN MODAL */}
                        {selectedProduct.sourceUrls && selectedProduct.sourceUrls.length > 0 && (
                            <div>
                                <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Globe size={12} /> Verification Sources
                                </h3>
                                <div className="space-y-2">
                                    {selectedProduct.sourceUrls.map((s, i) => (
                                        <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100 hover:border-teal-200 group">
                                            <span className="text-[11px] font-bold text-zinc-600 truncate mr-2">{s.title}</span>
                                            <ExternalLink size={12} className="text-zinc-300 group-hover:text-teal-500" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Ingredients</h3>
                            <div className="flex flex-wrap gap-2">
                                {selectedProduct.ingredients.map((ing, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-zinc-50 text-zinc-600 text-[9px] font-black rounded-lg uppercase border border-zinc-100">{ing}</span>
                                ))}
                            </div>
                        </div>

                        <button onClick={() => { onRemoveProduct(selectedProduct.id); setSelectedProduct(null); }} className="w-full py-4 rounded-2xl bg-rose-50 text-rose-500 font-bold text-xs uppercase border border-rose-100 hover:bg-rose-100 transition-colors">Remove from Shelf</button>
                    </div>
                </div>
           </div>
       )}
    </div>
  );
};

export default SmartShelf;
