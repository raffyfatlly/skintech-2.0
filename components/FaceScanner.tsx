
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, ArrowRight, ScanFace } from 'lucide-react';
import { analyzeSkinFrame, drawBiometricOverlay, validateFrame, calculateRobustAverage, preprocessForAI } from '../services/visionService';
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
  const progressRef = useRef<number>(0);
  const circleRef = useRef<SVGCircleElement>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false); 
  const [instruction, setInstruction] = useState<string>("Align Face");
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [resultMetrics, setResultMetrics] = useState<SkinMetrics | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(s => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
    });
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    
    const check = validateFrame(ctx, canvasRef.current.width, canvasRef.current.height);
    setInstruction(check.instruction || check.message);

    if (check.isGood) {
        progressRef.current = Math.min(100, progressRef.current + 1.5);
        const metrics = analyzeSkinFrame(ctx, canvasRef.current.width, canvasRef.current.height);
        metricsBuffer.current.push({ metrics, confidence: check.confidence });
        drawBiometricOverlay(ctx, canvasRef.current.width, canvasRef.current.height, metrics);
    }

    if (circleRef.current) {
        const circ = 2 * Math.PI * 130;
        circleRef.current.style.strokeDashoffset = `${circ - (progressRef.current / 100) * circ}`;
    }

    if (progressRef.current >= 100) {
        setIsScanning(false);
        setIsProcessingAI(true);
        const robustMetrics = calculateRobustAverage(metricsBuffer.current);
        const snapshot = preprocessForAI(ctx, canvasRef.current.width, canvasRef.current.height);
        setCapturedSnapshot(snapshot);

        analyzeFaceSkin(snapshot, robustMetrics, scanHistory).then(res => {
            setResultMetrics(res);
            setIsProcessingAI(false);
            setShowResult(true);
        });
    } else {
        requestAnimationFrame(scanFrame);
    }
  }, [isScanning, scanHistory]);

  useEffect(() => { if (isScanning) requestAnimationFrame(scanFrame); }, [isScanning, scanFrame]);

  if (showResult && resultMetrics && capturedSnapshot) {
    return (
      <div className="h-screen w-full bg-black relative flex flex-col items-center justify-between py-16 px-8">
          <img src={capturedSnapshot} className="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="relative text-center">
              <span className="text-teal-400 text-xs font-bold uppercase tracking-widest">Truth Score</span>
              <h1 className="text-9xl font-black text-white tracking-tighter">{resultMetrics.overallScore}</h1>
          </div>
          <button onClick={() => onScanComplete(resultMetrics, capturedSnapshot)} className="w-full h-16 bg-white rounded-3xl font-black uppercase flex items-center justify-center gap-2">View Report <ArrowRight /></button>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none" />
      <div className="absolute inset-0 flex flex-col justify-between p-8 pt-16">
          <div className="flex justify-between items-start">
             <div className="bg-white/10 px-4 py-2 rounded-full text-white text-[10px] font-bold uppercase tracking-widest">Skin Integrity OS</div>
             {onCancel && <button onClick={onCancel} className="p-2 bg-white/10 rounded-full text-white"><X size={20}/></button>}
          </div>
          <div className="text-center text-white font-bold uppercase tracking-widest text-sm">{isProcessingAI ? "Confirming Findings..." : instruction}</div>
          <div className="flex justify-center">
            <svg className="w-64 h-64 -rotate-90">
                <circle cx="128" cy="128" r="120" stroke="white" strokeWidth="2" fill="transparent" opacity="0.1" />
                <circle ref={circleRef} cx="128" cy="128" r="120" stroke="#10B981" strokeWidth="6" fill="transparent" strokeDasharray={2*Math.PI*120} strokeDashoffset={2*Math.PI*120} className="transition-all" />
            </svg>
          </div>
          <div className="flex justify-center">
            {!isScanning && !isProcessingAI && <button onClick={() => setIsScanning(true)} className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-8 border-white/20"><ScanFace /></button>}
          </div>
      </div>
    </div>
  );
};

export default FaceScanner;
