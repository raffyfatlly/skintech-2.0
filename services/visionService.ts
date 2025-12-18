
import { SkinMetrics } from '../types';

export interface FaceBounds {
    cx: number;
    cy: number;
    faceWidth: number;
    faceHeight: number;
}

/**
 * Robust Face Detection using Pixel-Density Analysis
 */
export const detectFaceBounds = (ctx: CanvasRenderingContext2D, width: number, height: number): FaceBounds => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let sumX = 0, sumY = 0, count = 0;
    const step = 30; 
    
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            
            const isSkin = r > 95 && g > 40 && b > 20 && 
                          r > g && r > b && 
                          (Math.max(r,g,b) - Math.min(r,g,b) > 15) && 
                          Math.abs(r - g) > 15;

            if (isSkin) {
                sumX += x; sumY += y; count++;
            }
        }
    }
    
    if (count < 15) return { cx: width/2, cy: height/2, faceWidth: 0, faceHeight: 0 }; 
    
    const cx = sumX / count, cy = sumY / count;
    const faceWidth = Math.sqrt(count * step * step) * 1.1; 
    return { cx, cy, faceWidth, faceHeight: faceWidth * 1.35 };
};

export const validateFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { isGood: boolean; confidence: number; instruction: string; faceBounds: FaceBounds } => {
  const bounds = detectFaceBounds(ctx, width, height);
  const { faceWidth } = bounds;
  
  const isDetected = faceWidth > width * 0.2 && faceWidth < width * 0.9;

  return {
      isGood: isDetected,
      confidence: isDetected ? 1 : 0,
      instruction: isDetected ? "Scanning Tissue..." : "Align Face in Center",
      faceBounds: bounds
  };
};

export const analyzeSkinFrame = (ctx: CanvasRenderingContext2D, width: number, height: number, bounds: FaceBounds): SkinMetrics => {
  const { cx, cy, faceWidth } = bounds;
  const roiSize = Math.floor(faceWidth * 0.25);
  const skinSample = ctx.getImageData(
      Math.max(0, Math.min(width - roiSize, cx - roiSize/2)), 
      Math.max(0, Math.min(height - roiSize, cy - roiSize/2)), 
      roiSize, roiSize
  );
  
  let markers = 0;
  const step = 4; 
  for (let i = 0; i < skinSample.data.length; i += step * 4) {
      const r = skinSample.data[i], g = skinSample.data[i+1], b = skinSample.data[i+2];
      // Nuanced detection: looking for high-intensity contrast which indicates texture/redness
      if (r > 175 && r > g * 1.3) markers++;
  }

  const density = markers / (skinSample.data.length / (step * 4));
  // Calibrated scoreBase: More forgiving (Starts at 55 instead of 40)
  const scoreBase = Math.max(55, 96 - (density * 380));
  const normalize = (v: number) => Math.max(50, Math.min(99, Math.round(v)));

  return {
      overallScore: normalize(scoreBase),
      acneActive: normalize(scoreBase),
      acneScars: normalize(scoreBase - 3),
      poreSize: normalize(scoreBase - 2),
      blackheads: normalize(scoreBase - 1),
      wrinkleFine: 92,
      wrinkleDeep: 88,
      sagging: 90,
      pigmentation: normalize(scoreBase),
      redness: normalize(scoreBase - 2),
      texture: normalize(scoreBase),
      hydration: 82, // Default realistic starting point
      oiliness: 75,
      darkCircles: 80,
      timestamp: Date.now()
  };
};

export const calculateRobustAverage = (buffer: { metrics: SkinMetrics, confidence: number }[]): SkinMetrics => {
    if (buffer.length === 0) return {} as SkinMetrics;
    const keys = ['overallScore', 'acneActive', 'hydration', 'redness', 'texture'] as (keyof SkinMetrics)[];
    const result: any = { ...buffer[0].metrics, timestamp: Date.now() };
    
    keys.forEach(key => {
        const sum = buffer.reduce((acc, b) => acc + (b.metrics[key] as number), 0);
        result[key] = Math.round(sum / buffer.length);
    });
    return result as SkinMetrics;
};

export const preprocessForAI = (ctx: CanvasRenderingContext2D, width: number, height: number): string => {
    return ctx.canvas.toDataURL('image/jpeg', 0.85);
};
