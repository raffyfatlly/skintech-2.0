
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, Image as ImageIcon, ScanFace, BrainCircuit, Target, Lightbulb, CheckCircle2, Focus, X, ArrowRight } from 'lucide-react';
import { analyzeSkinFrame, drawBiometricOverlay, validateFrame, applyClinicalOverlays, calculateRobustAverage, preprocessForAI } from '../services/visionService';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const metricsBuffer = useRef<SkinMetrics[]>([]); 
  const lastFacePos = useRef<{ cx: number, cy: number } | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const circleRef = useRef<SVGCircleElement>(null);
  const lastAnalysisTimeRef = useRef<number>(0);
  const cachedMetricsRef = useRef<SkinMetrics | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false); 
  const [aiProgress, setAiProgress] = useState(0); 
  const [streamError, setStreamError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<string>("Align Face");
  const [statusColor, setStatusColor] = useState<'default'|'warning'|'error'>('default');
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [currentTip, setCurrentTip] = useState<string>("");
  
  const [resultMetrics, setResultMetrics] = useState<SkinMetrics | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        if (!isMounted) { stream.getTracks().forEach(track => track.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => videoRef.current?.play();
        }
      } catch (err) { if (isMounted) setStreamError("Camera access denied."); }
    };
    startCamera();
    return () => { isMounted = false; if (stream) stream.getTracks().forEach(track => track.stop()); };
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning || isProcessingAI) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const now = performance.now();
    const deltaTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    if (ctx && video.readyState === 4) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      
      const check = validateFrame(ctx, canvas.width, canvas.height, lastFacePos.current);
      setInstruction(check.instruction || check.message);
      setStatusColor(check.status === 'ERROR' ? 'error' : check.status === 'WARNING' ? 'warning' : 'default');

      if (check.isGood) {
          progressRef.current = Math.min(100, progressRef.current + (deltaTime / 3000) * 100);
          if (check.facePos) lastFacePos.current = check.facePos;
      }

      // Sample biomarkers every 100ms for robust data collection
      if (now - lastAnalysisTimeRef.current > 100) {
          const metrics = analyzeSkinFrame(ctx, canvas.width, canvas.height);
          cachedMetricsRef.current = metrics;
          lastAnalysisTimeRef.current = now;
          if (check.isGood) {
              metricsBuffer.current.push(metrics);
              if (metricsBuffer.current.length > 40) metricsBuffer.current.shift();
          }
      }
      
      if (cachedMetricsRef.current) drawBiometricOverlay(ctx, canvas.width, canvas.height, cachedMetricsRef.current);

      if (circleRef.current) {
          const circumference = 2 * Math.PI * 130;
          circleRef.current.style.strokeDashoffset = `${circumference - (progressRef.current / 100) * circumference}`;
      }

      if (progressRef.current >= 100) {
           setIsScanning(false);
           setIsProcessingAI(true);
           const processedImage = preprocessForAI(ctx, canvas.width, canvas.height);
           const robustMetrics = calculateRobustAverage(metricsBuffer.current);
           
           applyClinicalOverlays(ctx, canvas.width, canvas.height);
           const displayImage = canvas.toDataURL('image/jpeg', 0.9);
           setCapturedSnapshot(displayImage);

           analyzeFaceSkin(processedImage, robustMetrics, scanHistory).then(aiMetrics => {
               setResultMetrics(aiMetrics);
               setAiProgress(100);
               setTimeout(() => { setIsProcessingAI(false); setShowResult(true); }, 500);
           }).catch(() => {
               setResultMetrics(robustMetrics);
               setIsProcessingAI(false); setShowResult(true);
           });
      }
    }
    if (isScanning && !isProcessingAI) requestAnimationFrame(scanFrame);
  }, [isScanning, isProcessingAI, scanHistory]);

  useEffect(() => {
    if (isScanning) {
      metricsBuffer.current = []; progressRef.current = 0;
      lastTimeRef.current = performance.now();
      requestAnimationFrame(scanFrame);
    }
  }, [isScanning, scanFrame]);

  // Result display logic remains same...
  if (showResult && resultMetrics && capturedSnapshot) {
      return (
        <div className="relative h-screen w-full bg-black font-sans animate-in fade-in">
            <img src={capturedSnapshot} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="Result" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />
            <div className="relative z-10 h-full flex flex-col items-center justify-between py-12 px-6">
                <div className="text-center">
                    <span className="text-xs font-bold text-teal-200 uppercase tracking-[0.3em] mb-4 block">Overall Score</span>
                    <div className="text-[9rem] leading-[0.85] font-black text-white tracking-tighter drop-shadow-2xl">
                        {resultMetrics.overallScore}
                    </div>
                </div>
                <button 
                    onClick={() => onScanComplete(resultMetrics, capturedSnapshot)}
                    className="w-full h-16 bg-white text-teal-950 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-3"
                >
                    View Full Report <ArrowRight size={16} />
                </button>
            </div>
        </div>
      );
  }

  if (isProcessingAI) {
      return (
          <div className="h-screen w-full bg-black flex flex-col items-center justify-center relative overflow-hidden">
             <div className="relative z-10 flex flex-col items-center">
                 <div className="w-24 h-24 bg-teal-500/30 rounded-full animate-ping mb-10" />
                 <h2 className="text-3xl font-black text-white mb-2">Analyzing Biometrics</h2>
                 <p className="text-teal-200 text-xs font-bold tracking-widest uppercase animate-pulse">Stability Guardrails Active</p>
             </div>
          </div>
      )
  }

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden font-sans">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none z-10 bg-black/40" style={{ maskImage: 'radial-gradient(ellipse at 50% 45%, transparent 38%, black 40%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, transparent 38%, black 40%)' }} />
      <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 pt-12">
          <div className="flex justify-between items-start">
             <div className="bg-white/10 backdrop-blur-md rounded-full px-4 py-2 border border-white/10 text-white text-xs font-bold uppercase tracking-widest">Skin OS AI</div>
             {onCancel && <button onClick={onCancel} className="w-10 h-10 rounded-full bg-black/20 text-white border border-white/10 flex items-center justify-center"><X size={20}/></button>}
          </div>
          {isScanning && (
              <div className="absolute top-28 left-1/2 -translate-x-1/2 backdrop-blur-xl rounded-full px-6 py-3 border border-white/20 text-white text-sm font-bold uppercase tracking-wide">
                  {instruction}
              </div>
          )}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <svg className="w-[300px] h-[300px]" style={{ transform: 'rotate(-90deg)' }}>
                   <circle cx="150" cy="150" r="130" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" />
                   <circle ref={circleRef} cx="150" cy="150" r="130" stroke="#10B981" strokeWidth="6" fill="transparent" strokeDasharray={2 * Math.PI * 130} strokeDashoffset={2 * Math.PI * 130} strokeLinecap="round" className="transition-all duration-300" />
                </svg>
          </div>
          <div className="flex flex-col items-center gap-6 pb-12">
              {!isScanning ? (
                  <button onClick={() => setIsScanning(true)} className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-white/30 shadow-2xl active:scale-95 transition-all">
                      <div className="w-16 h-16 border-2 border-zinc-200 rounded-full" />
                  </button>
              ) : (
                  <button onClick={() => setIsScanning(false)} className="px-8 py-3 bg-white/10 backdrop-blur text-white rounded-full font-bold text-xs uppercase tracking-widest">Cancel</button>
              )}
          </div>
      </div>
    </div>
  );
};

export default FaceScanner;
