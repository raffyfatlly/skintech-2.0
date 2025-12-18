
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const PROMPTS = {
    SKIN_DIAGNOSTIC: (metrics: SkinMetrics, history?: SkinMetrics[]) => `
        TASK: Clinical Verification of Optical Biomarkers.
        
        DETERMINISTIC DATA (Primary Source): ${JSON.stringify(metrics)}.
        
        INSTRUCTIONS:
        1. NO ARBITRARY SMOOTHING: If you see significant visual evidence of inflammation, scars, or texture, keep the scores low. If the skin is clearly glass-like, keep them high.
        2. CROSS-VERIFICATION: The provided metrics are calculated via pixel-level signal processing (YCbCr decomposition). Verify these against the visual blobs and patterns in the image.
        3. ACCURACY OVER CONSISTENCY: Your priority is reflecting the TRUTH of this specific image. If it differs from history, explain the change (e.g., "Active breakout detected since last scan").
        
        NARRATIVE: 5-6 professional sentences with **bold highlights**. Focus on specific areas (e.g., "nasolabial folds", "malar region").
        
        RETURN JSON:
        {
            "overallScore": number, "skinAge": number, "acneActive": number, "acneScars": number,
            "redness": number, "hydration": number, "texture": number, "wrinkleFine": number, "pigmentation": number,
            "analysisSummary": "text with **highlights**",
            "observations": { "metricKey": "location and severity detail" }
        }
    `,

    PRODUCT_AUDIT_CORE: (userMetrics: SkinMetrics) => `
        USER CONTEXT: ${JSON.stringify(userMetrics)}.
        MANDATORY: Use Google Search to find official INCI from INCIDecoder and Malaysian Price (RM).
        RETURN ONLY VALID JSON.
    `
};

const parseJSON = (text: string) => {
    try {
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
        return JSON.parse(cleaned.substring(start, end + 1));
    } catch (e) { return null; }
};

// Helper to extract website URLs from groundingChunks as required by the @google/genai guidelines
const extractGroundingSources = (response: GenerateContentResponse) => {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!chunks) return [];
    return chunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
            title: chunk.web.title || 'Source',
            uri: chunk.web.uri || ''
        }))
        .filter((source: any) => source.uri);
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, history?: SkinMetrics[]): Promise<SkinMetrics> => {
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
    return { ...localMetrics, ...data, timestamp: Date.now() };
};

export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics): Promise<Product> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                { text: `IDENTIFY & AUDIT. ${PROMPTS.PRODUCT_AUDIT_CORE(userMetrics)}` }
            ]
        },
        config: { tools: [{ googleSearch: {} }] }
    });
    const data = parseJSON(response.text || "{}");
    // Extract grounding sources from groundingMetadata as per guidelines
    const sourceUrls = extractGroundingSources(response);
    return { ...data, sourceUrls, id: Date.now().toString(), dateScanned: Date.now() };
};

// Fixed error in file components/ProductSearch.tsx on line 84 by updating signature to accept brand and score arguments.
export const analyzeProductFromSearch = async (name: string, metrics: SkinMetrics, score?: number, brand?: string): Promise<Product> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `AUDIT: ${brand ? brand + ' ' : ''}${name}. ${PROMPTS.PRODUCT_AUDIT_CORE(metrics)}`,
        config: { tools: [{ googleSearch: {} }] }
    });
    const data = parseJSON(response.text || "{}");
    // Extract grounding sources from groundingMetadata as per guidelines
    const sourceUrls = extractGroundingSources(response);
    return { ...data, sourceUrls, id: Date.now().toString(), dateScanned: Date.now() };
};

export const searchProducts = async (q: string) => {
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Search products in Malaysia: ${q}. Return JSON array: [{"brand": "...", "name": "..."}]`,
        config: { responseMimeType: 'application/json' }
    });
    return parseJSON(res.text || "[]");
};

export const generateRoutineRecommendations = async (user: UserProfile) => {
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create 3-tier routine in RM for: ${JSON.stringify(user.biometrics)}. Return JSON.`,
        config: { responseMimeType: 'application/json' }
    });
    return parseJSON(res.text || "{}");
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]) => {
    return ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction: `Expert Malaysian Skin Coach. User: ${JSON.stringify(user.biometrics)}` }
    });
};

export const analyzeShelfHealth = (p: Product[], u: UserProfile) => ({ analysis: { grade: 'A' } });
export const getBuyingDecision = (p: Product, s: Product[], u: UserProfile) => ({
    verdict: { decision: 'CONSIDER', title: 'Analysis Clear', color: 'teal' },
    audit: { warnings: [] }
});
export const isQuotaError = (e: any) => e?.status === 429;
