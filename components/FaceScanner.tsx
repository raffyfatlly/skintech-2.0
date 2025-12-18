
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, ArrowRight, ShieldCheck, Sparkles, Target, Scan } from 'lucide-react';
import { analyzeSkinFrame, validateFrame, calculateRobustAverage, preprocessForAI, FaceBounds } from '../services/visionService';
import { analyzeFaceSkin } from '../services/geminiService';
import { SkinMetrics } from '../types';

interface FaceScannerProps {
  onScanComplete: (metrics: SkinMetrics, image: string) => void;
  scanHistory?: SkinMetrics[];
  onCancel?: () => void;
}

const FaceScanner: React.FC<FaceScannerProps> = ({ onScanComplete, scanHistory, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metricsBuffer = useRef<{ metrics: SkinMetrics, confidence: number }[]>([]); 
  const smoothedBounds = useRef<FaceBounds | null>(null);
  
  const [progress, setProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false); 
  const [instruction, setInstruction] = useState<string>("Initializing...");
  const [faceBounds, setFaceBounds] = useState<FaceBounds | null>(null);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [resultMetrics, setResultMetrics] = useState<SkinMetrics | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  // Robust Camera Lifecycle
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        if (videoRef.current && isActive) {
          videoRef.current.srcObject = stream;
          videoRef.current.oncanplay = () => {
            if (videoRef.current) {
              videoRef.current.play().catch(e => console.error("Play error", e));
              setCameraReady(true);
              setInstruction("Position Face");
            }
          };
        }
      } catch (err) {
        if (isActive) setInstruction("Camera Access Required");
      }
    };

    startCamera();
    return () => {
      isActive = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;
    
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const vWidth = videoRef.current.videoWidth;
    const vHeight = videoRef.current.videoHeight;

    if (vWidth === 0) {
        requestAnimationFrame(scanFrame);
        return;
    }

    if (canvasRef.current.width !== vWidth) {
      canvasRef.current.width = vWidth;
      canvasRef.current.height = vHeight;
    }
    
    // Internal mirrored analysis
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, -vWidth, 0);
    ctx.restore();
    
    const check = validateFrame(ctx, vWidth, vHeight);
    
    // Apply Low-Pass Filter (LPF) for smooth coordinate tracking
    if (check.faceBounds.faceWidth > 0) {
        if (!smoothedBounds.current) {
            smoothedBounds.current = check.faceBounds;
        } else {
            const ease = 0.2; // Smooth factor
            smoothedBounds.current = {
                cx: smoothedBounds.current.cx + (check.faceBounds.cx - smoothedBounds.current.cx) * ease,
                cy: smoothedBounds.current.cy + (check.faceBounds.cy - smoothedBounds.current.cy) * ease,
                faceWidth: smoothedBounds.current.faceWidth + (check.faceBounds.faceWidth - smoothedBounds.current.faceWidth) * ease,
                faceHeight: smoothedBounds.current.faceHeight + (check.faceBounds.faceHeight - smoothedBounds.current.faceHeight) * ease,
            };
        }
        setFaceBounds(smoothedBounds.current);
    } else {
        setFaceBounds(null);
    }

    if (isScanning) {
        setInstruction(check.instruction);
        if (check.isGood) {
            const nextProgress = Math.min(100, progress + 3.5);
            setProgress(nextProgress);
            
            const metrics = analyzeSkinFrame(ctx, vWidth, vHeight, check.faceBounds);
            metricsBuffer.current.push({ metrics, confidence: 1 });

            if (nextProgress >= 100) {
                finishScan(ctx, calculateRobustAverage(metricsBuffer.current));
                return;
            }
        } else {
            setProgress(p => Math.max(0, p - 0.4));
        }
    }

    requestAnimationFrame(scanFrame);
  }, [isScanning, cameraReady, progress]);

  const finishScan = (ctx: CanvasRenderingContext2D, metrics: SkinMetrics) => {
      setIsScanning(false);
      setIsProcessingAI(true);
      const snapshot = preprocessForAI(ctx, canvasRef.current.width, canvasRef.current.height);
      setCapturedSnapshot(snapshot);

      analyzeFaceSkin(snapshot, metrics, scanHistory).then(res => {
          setResultMetrics(res);
          setIsProcessingAI(false);
          setShowResult(true);
          
          let startTime = performance.now();
          const animate = (time: number) => {
              const elapsed = time - startTime;
              const p = Math.min(elapsed / 1200, 1);
              setAnimatedScore(Math.round(res.overallScore * p));
              if (p < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
      });
  };

  useEffect(() => { 
    if (cameraReady) requestAnimationFrame(scanFrame); 
  }, [cameraReady, scanFrame]);

  if (showResult && resultMetrics && capturedSnapshot) {
    return (
      <div className="h-screen w-full bg-black relative flex flex-col items-center justify-between py-16 px-8 animate-in fade-in duration-500 overflow-hidden">
          <img src={capturedSnapshot} className="absolute inset-0 w-full h-full object-cover opacity-60 grayscale-[0.2]" alt="Result" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black" />
          
          <div className="relative text-center mt-12 z-10">
              <span className="text-teal-400 text-[10px] font-black uppercase tracking-[0.5em] mb-4 block">Resolution Finalized</span>
              <div className="text-[10rem] font-black text-white tracking-tighter leading-none">{animatedScore}</div>
              <div className="flex items-center justify-center gap-2 text-white/40 font-bold uppercase tracking-widest text-[9px] mt-4">
                  <ShieldCheck size={12} className="text-teal-500" /> Data Capture Successful
              </div>
          </div>

          <div className="w-full space-y-4 relative z-10">
              <div className="bg-white/10 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 text-center">
                  <p className="text-white/90 text-sm font-medium leading-relaxed italic">
                      "Skin analysis complete. Findings ready for review."
                  </p>
              </div>
              <button 
                  onClick={() => onScanComplete(resultMetrics, capturedSnapshot)} 
                  className="w-full h-20 bg-white text-zinc-950 rounded-[2.5rem] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                  Review Report <ArrowRight size={20} />
              </button>
          </div>
      </div>
    );
  }

  // Infinite HUD Mapping (No Clipping)
  const getHudStyle = () => {
    if (!faceBounds || !canvasRef.current) return { display: 'none' };
    const vWidth = window.innerWidth;
    const vHeight = window.innerHeight;
    const cWidth = canvasRef.current.width;
    const cHeight = canvasRef.current.height;

    // Direct mapping to screen center point of the face
    const displayX = (faceBounds.cx / cWidth) * vWidth;
    const displayY = (faceBounds.cy / cHeight) * vHeight;
    const displayW = (faceBounds.faceWidth / cWidth) * vWidth;

    return {
        left: displayX,
        top: displayY,
        width: displayW * 1.6, 
        height: displayW * 1.6,
        transform: 'translate(-50%, -50%)',
        display: 'block'
    };
  };

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex items-center justify-center">
      {/* Video - Scale mirrors the image */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10 transition-opacity duration-1000 ${cameraReady ? 'opacity-100' : 'opacity-0'}`} 
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* HUD Tracker Layer - z-20 */}
      <div className="absolute inset-0 z-20 pointer-events-none">
          
          {/* DYNAMIC FACE HUD */}
          {faceBounds && (
              <div className="absolute transition-all duration-75" style={getHudStyle()}>
                  <div className="relative w-full h-full flex items-center justify-center">
                      {/* Tracking Frame */}
                      <div className={`absolute inset-0 border-2 rounded-[25%] transition-all duration-300 ${isScanning ? 'border-teal-400 scale-100 opacity-60' : 'border-white/20 scale-90 opacity-40'}`}>
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-inherit rounded-tl-xl" />
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-inherit rounded-tr-xl" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-inherit rounded-bl-xl" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-inherit rounded-br-xl" />
                      </div>
                      
                      {/* Circular Scan Progress */}
                      <svg className="absolute w-full h-full -rotate-90">
                          <circle cx="50%" cy="50%" r="40%" stroke="white" strokeWidth="1" fill="none" opacity="0.1" />
                          <circle 
                            cx="50%" cy="50%" r="40%" 
                            stroke="#10B981" strokeWidth="4" 
                            fill="none" 
                            strokeDasharray="251%" 
                            strokeDashoffset={`${251 - (progress * 2.51)}%`} 
                            strokeLinecap="round" 
                            className="transition-all duration-300" 
                          />
                      </svg>

                      {isScanning && (
                        <div className="flex flex-col items-center gap-1 animate-pulse">
                            <span className="text-teal-400 text-[10px] font-black uppercase tracking-widest">Scanning</span>
                            <div className="text-[12px] font-black text-white">{Math.round(progress)}%</div>
                        </div>
                      )}
                  </div>
              </div>
          )}

          {/* STATIC OVERLAYS */}
          <div className="absolute inset-0 flex flex-col justify-between p-8 pt-16">
              <div className="flex justify-between items-start">
                 <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-white/80 text-[10px] font-black uppercase tracking-[0.2em] border border-white/10">
                     SkinOS • RESOLVE
                 </div>
                 {onCancel && <button onClick={onCancel} className="p-2 bg-black/40 rounded-full text-white border border-white/10 pointer-events-auto"><X size={20}/></button>}
              </div>

              <div className="flex flex-col items-center pb-12 gap-6 relative z-30">
                  <div className={`px-8 py-3 rounded-full font-black uppercase tracking-widest text-[10px] transition-all duration-300 shadow-xl ${faceBounds ? 'bg-teal-500 text-white' : 'bg-black/80 text-white/50 border border-white/10'}`}>
                      {isProcessingAI ? "Resolving Condition Matrix..." : instruction}
                  </div>

                  {!isScanning && !isProcessingAI ? (
                      <button 
                          onClick={() => { setIsScanning(true); setProgress(0); }} 
                          disabled={!cameraReady || !faceBounds}
                          className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all disabled:opacity-30 pointer-events-auto group"
                      >
                          <div className={`w-14 h-14 rounded-full border-2 border-zinc-100 flex items-center justify-center transition-all ${faceBounds ? 'scale-110' : 'scale-100'}`}>
                              <Target size={28} className={faceBounds ? "text-teal-600 animate-pulse" : "text-zinc-400"} />
                          </div>
                      </button>
                  ) : isScanning ? (
                      <button onClick={() => { setIsScanning(false); setProgress(0); }} className="px-8 py-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-full text-white text-[10px] font-black uppercase tracking-widest pointer-events-auto">Stop Scan</button>
                  ) : (
                    <div className="animate-pulse flex flex-col items-center">
                        <Sparkles className="text-teal-400 mb-2" size={32} />
                        <span className="text-white text-[10px] font-black uppercase tracking-widest">Building Report</span>
                    </div>
                  )}
              </div>
          </div>
      </div>
      
      {!cameraReady && <div className="absolute inset-0 bg-black z-0 flex items-center justify-center">
          <div className="text-white/20 flex flex-col items-center gap-4">
              <Scan size={48} className="animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Initializing...</span>
          </div>
      </div>}
    </div>
  );
};

export default FaceScanner;
