
import { SkinMetrics } from '../types';

/**
 * Robust Statistical Averaging
 * Discards outliers (top/bottom 20%) to prevent jitter from sensor noise.
 */
export const calculateRobustAverage = (buffer: SkinMetrics[]): SkinMetrics => {
    if (buffer.length === 0) return {} as SkinMetrics;
    if (buffer.length < 5) return buffer[buffer.length - 1];

    const keys = [
        'overallScore', 'acneActive', 'acneScars', 'poreSize', 'blackheads',
        'wrinkleFine', 'wrinkleDeep', 'sagging', 'pigmentation', 'redness',
        'texture', 'hydration', 'oiliness', 'darkCircles'
    ] as (keyof SkinMetrics)[];

    const averaged: any = { timestamp: Date.now() };

    keys.forEach(key => {
        const values = buffer.map(m => m[key] as number).sort((a, b) => a - b);
        // Discard 20% from both ends
        const trimCount = Math.floor(values.length * 0.2);
        const trimmedValues = values.slice(trimCount, values.length - trimCount);
        
        const sum = trimmedValues.reduce((a, b) => a + b, 0);
        averaged[key] = Math.round(sum / trimmedValues.length);
    });

    return averaged as SkinMetrics;
};

/**
 * Checks video frame quality before analysis.
 */
export const validateFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lastFacePos?: { cx: number, cy: number }
): { isGood: boolean; message: string; facePos?: { cx: number, cy: number }; instruction?: string; status: 'OK' | 'WARNING' | 'ERROR' } => {
  const { cx, cy, faceWidth } = detectFaceBounds(ctx, width, height);
  
  let status: 'OK' | 'WARNING' | 'ERROR' = 'OK';
  let message = "Perfect";
  let instruction = "Hold steady...";

  if (faceWidth < width * 0.15) {
       return { isGood: false, message: "No Face", instruction: "Position face in circle", status: 'ERROR' };
  }

  if (faceWidth < width * 0.25) {
      status = 'WARNING';
      message = "Move Closer";
      instruction = "Move Closer";
  } else if (faceWidth > width * 0.85) {
      status = 'WARNING';
      message = "Too Close";
      instruction = "Back up slightly";
  }

  const p = ctx.getImageData(Math.floor(cx), Math.floor(cy), 1, 1).data;
  const luma = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

  if (luma < 40) {
      status = 'WARNING';
      message = "Low Light";
      instruction = "Face light source";
  } else if (luma > 230) {
      status = 'WARNING';
      message = "Too Bright";
      instruction = "Reduce glare";
  }

  if (lastFacePos) {
      const dist = Math.sqrt(Math.pow(cx - lastFacePos.cx, 2) + Math.pow(cy - lastFacePos.cy, 2));
      if (dist > width * 0.1) { 
          status = 'WARNING';
          message = "Hold Still";
          instruction = "Hold Still";
      }
  }

  return { isGood: true, message, facePos: { cx, cy }, instruction, status };
};

const normalizeScore = (raw: number): number => {
    return Math.round(Math.max(10, Math.min(99, raw)));
};

// --- ALGORITHMS ---

const rgbToLab = (r: number, g: number, b: number) => {
    let r1 = r / 255, g1 = g / 255, b1 = b / 255;
    r1 = (r1 > 0.04045) ? Math.pow((r1 + 0.055) / 1.055, 2.4) : r1 / 12.92;
    g1 = (g1 > 0.04045) ? Math.pow((g1 + 0.055) / 1.055, 2.4) : g1 / 12.92;
    b1 = (b1 > 0.04045) ? Math.pow((b1 + 0.055) / 1.055, 2.4) : b1 / 12.92;
    const x = (r1 * 0.4124 + g1 * 0.3576 + b1 * 0.1805) / 0.95047;
    const y = (r1 * 0.2126 + g1 * 0.7152 + b1 * 0.0722) / 1.00000;
    const z = (r1 * 0.0193 + g1 * 0.1192 + b1 * 0.9505) / 1.08883;
    const fx = (x > 0.008856) ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    const fy = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    const fz = (z > 0.008856) ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
    return { L: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
};

function calculateAcneScore(img: ImageData): number {
    let acnePixels = 0;
    const data = img.data;
    let sumA = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
        const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
        sumA += a;
        count++;
    }
    const avgA = count > 0 ? sumA / count : 128;
    const rednessThreshold = avgA + 18; 
    for (let i = 0; i < data.length; i += 4) {
        const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
        if (a > rednessThreshold) acnePixels++;
    }
    const density = acnePixels / (img.width * img.height);
    return Math.max(10, 100 - (density * 1000));
}

