
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile, IngredientRisk, Benefit } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- IMPROVED HELPERS ---

const parseJSONFromText = (text: string): any => {
    try {
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const startObj = cleaned.indexOf('{');
        const startArr = cleaned.indexOf('[');
        let start = -1;
        let end = -1;
        let isArray = false;

        if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
            start = startObj;
            end = cleaned.lastIndexOf('}');
        } else if (startArr !== -1) {
            start = startArr;
            end = cleaned.lastIndexOf(']');
            isArray = true;
        }

        if (start === -1 || end === -1) return isArray ? [] : {};
        const jsonStr = cleaned.substring(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error. Raw Text:", text);
        return null;
    }
};

const runWithRetry = async <T>(
    fn: (ai: GoogleGenAI) => Promise<T>, 
    maxRetries: number = 3
): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn(ai);
        } catch (err: any) {
            lastError = err;
            const status = err?.status || 0;
            const isRateLimit = status === 429 || err?.message?.includes('429');
            const isServerErr = status >= 500;
            if (i < maxRetries - 1 && (isRateLimit || isServerErr)) {
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
};

// --- EXPORTED FUNCTIONS ---

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry<{ name: string, brand: string }[]>(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Search for skincare products matching: "${query}". Return JSON array: [{"brand": "...", "name": "..."}]`,
            config: { responseMimeType: 'application/json' }
        });
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [];
    });
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithRetry<SkinMetrics>(async (ai) => {
        const prompt = `
        TASK: Act as an elite Clinical Skin Diagnostic AI. Provide a sharp, holistic, and intelligently deep analysis.
        
        HOLISTIC CONTEXT AWARENESS:
        1. SURROUNDINGS: Analyze lighting (harsh, warm, low), makeup presence (concealer, foundation), and photo clarity. 
        2. BEHAVIORAL LOGIC: If lighting is yellow, adjust redness interpretation. If makeup is detected, acknowledge it masks certain metrics but still provide a sharp prediction of the underlying state.
        3. INTELLIGENT DEPTH: Explain relationships (e.g., "Surface oiliness suggests a compensatory response to underlying barrier dehydration").
        
        SHARP SCORING RECALIBRATION:
        The provided computer-vision baselines are just a HINT: ${JSON.stringify(localMetrics)}. 
        RECALIBRATE them based on your superior visual intelligence. 
        DIRECTION: For ALL scores, HIGHER is BETTER (100 = Perfect/No issue). 
        - ACNE SCARS: Presence of scars MUST result in a LOW score. (0 = Significant scarring, 100 = No scars).
        - ACNE ACTIVE: Presence of active spots MUST result in a LOW score.
        Be honest and accurate. If the photo looks clearer than the baseline, raise the score. If it looks worse, lower it.
        
        NARRATIVE REQUIREMENTS:
        - LANGUAGE: Use easy, simple layman terms like "Acne", "Scars", "Spots", "Pores", "Water/Oil balance".
        - HIGHLIGHTING: Wrap critical terms or key findings in double asterisks (e.g., "**visible scars on the cheek**").
        - TONE: Clinical yet accessible. Start with "Visual analysis reveals..." or "The individual displays...".
        
        OUTPUT FORMAT (STRICT JSON):
        {
            "overallScore": number (0-100),
            "skinAge": number,
            "acneActive": number,
            "acneScars": number,
            "redness": number,
            "hydration": number,
            "texture": number,
            "wrinkleFine": number,
            "pigmentation": number,
            "analysisSummary": "Write 5-6 sentences of deep, contextual analysis. Highlight critical terms with **.",
            "observations": {
                "acneActive": "Sharp contextual detail",
                "acneScars": "Sharp contextual detail",
                "pigmentation": "Sharp detail on spots",
                "redness": "Lighting-aware detail"
            }
        }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        const data = parseJSONFromText(response.text || "{}");
        if (!data) throw new Error("Could not parse skin analysis.");
        return { ...localMetrics, ...data, timestamp: Date.now() };
    });
};

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        const prompt = `Analyze "${productName}" by "${knownBrand || "Unknown"}". User Skin: ${JSON.stringify(userMetrics)}. JSON only.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { 
                tools: [{googleSearch: {}}],
                responseMimeType: 'application/json' 
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceUrls = grounding?.map((c: any) => ({ 
            title: c.web?.title || "Product Source", 
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

export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        const prompt = `Identify and analyze product. User: ${JSON.stringify(userMetrics)}. JSON only.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: prompt }
                ]
            },
            config: { 
                tools: [{googleSearch: {}}],
                responseMimeType: 'application/json',
                temperature: 0.1 
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        if (!data || data.name === "Identification Failed") {
            throw new Error("Label not recognized.");
        }

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

export const auditProduct = (product: Product, user: UserProfile) => {
    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    let adjustedScore = product.suitabilityScore;
    if (user.biometrics.redness < 50 && warnings.length > 0) adjustedScore -= 10;
    return {
        adjustedScore: Math.max(0, Math.min(100, adjustedScore)),
        warnings,
        analysisReason: warnings.length > 0 ? warnings[0].reason : "This looks like a great match for your skin."
    };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const missing: string[] = [];
    const types = new Set(products.map(p => p.type));
    if (!types.has('CLEANSER')) missing.push('Cleanser');
    if (!types.has('SPF')) missing.push('SPF');
    if (!types.has('MOISTURIZER')) missing.push('Moisturizer');

    const avgScore = products.length > 0 ? products.reduce((acc, p) => acc + p.suitabilityScore, 0) / products.length : 0;
    let grade = 'C';
    if (avgScore > 85 && missing.length === 0) grade = 'S';
    else if (avgScore > 75) grade = 'A';
    else if (avgScore > 60) grade = 'B';

    return {
        analysis: {
            grade,
            conflicts: [],
            riskyProducts: [],
            missing,
            redundancies: [],
            upgrades: [],
            balance: { exfoliation: 50, hydration: 80, protection: 90, treatment: 70 }
        }
    };
};

export const analyzeProductContext = (product: Product, shelf: Product[]) => {
    return { conflicts: [], typeCount: shelf.filter(p => p.type === product.type).length };
};

export const getClinicalTreatmentSuggestions = (user: UserProfile) => {
    return [{ type: 'FACIAL', name: 'Hydra-Infusion', benefit: 'Deep moisture for thirsty skin', downtime: 'None' }];
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    return ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
             systemInstruction: `You are a friendly skin coach. User skin: ${JSON.stringify(user.biometrics)}. Shelf: ${JSON.stringify(shelf.map(p => p.name))}.`
        }
    });
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    return {
        verdict: { decision: 'CONSIDER', title: 'Good Match', description: audit.analysisReason, color: 'teal' },
        audit,
        shelfConflicts: [], 
        comparison: { result: 'NEUTRAL' }
    };
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runWithRetry<any>(async (ai) => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Create a simple morning/night routine for this user: ${JSON.stringify(user.biometrics)}. Format: JSON.`,
            config: { responseMimeType: 'application/json' }
        });
        return parseJSONFromText(response.text || "{}");
    });
}
