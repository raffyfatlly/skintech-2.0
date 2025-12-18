
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- STRICT SCHEMAS ---

const SCHEMAS = {
    PRODUCT_JSON: `
    {
        "name": "Full Product Name",
        "brand": "Brand Name",
        "type": "CLEANSER/TONER/SERUM/MOISTURIZER/SPF/TREATMENT/FOUNDATION/CONCEALER",
        "ingredients": ["list", "of", "ingredients (Full INCI)"],
        "suitabilityScore": number (0-100),
        "estimatedPrice": number (Value in RM/MYR),
        "risks": [{"ingredient": "string", "riskLevel": "HIGH/MEDIUM/LOW", "reason": "string"}],
        "benefits": [{"ingredient": "string", "target": "metricKey", "description": "string"}],
        "pros": ["benefit 1", "benefit 2"],
        "cons": ["risk 1", "risk 2"],
        "scientificVerdict": "Deep dermatological explanation using data from INCIDecoder and your metrics",
        "usageAdvice": "Specific AM/PM instructions for the Malaysian climate"
    }`
};

// --- MODULAR PROMPT ENGINE ---

const PROMPTS = {
    SKIN_DIAGNOSTIC: (metrics: SkinMetrics, history?: SkinMetrics[]) => `
        TASK: Elite Clinical Skin Diagnostic. Recalibrate CV baselines: ${JSON.stringify(metrics)}.
        ${history && history.length > 0 ? `PREVIOUS HISTORY: ${JSON.stringify(history.slice(-3))}.` : ''}
        
        LOGIC: HIGHER = HEALTHIER.
        CONTEXT: Detect makeup, lighting, clarity. 
        NARRATIVE: 5-6 sentences with **highlights**.
        
        RETURN JSON:
        {
            "overallScore": number, "skinAge": number, "acneActive": number, "acneScars": number,
            "redness": number, "hydration": number, "texture": number, "wrinkleFine": number, "pigmentation": number,
            "analysisSummary": "text with **highlights**",
            "observations": { "metricKey": "location detail" }
        }
    `,

    PRODUCT_AUDIT_CORE: (userMetrics: SkinMetrics) => `
        USER CONTEXT: ${JSON.stringify(userMetrics)}.
        
        MANDATORY SEARCH STEPS:
        1. USE GOOGLE SEARCH to find the official INCI list, specifically from INCIDecoder.com if possible.
        2. FIND THE MALAYSIAN PRICE (RM/MYR) from local retailers (Watsons MY, Guardian MY, Sephora MY).
        
        INSTRUCTIONS:
        - Analyze safety against the user's specific skin biometrics.
        - Return ONLY a valid JSON object matching this schema: ${SCHEMAS.PRODUCT_JSON}
    `
};

// --- ROBUST PARSING UTILITY ---

const parseJSON = (text: string) => {
    if (!text) return null;
    try {
        // Remove common markdown wrappers
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Find the actual JSON object boundaries in case of extra text
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }
        
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Critical JSON Parse Failure:", e, "Raw text:", text);
        return null;
    }
};

const runAI = async <T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> => {
    try {
        return await fn(ai);
    } catch (err: any) {
        if (err?.status === 429) {
            await new Promise(r => setTimeout(r, 2000));
            return await fn(ai);
        }
        throw err;
    }
};

// --- EXPORTED SERVICE FUNCTIONS ---

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
            config: { 
                tools: [{ googleSearch: {} }]
            }
        });

        const data = parseJSON(response.text || "{}");
        if (!data || !data.name) throw new Error("Identification failed.");

        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceUrls = grounding?.map((c: any) => ({ 
            title: c.web?.title || "Verification Link", 
            uri: c.web?.uri 
        })).filter((s: any) => s.uri) || [];

        return {
            id: Date.now().toString(),
            name: data.name,
            brand: data.brand || "Unknown",
            imageUrl: data.imageUrl,
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            pros: data.pros || [],
            cons: data.cons || [],
            scientificVerdict: data.scientificVerdict || "",
            usageAdvice: data.usageAdvice || "",
            sourceUrls,
            dateScanned: Date.now()
        };
    });
};

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string): Promise<Product> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { text: `PRODUCT AUDIT: ${productName} by ${knownBrand || 'Unknown'}. ${PROMPTS.PRODUCT_AUDIT_CORE(userMetrics)}` }
                ]
            },
            config: { 
                tools: [{ googleSearch: {} }]
            }
        });

        const data = parseJSON(response.text || "{}");
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceUrls = grounding?.map((c: any) => ({ 
            title: c.web?.title || "Source", 
            uri: c.web?.uri 
        })).filter((s: any) => s.uri) || [];

        return {
            id: Date.now().toString(),
            name: data.name || productName,
            brand: data.brand || knownBrand || "Unknown",
            imageUrl: data.imageUrl,
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            pros: data.pros || [],
            cons: data.cons || [],
            scientificVerdict: data.scientificVerdict || "",
            usageAdvice: data.usageAdvice || "",
            sourceUrls,
            dateScanned: Date.now()
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
            contents: `Create a 3-tier (Budget, Value, Luxury) routine in RM (MYR) for this user: ${JSON.stringify(user.biometrics)}. Use products available in Malaysia (Watsons/Guardian/Sephora). Return JSON with "am" and "pm" arrays.`,
            config: { responseMimeType: 'application/json' }
        });
        return parseJSON(response.text || "{}");
    });
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    return ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
             systemInstruction: `You are an expert Malaysian Skin Coach. You know local pricing (RM) and product availability at Watsons/Guardian/Sephora MY. Use INCIDecoder as your logic base. User biometrics: ${JSON.stringify(user.biometrics)}. Shelf: ${JSON.stringify(shelf.map(p => p.name))}.`
        }
    });
};

export const auditProduct = (product: Product, user: UserProfile) => {
    const warnings = product.risks.map(r => ({ severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', reason: r.reason }));
    return { adjustedScore: product.suitabilityScore, warnings, analysisReason: warnings[0]?.reason || "Good match." };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    return { analysis: { grade: 'A', conflicts: [], missing: [], balance: { hydration: 80 } } };
};

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    return {
        verdict: { 
            decision: audit.warnings.length > 0 ? 'CAUTION' : 'CONSIDER', 
            title: audit.warnings.length > 0 ? 'Risk Detected' : 'Analysis Ready', 
            description: audit.analysisReason, 
            color: audit.warnings.length > 0 ? 'amber' : 'teal' 
        },
        audit
    };
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;