function calculateRednessScore(img: ImageData): number {
    const data = img.data;
    let sumA = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
        const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
        sumA += a;
        count++;
    }
    const avgA = count > 0 ? sumA / count : 15;
    if (avgA <= 18) return 95;
    const penalty = (avgA - 18) * 3.0;
    return Math.max(20, 100 - penalty);
}

function calculateTextureScore(img: ImageData): number {
    const w = img.width;
    const h = img.height;
    const data = img.data;
    let varianceSum = 0;
    let pixels = 0;
    for (let y = 1; y < h - 1; y += 2) {
        for (let x = 1; x < w - 1; x += 2) {
            const i = (y * w + x) * 4;
            const c = (data[i] + data[i+1] + data[i+2]) / 3;
            const up = (data[((y-1)*w+x)*4] + data[((y-1)*w+x)*4+1] + data[((y-1)*w+x)*4+2])/3;
            const down = (data[((y+1)*w+x)*4] + data[((y+1)*w+x)*4+1] + data[((y+1)*w+x)*4+2])/3;
            const left = (data[((y)*w+(x-1))*4] + data[((y)*w+(x-1))*4+1] + data[((y)*w+(x-1))*4+2])/3;
            const right = (data[((y)*w+(x+1))*4] + data[((y)*w+(x+1))*4+1] + data[((y)*w+(x+1))*4+2])/3;
            const laplacian = Math.abs(up + down + left + right - (4 * c));
            if (laplacian > 5 && laplacian < 80) varianceSum += laplacian;
            pixels++;
        }
    }
    const avgRoughness = pixels > 0 ? varianceSum / pixels : 0;
    const score = 100 - ((avgRoughness - 2.5) * 10);
    return Math.max(10, Math.min(99, score));
}

function calculateWrinkleScore(img: ImageData): number {
    const w = img.width, h = img.height, data = img.data;
    let edgePixels = 0;
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const getL = (ox: number, oy: number) => {
                const i = ((y + oy) * w + (x + ox)) * 4;
                return 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
            }
            const tl = getL(-1, -1), t = getL(0, -1), tr = getL(1, -1);
            const bl = getL(-1, 1), b = getL(0, 1), br = getL(1, 1);
            const sobelY = (bl + 2*b + br) - (tl + 2*t + tr);
            if (Math.abs(sobelY) > 60) edgePixels++;
        }
    }
    return Math.max(20, 100 - ((edgePixels / (w * h)) * 300));
}

function calculateHydrationScore(img: ImageData): number {
    let glowPixels = 0;
    const total = img.data.length / 4;
    for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
        const l = 0.299*r + 0.587*g + 0.114*b;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        if (l > 160 && l < 245 && sat < 0.4 && sat > 0.05) glowPixels++;
    }
    const deviation = Math.abs((glowPixels / total) - 0.12); 
    return Math.max(20, 100 - (deviation * 200));
}

function calculateDarkCircleScore(eyeImg: ImageData, cheekImg: ImageData): number {
    const getAvgLuma = (d: ImageData) => {
        let s = 0;
        for(let i=0; i<d.data.length; i+=4) s += (0.299*d.data[i] + 0.587*d.data[i+1] + 0.114*d.data[i+2]);
        return s / (d.data.length/4);
    }
    const diff = Math.max(0, getAvgLuma(cheekImg) - getAvgLuma(eyeImg));
    return Math.max(30, 100 - (diff * 2.0));
}

export const preprocessForAI = (ctx: CanvasRenderingContext2D, width: number, height: number): string => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let sumLuma = 0;
    for (let i = 0; i < data.length; i += 16) sumLuma += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const exposureBias = 128 - (sumLuma / (data.length / 16)); 
    const contrast = 1.15, intercept = 128 * (1 - contrast);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, (data[i] + exposureBias) * contrast + intercept));
        data[i+1] = Math.max(0, Math.min(255, (data[i+1] + exposureBias) * contrast + intercept));
        data[i+2] = Math.max(0, Math.min(255, (data[i+2] + exposureBias) * contrast + intercept));
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width; tempCanvas.height = height;
    tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0);
    return tempCanvas.toDataURL('image/jpeg', 0.98); 
};

