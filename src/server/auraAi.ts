import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  AiDiyResult,
  AiInspirationBoardResult,
  AiPaletteResult,
  AiRecommendationResult,
  AiStorySummaryResult,
  AiStylingResult,
  AiTravelResult,
  AuraMood,
  AuraStory,
} from '../types/aura.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected 6-digit hex color')
  .transform((v) => v.toUpperCase());

export const aiRecommendationSchema: z.ZodType<AiRecommendationResult> = z.object({
  moodSummary: z.string().min(10),
  editorialNote: z.string().min(10),
  recommendedStories: z
    .array(
      z.object({
        slug: z.string().min(1),
        title: z.string().min(2),
        reason: z.string().min(5),
        stylingCue: z.string().min(5),
      })
    )
    .min(1)
    .max(6),
  complementaryPalette: z
    .array(
      z.object({
        name: z.string().min(2),
        hex: hexColorSchema,
        usage: z.string().min(3),
      })
    )
    .min(3)
    .max(6),
});

export const aiInspirationBoardSchema: z.ZodType<AiInspirationBoardResult> = z.object({
  title: z.string().min(3),
  concept: z.string().min(10),
  moodKeywords: z.array(z.string().min(2)).min(3).max(8),
  colorPalette: z
    .array(
      z.object({
        name: z.string().min(2),
        hex: hexColorSchema,
        role: z.string().min(2),
      })
    )
    .min(4)
    .max(6),
  materialsAndTextures: z.array(z.string().min(2)).min(3).max(8),
  stylingIdeas: z.array(z.string().min(5)).min(3).max(6),
  editorialNotes: z.array(z.string().min(5)).min(2).max(5),
  matchedStorySlugs: z.array(z.string().min(1)).max(6),
});

export const aiStylingSchema: z.ZodType<AiStylingResult> = z.object({
  title: z.string().min(3),
  editorialDirection: z.string().min(10),
  looks: z
    .array(
      z.object({
        name: z.string().min(2),
        pieces: z.array(z.string().min(2)).min(2).max(6),
        accessories: z.array(z.string().min(2)).min(1).max(4),
        occasion: z.string().min(2),
        tip: z.string().min(5),
      })
    )
    .min(2)
    .max(4),
  palette: z
    .array(
      z.object({
        name: z.string().min(2),
        hex: hexColorSchema,
      })
    )
    .min(3)
    .max(6),
});

export const aiPaletteSchema: z.ZodType<AiPaletteResult> = z.object({
  themeName: z.string().min(3),
  rationale: z.string().min(10),
  swatches: z
    .array(
      z.object({
        name: z.string().min(2),
        hex: hexColorSchema,
        role: z.string().min(2),
        pairingAdvice: z.string().min(5),
      })
    )
    .min(4)
    .max(6),
});

export const aiDiySchema: z.ZodType<AiDiyResult> = z.object({
  projectTitle: z.string().min(3),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Artisan']),
  estimatedTime: z.string().min(2),
  materials: z.array(z.string().min(2)).min(3).max(12),
  steps: z
    .array(
      z.object({
        stepNumber: z.number().int().min(1),
        title: z.string().min(2),
        detail: z.string().min(8),
      })
    )
    .min(3)
    .max(8),
  finishingTip: z.string().min(5),
});

export const aiTravelSchema: z.ZodType<AiTravelResult> = z.object({
  destinationTitle: z.string().min(3),
  atmosphere: z.string().min(10),
  bestSeason: z.string().min(3),
  itinerary: z
    .array(
      z.object({
        dayLabel: z.string().min(2),
        morning: z.string().min(5),
        afternoon: z.string().min(5),
        evening: z.string().min(5),
      })
    )
    .min(2)
    .max(5),
  packingPalette: z
    .array(
      z.object({
        name: z.string().min(2),
        hex: hexColorSchema,
      })
    )
    .min(3)
    .max(6),
  quietDetour: z.string().min(8),
});

export const aiStorySummarySchema: z.ZodType<AiStorySummaryResult> = z.object({
  headlineTakeaway: z.string().min(10),
  keyHighlights: z.array(z.string().min(5)).min(3).max(5),
  moodTags: z.array(z.string().min(2)).min(2).max(6),
  actionableIdea: z.string().min(8),
});

export class AuraAiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 502, code = 'AI_UPSTREAM_ERROR') {
    super(message);
    this.name = 'AuraAiError';
    this.status = status;
    this.code = code;
  }
}

export function isGeminiConfigured(): boolean {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(key && !/^(MY_|YOUR_|<|PLACEHOLDER)/i.test(key));
}

function getGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new AuraAiError(
      'Google Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to use Aura AI.',
      503,
      'GEMINI_NOT_CONFIGURED'
    );
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateValidatedJson<T>(params: {
  systemInstruction: string;
  contents: string;
  responseSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
}): Promise<T> {
  const ai = getGeminiClient();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema as never,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new AuraAiError('Gemini returned an empty response. Please retry.', 502, 'AI_EMPTY_RESPONSE');
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new AuraAiError('Gemini returned invalid JSON output. Please retry.', 502, 'AI_INVALID_JSON');
      }

      const validated = params.validator.safeParse(parsedJson);
      if (!validated.success) {
        throw new AuraAiError(
          `AI output failed schema validation: ${validated.error.issues[0]?.message || 'unexpected shape'}`,
          502,
          'AI_SCHEMA_MISMATCH'
        );
      }

      return validated.data;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof AuraAiError && err.status === 503) {
        throw err;
      }
      if (/API_KEY_INVALID|PERMISSION_DENIED|403|400/i.test(msg)) {
        throw new AuraAiError(
          'Gemini rejected the API key. Check GEMINI_API_KEY in Settings > Secrets.',
          502,
          'GEMINI_AUTH_ERROR'
        );
      }
      if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
        throw new AuraAiError(
          'Gemini rate limit reached. Please wait a moment and retry.',
          429,
          'GEMINI_RATE_LIMITED'
        );
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  }

  if (lastError instanceof AuraAiError) {
    throw lastError;
  }
  throw new AuraAiError(
    `Aura AI request failed: ${lastError instanceof Error ? lastError.message : 'unexpected error'}`,
    502,
    'AI_UPSTREAM_ERROR'
  );
}

const EDITORIAL_SYSTEM_VOICE =
  'You are AURA, a luxury editorial creative director and lifestyle curator with the calm, tactile, museum-grade taste of Kinfolk, Cereal, and Architectural Digest. Respond concisely with warm, concrete, sensory precision. Always return strictly valid JSON matching the requested schema. All hex colors must be exact 6-digit hex strings like #EAE2D6.';

export async function generateMoodRecommendations(params: {
  mood: AuraMood;
  userPrompt?: string;
  catalog: AuraStory[];
}): Promise<AiRecommendationResult> {
  const catalogContext = params.catalog.map((s) => ({
    slug: s.slug,
    title: s.title,
    category: s.categorySlug,
    moods: s.moods,
    tags: s.tags,
    excerpt: s.excerpt,
  }));

  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Selected Mood: "${params.mood.label}" (${params.mood.shortDescriptor}).
Optional visitor request: "${params.userPrompt || 'Curate an immersive visual reading sequence for this mood.'}"

Choose 3 to 4 stories ONLY from this exact published catalog (preserve exact slug and title):
${JSON.stringify(catalogContext)}`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['moodSummary', 'editorialNote', 'recommendedStories', 'complementaryPalette'],
      properties: {
        moodSummary: { type: Type.STRING },
        editorialNote: { type: Type.STRING },
        recommendedStories: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['slug', 'title', 'reason', 'stylingCue'],
            properties: {
              slug: { type: Type.STRING },
              title: { type: Type.STRING },
              reason: { type: Type.STRING },
              stylingCue: { type: Type.STRING },
            },
          },
        },
        complementaryPalette: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['name', 'hex', 'usage'],
            properties: {
              name: { type: Type.STRING },
              hex: { type: Type.STRING },
              usage: { type: Type.STRING },
            },
          },
        },
      },
    },
    validator: aiRecommendationSchema,
  });
}

export async function generateInspirationBoard(params: {
  prompt: string;
  moodLabel?: string;
  catalog: AuraStory[];
}): Promise<AiInspirationBoardResult> {
  const catalogSlugs = params.catalog.map((s) => ({
    slug: s.slug,
    title: s.title,
    category: s.categorySlug,
    moods: s.moods,
  }));

  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Turn this user prompt into a structured luxury editorial inspiration board.
Prompt: "${params.prompt}"
Preferred mood context: "${params.moodLabel || 'Open editorial'}"

Also select 2 to 4 relevant story slugs ONLY from this exact AURA catalog for matchedStorySlugs:
${JSON.stringify(catalogSlugs)}`,
    responseSchema: {
      type: Type.OBJECT,
      required: [
        'title',
        'concept',
        'moodKeywords',
        'colorPalette',
        'materialsAndTextures',
        'stylingIdeas',
        'editorialNotes',
        'matchedStorySlugs',
      ],
      properties: {
        title: { type: Type.STRING },
        concept: { type: Type.STRING },
        moodKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        colorPalette: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['name', 'hex', 'role'],
            properties: {
              name: { type: Type.STRING },
              hex: { type: Type.STRING },
              role: { type: Type.STRING },
            },
          },
        },
        materialsAndTextures: { type: Type.ARRAY, items: { type: Type.STRING } },
        stylingIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
        editorialNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
        matchedStorySlugs: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    validator: aiInspirationBoardSchema,
  });
}

