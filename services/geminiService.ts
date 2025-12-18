
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const PROMPTS = {
    SKIN_DIAGNOSTIC: (metrics: SkinMetrics) => `
        ROLE: Skin Health Reporter.
        
        TASK: Analyze the provided skin data: ${JSON.stringify(metrics)}.
        
        STRICT RULES:
        1. NO FIRST-PERSON: Never use "I", "me", "my", or "mine".
        2. NO COACHING: Do not give advice or talk about feelings/empathy. No mental health references.
        3. SIMPLE LANGUAGE: Use words regular people understand. (e.g., use "breakouts" instead of "acne", "moisture" instead of "hydration", "firmness" instead of "sagging").
        4. CRITICAL FOCUS: Explain the lowest score first. Tell the user *why* it happens (e.g., weather, sun, clogged pores) in simple terms.
        5. FORMATTING: Use **bold highlights** for the most important findings.

        RETURN JSON FORMAT ONLY:
        {
            "overallScore": number, 
            "skinAge": number, 
            "analysisSummary": "A clear, objective report on skin status. Start with the most critical issue. Explain the cause simply without using 'I' or personal address.",
            "observations": { 
                "redness": "e.g., Visible redness found on the cheeks, likely due to sensitivity or sun.",
                "hydration": "e.g., Low moisture levels detected; skin may feel tight or look dull.",
                "texture": "e.g., Surface is slightly uneven near the nose area."
            }
        }
    `,

    PRODUCT_AUDIT_CORE: (userMetrics: SkinMetrics) => `
        USER CONTEXT: ${JSON.stringify(userMetrics)}.
        MANDATORY: Use Google Search for INCI and Malaysian Price (RM).
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
                { text: PROMPTS.SKIN_DIAGNOSTIC(localMetrics) }
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
    const sourceUrls = extractGroundingSources(response);
    return { ...data, sourceUrls, id: Date.now().toString(), dateScanned: Date.now() };
};

export const analyzeProductFromSearch = async (name: string, metrics: SkinMetrics, score?: number, brand?: string): Promise<Product> => {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `AUDIT: ${brand ? brand + ' ' : ''}${name}. ${PROMPTS.PRODUCT_AUDIT_CORE(metrics)}`,
        config: { tools: [{ googleSearch: {} }] }
    });
    const data = parseJSON(response.text || "{}");
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
        config: { systemInstruction: `Analytical Skin Health Analyzer. Provide objective, technical responses in plain English without first-person pronouns. User data: ${JSON.stringify(user.biometrics)}` }
    });
};

export const analyzeShelfHealth = (p: Product[], u: UserProfile) => ({ analysis: { grade: 'A' } });
export const getBuyingDecision = (p: Product, s: Product[], u: UserProfile) => ({
    verdict: { decision: 'CONSIDER', title: 'Analysis Clear', color: 'teal' },
    audit: { warnings: [] }
});
export const isQuotaError = (e: any) => e?.status === 429;
