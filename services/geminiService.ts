
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- MODULAR PROMPT ENGINE ---

const PROMPTS = {
    SKIN_DIAGNOSTIC: (metrics: SkinMetrics, history?: SkinMetrics[]) => {
        const latestHistory = history && history.length > 0 ? history[history.length - 1] : null;
        const lastScanTime = latestHistory ? latestHistory.timestamp : 0;
        const timeDiffHours = (Date.now() - lastScanTime) / (1000 * 60 * 60);
        
        // CONSISTENCY LOGIC: If scanned within 2 hours, enforce 70% stability.
        const isRapidRescan = timeDiffHours < 2;

        return `
        TASK: Elite Clinical Skin Diagnostic. 
        INPUT METRICS (Deterministic Base): ${JSON.stringify(metrics)}.
        ${latestHistory ? `PREVIOUS SCAN (Anchor): ${JSON.stringify(latestHistory)}.` : ''}
        
        CONSISTENCY GUARDRAILS (MANDATORY):
        1. TEMPORAL ANCHORING: ${isRapidRescan ? "User rescanned within 2 hours. Lighting/Setup may vary slightly. Heavily anchor scores to the Previous Scan unless a massive change is undeniable." : "Standard analysis. Refer to history for progress trends."}
        2. DELTA LIMIT: Do NOT change individual biomarker scores by more than +/- 5 points from the Deterministic Base unless you detect a specific visual anomaly (e.g. "active flare up", "extreme glare").
        3. COHESION: Redness and AcneActive are linked. If one is stable, the other should likely remain stable.
        4. HIGHER = HEALTHIER (100 is Perfect).
        
        NARRATIVE: 5-6 sentences with **highlights**.
        
        RETURN JSON:
        {
            "overallScore": number, "skinAge": number, "acneActive": number, "acneScars": number,
            "redness": number, "hydration": number, "texture": number, "wrinkleFine": number, "pigmentation": number,
            "analysisSummary": "text with **highlights**",
            "observations": { "metricKey": "location detail" }
        }
    `},

    PRODUCT_AUDIT_CORE: (userMetrics: SkinMetrics) => `
        USER CONTEXT: ${JSON.stringify(userMetrics)}.
        MANDATORY SEARCH STEPS:
        1. USE GOOGLE SEARCH to find the official INCI list, specifically from INCIDecoder.com.
        2. FIND THE MALAYSIAN PRICE (RM/MYR) from local retailers (Watsons MY, Guardian MY, Sephora MY).
        INSTRUCTIONS:
        - Return ONLY a valid JSON object matching the standard schema.
    `
};

const parseJSON = (text: string) => {
    if (!text) return null;
    try {
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = cleaned.indexOf('{'), lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        return JSON.parse(cleaned);
    } catch (e) {
        return null;
    }
};

const runAI = async <T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> => {
    try { return await fn(ai); } catch (err: any) {
        if (err?.status === 429) { await new Promise(r => setTimeout(r, 2000)); return await fn(ai); }
        throw err;
    }
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
                    { text: PROMPTS.SKIN_DIAGNOSTIC(localMetrics, history) }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        const data = parseJSON(response.text || "{}");
        // Ensure final metrics reflect the AI's consistency recalibration
        return { ...localMetrics, ...data, timestamp: Date.now() };
    });
};

export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics): Promise<Product> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: `IDENTIFY THIS PRODUCT. ${PROMPTS.PRODUCT_AUDIT_CORE(userMetrics)}` }
                ]
            },
            config: { tools: [{ googleSearch: {} }] }
        });
        const data = parseJSON(response.text || "{}");
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceUrls = grounding?.map((c: any) => ({ title: c.web?.title || "Verification Link", uri: c.web?.uri })).filter((s: any) => s.uri) || [];
        return {
            id: Date.now().toString(), name: data.name || "Unknown", brand: data.brand || "Unknown",
            ingredients: data.ingredients || [], estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50, risks: data.risks || [], benefits: data.benefits || [],
            pros: data.pros || [], cons: data.cons || [], scientificVerdict: data.scientificVerdict || "",
            usageAdvice: data.usageAdvice || "", sourceUrls, dateScanned: Date.now(), type: data.type || "UNKNOWN"
        };
    });
};

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string): Promise<Product> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: `PRODUCT AUDIT: ${productName} by ${knownBrand || 'Unknown'}. ${PROMPTS.PRODUCT_AUDIT_CORE(userMetrics)}` }] },
            config: { tools: [{ googleSearch: {} }] }
        });
        const data = parseJSON(response.text || "{}");
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceUrls = grounding?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri })).filter((s: any) => s.uri) || [];
        return {
            id: Date.now().toString(), name: data.name || productName, brand: data.brand || knownBrand || "Unknown",
            ingredients: data.ingredients || [], estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50, risks: data.risks || [], benefits: data.benefits || [],
            pros: data.pros || [], cons: data.cons || [], scientificVerdict: data.scientificVerdict || "",
            usageAdvice: data.usageAdvice || "", sourceUrls, dateScanned: Date.now(), type: data.type || "UNKNOWN"
        };
    });
};

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Search for skincare products in Malaysia matching: "${query}". Return JSON array: [{"brand": "...", "name": "..."}]`,
            config: { responseMimeType: 'application/json' }
        });
        const res = parseJSON(response.text || "[]");
        return Array.isArray(res) ? res : [];
    });
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Create a 3-tier (Budget, Value, Luxury) routine in RM (MYR) for this user: ${JSON.stringify(user.biometrics)}. Use products available in Malaysia. Return JSON.`,
            config: { responseMimeType: 'application/json' }
        });
        return parseJSON(response.text || "{}");
    });
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    return ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
             systemInstruction: `You are an expert Malaysian Skin Coach. User biometrics: ${JSON.stringify(user.biometrics)}. Shelf: ${JSON.stringify(shelf.map(p => p.name))}.`
        }
    });
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    return { analysis: { grade: 'A', conflicts: [], missing: [], balance: { hydration: 80 } } };
};

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const warnings = product.risks.map(r => ({ severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', reason: r.reason }));
    return {
        verdict: { 
            decision: warnings.length > 0 ? 'CAUTION' : 'CONSIDER', 
            title: warnings.length > 0 ? 'Risk Detected' : 'Analysis Ready', 
            description: warnings[0]?.reason || "Good match.", 
            color: warnings.length > 0 ? 'amber' : 'teal' 
        },
        audit: { warnings }
    };
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;