export const applyClinicalOverlays = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const { cx, cy, faceWidth, faceHeight } = detectFaceBounds(ctx, width, height);
    if (faceWidth === 0) return;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    ctx.lineWidth = 1; 
    for (let y = Math.floor(cy - faceHeight * 0.45); y < cy + faceHeight * 0.5; y += 8) {
        for (let x = Math.floor(cx - faceWidth * 0.45); x < cx + faceWidth * 0.45; x += 8) {
            const i = (y * width + x) * 4;
            const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
            if (a > 20) {
                 ctx.fillStyle = 'rgba(255, 50, 50, 0.4)';
                 ctx.fillRect(x, y, 2, 2);
            }
        }
    }
};

const detectFaceBounds = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let sumX = 0, sumY = 0, count = 0;
    const step = 20; 
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            if (data[i] > 40 && data[i+1] > 20 && data[i+2] > 10 && data[i] > data[i+1]) {
                sumX += x; sumY += y; count++;
            }
        }
    }
    if (count < 50) return { cx: width/2, cy: height/2, faceWidth: 0, faceHeight: 0 }; 
    const cx = sumX / count, cy = sumY / count;
    const faceWidth = Math.sqrt(count * step * step) * 1.5; 
    return { cx, cy, faceWidth, faceHeight: faceWidth * 1.35 };
};

const getNormalizedROI = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    x = Math.max(0, x); y = Math.max(0, y);
    return ctx.getImageData(x, y, Math.min(w, ctx.canvas.width - x), Math.min(h, ctx.canvas.height - y));
};

export const drawBiometricOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, metrics: SkinMetrics) => {
    const { cx, cy, faceWidth, faceHeight } = detectFaceBounds(ctx, width, height);
    if (faceWidth === 0) return;
    const drawROI = (x: number, y: number, r: number, score: number, label: string) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
        const color = score > 80 ? '#10B981' : score < 60 ? '#F43F5E' : '#F59E0B';
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = color; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.fillStyle = 'white'; ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${label}: ${Math.round(score)}`, x - r, y - r - 5);
    };
    const r = faceWidth * 0.12;
    drawROI(cx, cy - faceHeight * 0.35, r, metrics.wrinkleFine, "Wrinkles");
    drawROI(cx - faceWidth * 0.2, cy + faceHeight * 0.05, r, metrics.acneActive, "Acne");
    drawROI(cx + faceWidth * 0.2, cy + faceHeight * 0.05, r, metrics.redness, "Tone");
    drawROI(cx, cy + faceHeight * 0.1, r * 0.8, metrics.poreSize, "Pores");
    drawROI(cx - faceWidth * 0.15, cy - faceHeight * 0.1, r * 0.8, metrics.darkCircles, "Eyes");
};

export const analyzeSkinFrame = (ctx: CanvasRenderingContext2D, width: number, height: number): SkinMetrics => {
  const { cx, cy, faceWidth, faceHeight } = detectFaceBounds(ctx, width, height);
  const r = Math.floor(faceWidth * 0.25); 
  const fData = getNormalizedROI(ctx, cx - r, cy - faceHeight * 0.35, r*2, r*0.6);
  const lCData = getNormalizedROI(ctx, cx - faceWidth * 0.28, cy + faceHeight * 0.05, r, r);
  const rCData = getNormalizedROI(ctx, cx + faceWidth * 0.08, cy + faceHeight * 0.05, r, r);
  const eData = getNormalizedROI(ctx, cx - r, cy - faceHeight * 0.12, r * 2, r * 0.4);
  const nData = getNormalizedROI(ctx, cx - r/2, cy + faceHeight * 0.1, r, r * 0.5);
  const a = calculateAcneScore(lCData), red = (calculateRednessScore(lCData) + calculateRednessScore(nData)) / 2;
  const t = calculateTextureScore(rCData), w = calculateWrinkleScore(fData);
  const h = calculateHydrationScore(rCData), d = calculateDarkCircleScore(eData, lCData);
  const p = calculateTextureScore(nData), o = (calculateHydrationScore(fData) + calculateHydrationScore(nData)) / 2;
  const overall = (a * 0.25 + red * 0.15 + t * 0.20 + w * 0.15 + h * 0.15 + d * 0.10);
  return {
      overallScore: normalizeScore(overall), acneActive: normalizeScore(a), acneScars: normalizeScore(a + 10),
      poreSize: normalizeScore(p), blackheads: normalizeScore(p + 5), wrinkleFine: normalizeScore(w),
      wrinkleDeep: normalizeScore(Math.max(10, w - 10)), sagging: 85, pigmentation: normalizeScore(t + 5),
      redness: normalizeScore(red), texture: normalizeScore(t), hydration: normalizeScore(h),
      oiliness: normalizeScore(o), darkCircles: normalizeScore(d), timestamp: Date.now()
  };
};
