
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile, IngredientRisk, Benefit } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- PROMPT ARCHITECTURE (Isolated to prevent accidental overwrites) ---

const PROMPTS = {
    SKIN_DIAGNOSTIC: (localMetrics: SkinMetrics) => `
        TASK: Elite Clinical Skin Diagnostic. Provide a sharp, holistic analysis.
        
        CONTEXTUAL INTELLIGENCE:
        1. SURROUNDINGS: Analyze lighting (warm, harsh, dim), makeup presence (foundation/concealer masking), and clarity.
        2. BEHAVIORAL LOGIC: If makeup is detected, acknowledge it masks metrics but provide your expert prediction of the true state. Explain relationships (e.g., "High oil despite low hydration suggests a compromised barrier").
        
        SCORING MANDATE (CRITICAL):
        Baselines provided: ${JSON.stringify(localMetrics)}.
        MISSION: Recalibrate based on visual intelligence. 
        LOGIC: HIGHER = HEALTHIER (100 is Perfect).
        - ACNE SCARS: Presence of scars MUST result in a LOW score. (100 = Glass skin, 30 = Significant scarring).
        - ACNE ACTIVE: Presence of spots MUST result in a LOW score.
        
        NARRATIVE:
        - Use simple terms: "Acne", "Scars", "Spots", "Pores", "Lines", "Water balance".
        - HIGHLIGHTING: Wrap critical clinical terms or specific locations in double asterisks (e.g., "**active acne on the chin**").
        - TONE: Clinical/Professional. Start with "Visual analysis reveals..."
        
        RETURN JSON ONLY:
        {
            "overallScore": number,
            "skinAge": number,
            "acneActive": number,
            "acneScars": number,
            "redness": number,
            "hydration": number,
            "texture": number,
            "wrinkleFine": number,
            "pigmentation": number,
            "analysisSummary": "5-6 sentences of deep analysis with ** highlights.",
            "observations": { "metricKey": "Deep location-based detail" }
        }
    `,
    
    PRODUCT_ANALYSIS: (name: string, brand: string, userMetrics: SkinMetrics) => `
        TASK: Identify and analyze "${name}" by "${brand}".
        USER CONTEXT: ${JSON.stringify(userMetrics)}.
        
        REQUIREMENTS:
        1. Determine if ingredients safe for THIS user.
        2. Provide suitability score (0-100).
        3. List specific Pros/Cons/Usage Advice based on their biometrics.
        
        RETURN JSON ONLY:
        {
            "name": "Full Product Name",
            "brand": "Brand Name",
            "type": "SERUM/MOISTURIZER/etc",
            "ingredients": ["string"],
            "suitabilityScore": number,
            "estimatedPrice": number,
            "risks": [{"ingredient": "string", "riskLevel": "HIGH/MED/LOW", "reason": "string"}],
            "benefits": [{"ingredient": "string", "target": "metricKey", "description": "string"}],
            "pros": ["string"], "cons": ["string"],
            "scientificVerdict": "Detailed breakdown",
            "usageAdvice": "Specific AM/PM instructions"
        }
    `
};

// --- CORE UTILITIES ---

const parseJSON = (text: string) => {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parse Error:", text);
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

// --- EXPORTED FEATURES ---

/**
 * DEEP SKIN ANALYSIS
 * Uses visual intelligence to recalibrate computer vision scores.
 */
export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
                { text: PROMPTS.SKIN_DIAGNOSTIC(localMetrics) }
            ],
            config: { responseMimeType: 'application/json' }
        });
        const data = parseJSON(response.text || "{}");
        return { ...localMetrics, ...data, timestamp: Date.now() };
    });
};

/**
 * PRODUCT IMAGE SCANNER
 * Uses Google Search grounding to identify and audit labels.
 */
export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics): Promise<Product> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                { text: `Identify this product and analyze for user: ${JSON.stringify(userMetrics)}. Use Google Search to verify ingredients and price. Return JSON.` }
            ],
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json' 
            }
        });

        const data = parseJSON(response.text || "{}");
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceUrls = grounding?.map((c: any) => ({ 
            title: c.web?.title || "Verification Link", 
            uri: c.web?.uri 
        })).filter((s: any) => s.uri) || [];

        return {
            id: Date.now().toString(),
            name: data.name || "Unknown Product",
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

/**
 * PRODUCT SEARCH ANALYZER
 * Audits a product by name using search grounding.
 */
export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string): Promise<Product> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: PROMPTS.PRODUCT_ANALYSIS(productName, knownBrand || "Unknown", userMetrics),
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json' 
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

// --- ADDITIONAL TOOLS ---

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runAI(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Search for skincare products matching: "${query}". Return JSON array: [{"brand": "...", "name": "..."}]`,
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
            contents: `Create a 3-tier (Budget, Value, Luxury) morning/night routine for this user: ${JSON.stringify(user.biometrics)}. Return JSON with "am" and "pm" arrays.`,
            config: { responseMimeType: 'application/json' }
        });
        return parseJSON(response.text || "{}");
    });
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    return ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
             systemInstruction: `You are a professional skin coach. User biometrics: ${JSON.stringify(user.biometrics)}. Shelf: ${JSON.stringify(shelf.map(p => p.name))}.`
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
        verdict: { decision: audit.warnings.length > 0 ? 'CAUTION' : 'CONSIDER', title: 'Analysis Ready', description: audit.analysisReason, color: 'teal' },
        audit
    };
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;