export async function generateStylingCombinations(prompt: string): Promise<AiStylingResult> {
  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Design 3 refined, cohesive styling combinations for this brief: "${prompt}". Focus on natural fabrics, proportion, silhouette, and restrained accessories.`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['title', 'editorialDirection', 'looks', 'palette'],
      properties: {
        title: { type: Type.STRING },
        editorialDirection: { type: Type.STRING },
        looks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['name', 'pieces', 'accessories', 'occasion', 'tip'],
            properties: {
              name: { type: Type.STRING },
              pieces: { type: Type.ARRAY, items: { type: Type.STRING } },
              accessories: { type: Type.ARRAY, items: { type: Type.STRING } },
              occasion: { type: Type.STRING },
              tip: { type: Type.STRING },
            },
          },
        },
        palette: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['name', 'hex'],
            properties: {
              name: { type: Type.STRING },
              hex: { type: Type.STRING },
            },
          },
        },
      },
    },
    validator: aiStylingSchema,
  });
}

export async function generateColorPalette(prompt: string): Promise<AiPaletteResult> {
  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Create a sophisticated 5-swatch editorial color palette inspired by: "${prompt}". Ensure every hex code is a valid 6-digit hex color (#RRGGBB) with balanced light, neutral, midtone, and deep anchor values.`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['themeName', 'rationale', 'swatches'],
      properties: {
        themeName: { type: Type.STRING },
        rationale: { type: Type.STRING },
        swatches: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['name', 'hex', 'role', 'pairingAdvice'],
            properties: {
              name: { type: Type.STRING },
              hex: { type: Type.STRING },
              role: { type: Type.STRING },
              pairingAdvice: { type: Type.STRING },
            },
          },
        },
      },
    },
    validator: aiPaletteSchema,
  });
}

export async function generateDiyIdea(prompt: string): Promise<AiDiyResult> {
  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Create a tactile, weekend-achievable luxury craft & DIY studio project inspired by: "${prompt}". Include realistic materials and clear sequential steps.`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['projectTitle', 'difficulty', 'estimatedTime', 'materials', 'steps', 'finishingTip'],
      properties: {
        projectTitle: { type: Type.STRING },
        difficulty: { type: Type.STRING },
        estimatedTime: { type: Type.STRING },
        materials: { type: Type.ARRAY, items: { type: Type.STRING } },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['stepNumber', 'title', 'detail'],
            properties: {
              stepNumber: { type: Type.INTEGER },
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
            },
          },
        },
        finishingTip: { type: Type.STRING },
      },
    },
    validator: aiDiySchema,
  });
}

export async function generateTravelInspiration(prompt: string): Promise<AiTravelResult> {
  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Design a 3-day slow luxury travel editorial itinerary inspired by: "${prompt}". Emphasize architecture, morning light, local craft, seasonal food, and unhurried pacing.`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['destinationTitle', 'atmosphere', 'bestSeason', 'itinerary', 'packingPalette', 'quietDetour'],
      properties: {
        destinationTitle: { type: Type.STRING },
        atmosphere: { type: Type.STRING },
        bestSeason: { type: Type.STRING },
        itinerary: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['dayLabel', 'morning', 'afternoon', 'evening'],
            properties: {
              dayLabel: { type: Type.STRING },
              morning: { type: Type.STRING },
              afternoon: { type: Type.STRING },
              evening: { type: Type.STRING },
            },
          },
        },
        packingPalette: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['name', 'hex'],
            properties: {
              name: { type: Type.STRING },
              hex: { type: Type.STRING },
            },
          },
        },
        quietDetour: { type: Type.STRING },
      },
    },
    validator: aiTravelSchema,
  });
}

export async function summarizeEditorialStory(story: AuraStory): Promise<AiStorySummaryResult> {
  const storyBody = story.sections
    .map((sec) => `${sec.heading}: ${sec.body} ${(sec.items || []).join(' ')}`)
    .join('\n');

  return generateValidatedJson({
    systemInstruction: EDITORIAL_SYSTEM_VOICE,
    contents: `Summarize this AURA editorial story concisely for a reader looking for its core aesthetic insight and one actionable takeaway.
Title: ${story.title}
Subtitle: ${story.subtitle}
Category: ${story.categorySlug}
Moods: ${story.moods.join(', ')}
Content:
${storyBody}`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['headlineTakeaway', 'keyHighlights', 'moodTags', 'actionableIdea'],
      properties: {
        headlineTakeaway: { type: Type.STRING },
        keyHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
        moodTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        actionableIdea: { type: Type.STRING },
      },
    },
    validator: aiStorySummarySchema,
  });
}
