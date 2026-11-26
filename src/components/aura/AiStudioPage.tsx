import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type {
  AiDiyResult,
  AiInspirationBoardResult,
  AiPaletteResult,
  AiRecommendationResult,
  AiStylingResult,
  AiTravelResult,
  AuraMood,
  AuraProfile,
  AuraStory,
  MoodSlug,
} from '../../types/aura';

type StudioTool = 'board' | 'recommend' | 'styling' | 'palette' | 'diy' | 'travel';

const TOOL_META: Record<
  StudioTool,
  { label: string; heading: string; placeholder: string; examples: string[] }
> = {
  board: {
    label: 'Inspiration Board',
    heading: 'Turn a feeling or prompt into a structured visual moodboard',
    placeholder: 'e.g. Sun-drenched Jaipur courtyard dinner with unbleached linen, hammered brass, and roasted figs',
    examples: [
      'Quiet monsoon tea alcove with cedar wood, stoneware, and sandalwood',
      'Minimalist ivory silk bridal trousseau for an intimate winter garden wedding',
    ],
  },
  recommend: {
    label: 'Mood Curator',
    heading: 'Curated editorial reading tailored to your selected vibe',
    placeholder: 'Optional focus (e.g. weekend home refresh, slow travel, calm morning routine)...',
    examples: ['Slow weekend reset with tactile crafts and nourishing recipes', 'Editorial neutral layering for autumn travel'],
  },
  styling: {
    label: 'Styling Combinations',
    heading: 'Refined wardrobe pairings and silhouette cues',
    placeholder: 'e.g. Styling an heirloom crimson Banarasi silk saree for a modern candlelit gallery reception',
    examples: ['Three ivory raw-silk capsule looks for coastal summer travel', 'Pairing uncut polki jewellery with minimalist tailoring'],
  },
  palette: {
    label: 'Color Harmonies',
    heading: 'Generate complementary architectural & lifestyle palettes',
    placeholder: 'e.g. Warm travertine living room facing east morning sun with olive foliage',
    examples: ['Jaipur cobalt pottery balanced with sandstone neutrals', 'Evening candlelit festive dining table'],
  },
  diy: {
    label: 'Craft & DIY',
    heading: 'Weekend studio projects with materials and clear steps',
    placeholder: 'e.g. Botanical tea-dyed linen napkins or hand-pinched stoneware incense holder',
    examples: ['Marigold petal natural dye bath for cotton table runners', 'Hand-painted cobalt glaze-inspired air-dry clay bowls'],
  },
  travel: {
    label: 'Slow Travel',
    heading: 'Unhurried 3-day destination monographs & packing palettes',
    placeholder: 'e.g. Misty Western Ghats coffee estate retreat during early monsoon',
    examples: ['Three quiet days exploring heritage architecture and textile ateliers in Udaipur', 'Mountain stone pavilion sanctuary in Himachal'],
  },
};

export function AiStudioPage({
  moods,
  user,
  stories,
}: {
  moods: AuraMood[];
  user: AuraProfile | null;
  stories: AuraStory[];
}) {
  const { query, navigate } = useAuraRouter();
  const initialMood = (query.get('mood') as MoodSlug | null) || moods[0]?.slug || 'minimal-and-calm';

  const [tool, setTool] = useState<StudioTool>(query.get('mood') ? 'recommend' : 'board');
  const [selectedMood, setSelectedMood] = useState<MoodSlug>(initialMood);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);

  const [boardResult, setBoardResult] = useState<AiInspirationBoardResult | null>(null);
  const [recResult, setRecResult] = useState<AiRecommendationResult | null>(null);
  const [stylingResult, setStylingResult] = useState<AiStylingResult | null>(null);
  const [paletteResult, setPaletteResult] = useState<AiPaletteResult | null>(null);
  const [diyResult, setDiyResult] = useState<AiDiyResult | null>(null);
  const [travelResult, setTravelResult] = useState<AiTravelResult | null>(null);

  useEffect(() => {
    updateDocumentSeo(
      'AI Aura Assistant — AURA Studio',
      'Gemini-powered editorial discovery, structured inspiration boards, styling combinations, color palettes, DIY guides, and slow travel.'
    );
  }, []);

  async function runGeneration(e?: React.FormEvent) {
    e?.preventDefault();
    if (tool !== 'recommend' && prompt.trim().length < 4) {
      setError('Enter a brief description (at least 4 characters) to begin.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tool === 'board') {
        const res = await auraApi.aiInspirationBoard({ prompt: prompt.trim(), moodSlug: selectedMood });
        setBoardResult(res.result);
      } else if (tool === 'recommend') {
        const res = await auraApi.aiRecommend({ moodSlug: selectedMood, prompt: prompt.trim() || undefined });
        setRecResult(res.result);
      } else if (tool === 'styling') {
        const res = await auraApi.aiStyling(prompt.trim());
        setStylingResult(res.result);
      } else if (tool === 'palette') {
        const res = await auraApi.aiPalette(prompt.trim());
        setPaletteResult(res.result);
      } else if (tool === 'diy') {
        const res = await auraApi.aiDiy(prompt.trim());
        setDiyResult(res.result);
      } else if (tool === 'travel') {
        const res = await auraApi.aiTravel(prompt.trim());
        setTravelResult(res.result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aura AI could not generate a response.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBoardToStudio() {
    if (!boardResult) return;
    if (!user) {
      navigate('/auth/sign-in');
      return;
    }
    setSavingBoard(true);
    setError(null);
    try {
      const matchedStories = boardResult.matchedStorySlugs
        .map((slug) => stories.find((s) => s.slug === slug))
        .filter((s): s is AuraStory => Boolean(s));

      const items = [
        ...matchedStories.map((s, idx) => ({
          kind: 'story_image' as const,
          storyId: s.id,
          imageUrl: s.coverImage,
          title: s.title,
          span: (idx === 0 ? 'wide' : 'standard') as 'wide' | 'standard',
        })),
        ...boardResult.editorialNotes.map((note) => ({
          kind: 'text_note' as const,
          note,
          span: 'standard' as const,
        })),
      ];

      const res = await auraApi.createMoodboard({
        title: boardResult.title,
        description: boardResult.concept,
        moodSlug: selectedMood,
        palette: boardResult.colorPalette,
        items,
      });
      navigate(`/moodboards/${res.moodboard.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save moodboard.');
    } finally {
      setSavingBoard(false);
    }
  }

  const meta = TOOL_META[tool];

  return (
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-12 space-y-10">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">AI Aura Assistant</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">
          Your editorial creative companion
        </h1>
        <p className="text-sm sm:text-base text-[#574F46] leading-relaxed">
          Powered by server-side Google Gemini with Zod-validated structured outputs for visual boards, color harmonies, styling, craft, and slow travel.
        </p>
      </header>

      {/* Tool Selector Tabs */}
      <div role="tablist" aria-label="AI studio modes" className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-[#DDD5C7]">
        {(Object.keys(TOOL_META) as StudioTool[]).map((key) => {
          const active = tool === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTool(key);
                setError(null);
              }}
              className={`px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 -mb-[1px] ${
                active
                  ? 'border-[#1C1917] text-[#1C1917]'
                  : 'border-transparent text-[#574F46] hover:text-[#1C1917]'
              }`}
            >
              {TOOL_META[key].label}
            </button>
          );
        })}
      </div>

      {/* Prompt Composer */}
      <form onSubmit={runGeneration} className="p-6 sm:p-8 rounded-2xl bg-[#F3EFE8] border border-[#DDD5C7] space-y-5">
        <h2 className="font-serif text-2xl sm:text-3xl text-[#1C1917]">{meta.heading}</h2>

        {(tool === 'board' || tool === 'recommend') && (
          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#574F46]">Anchor Mood</span>
            <div className="flex flex-wrap gap-2">
              {moods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMood(m.slug)}
                  className={`px-3.5 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                    selectedMood === m.slug
                      ? 'bg-[#1C1917] text-[#FAF7F2]'
                      : 'bg-[#FAF7F2] text-[#574F46] border border-[#DDD5C7] hover:text-[#1C1917]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={meta.placeholder}
            aria-label="Creative prompt"
            className="w-full px-4 py-3 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-xl text-[#1C1917] placeholder:text-[#7D7368]"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7D7368]">
            <span>Try:</span>
            {meta.examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="text-left text-[#574F46] hover:text-[#1C1917] underline-offset-4 hover:underline"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#7D7368]">Validated structured JSON · Zero simulated fallbacks</span>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Composing with Gemini...' : `Generate ${meta.label}`}
          </button>
        </div>
      </form>

      {/* Error & Retry State */}
      {error && (
        <div className="p-6 rounded-2xl bg-[#8B2E2E]/8 border border-[#8B2E2E]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.14em] text-[#8B2E2E]">AI Request Failed</p>
            <p className="text-sm text-[#332B24]">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => runGeneration()}
            className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-5 animate-pulse" aria-busy="true">
          <div className="h-8 w-1/2 bg-[#EAE4DA] rounded" />
          <div className="h-4 w-3/4 bg-[#EAE4DA] rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#EAE4DA] rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {/* STRUCTURED OUTPUT VIEWS */}
      {!loading && tool === 'board' && boardResult && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-[#EAE4DA]">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">Structured Inspiration Board</p>
              <h3 className="font-serif text-3xl sm:text-4xl text-[#1C1917]">{boardResult.title}</h3>
              <p className="text-sm text-[#574F46] leading-relaxed">{boardResult.concept}</p>
              <p className="text-xs text-[#7D7368] pt-1">{boardResult.moodKeywords.join(' · ')}</p>
            </div>
            <button
              type="button"
              onClick={handleSaveBoardToStudio}
              disabled={savingBoard}
              className="px-5 py-2.5 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] whitespace-nowrap shrink-0"
            >
              {savingBoard ? 'Saving...' : user ? 'Save to Moodboard Studio' : 'Sign in to Save Board'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {boardResult.colorPalette.map((sw) => (
              <div key={sw.hex} className="space-y-1.5">
                <div className="h-20 rounded-xl border border-[#DDD5C7]" style={{ backgroundColor: sw.hex }} />
                <p className="text-xs font-medium text-[#1C1917]">{sw.name}</p>
                <p className="font-mono text-[11px] text-[#7D7368] tabular-nums">{sw.hex} · {sw.role}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <div className="space-y-3">
              <h4 className="font-serif text-2xl text-[#1C1917]">Materials & Textures</h4>
              <ul className="space-y-2 text-sm text-[#332B24]">
                {boardResult.materialsAndTextures.map((m, i) => (
                  <li key={i} className="py-1.5 border-b border-[#EAE4DA]">{m}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-serif text-2xl text-[#1C1917]">Styling Direction</h4>
              <ul className="space-y-2 text-sm text-[#332B24]">
                {boardResult.stylingIdeas.map((idea, i) => (
                  <li key={i} className="py-1.5 border-b border-[#EAE4DA]">{idea}</li>
                ))}
              </ul>
            </div>
          </div>

          {boardResult.matchedStorySlugs.length > 0 && (
            <div className="pt-4 border-t border-[#EAE4DA] space-y-3">
              <h4 className="font-serif text-xl text-[#1C1917]">Paired AURA Editorial Stories</h4>
              <div className="flex flex-wrap gap-4">
                {boardResult.matchedStorySlugs.map((slug) => {
                  const st = stories.find((s) => s.slug === slug);
                  return (
                    <AuraLink
                      key={slug}
                      to={`/story/${slug}`}
                      className="text-sm text-[#1C1917] underline underline-offset-4 hover:text-[#8C6A43] inline-flex items-center gap-1"
                    >
                      {st?.title || slug}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </AuraLink>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tool === 'recommend' && recResult && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-8">
          <div className="space-y-2 max-w-2xl">
            <h3 className="font-serif text-3xl text-[#1C1917]">{recResult.moodSummary}</h3>
            <p className="text-sm text-[#574F46] leading-relaxed">{recResult.editorialNote}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recResult.recommendedStories.map((rec) => (
              <div key={rec.slug} className="p-5 rounded-xl bg-[#FAF7F2] border border-[#DDD5C7] space-y-2">
                <AuraLink to={`/story/${rec.slug}`} className="font-serif text-2xl text-[#1C1917] hover:text-[#8C6A43] block">
                  {rec.title}
                </AuraLink>
                <p className="text-sm text-[#332B24]">{rec.reason}</p>
                <p className="text-xs italic text-[#7D7368]">Cue: {rec.stylingCue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tool === 'styling' && stylingResult && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-8">
          <div className="space-y-2">
            <h3 className="font-serif text-3xl text-[#1C1917]">{stylingResult.title}</h3>
            <p className="text-sm text-[#574F46]">{stylingResult.editorialDirection}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stylingResult.looks.map((look, idx) => (
              <div key={idx} className="p-5 rounded-xl bg-[#FAF7F2] border border-[#DDD5C7] space-y-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[#7D7368]">{look.occasion}</p>
                <h4 className="font-serif text-2xl text-[#1C1917]">{look.name}</h4>
                <ul className="space-y-1 text-sm text-[#332B24]">
                  {look.pieces.map((p, i) => <li key={i}>• {p}</li>)}
                </ul>
                <p className="text-xs text-[#574F46]">Accessories: {look.accessories.join(', ')}</p>
                <p className="text-xs italic text-[#7D7368] pt-2 border-t border-[#EAE4DA]">{look.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tool === 'palette' && paletteResult && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-6">
          <div>
            <h3 className="font-serif text-3xl text-[#1C1917]">{paletteResult.themeName}</h3>
            <p className="text-sm text-[#574F46] mt-1">{paletteResult.rationale}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {paletteResult.swatches.map((sw) => (
              <div key={sw.hex} className="space-y-2">
                <div className="h-28 rounded-xl border border-[#DDD5C7]" style={{ backgroundColor: sw.hex }} />
                <p className="text-sm font-medium text-[#1C1917]">{sw.name}</p>
                <p className="font-mono text-xs text-[#7D7368] tabular-nums">{sw.hex} · {sw.role}</p>
                <p className="text-xs text-[#574F46] leading-relaxed">{sw.pairingAdvice}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tool === 'diy' && diyResult && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#7D7368]">
              {diyResult.difficulty} · {diyResult.estimatedTime}
            </p>
            <h3 className="font-serif text-3xl text-[#1C1917] mt-1">{diyResult.projectTitle}</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-2">
              <h4 className="font-serif text-xl text-[#1C1917]">Materials</h4>
              <ul className="space-y-1.5 text-sm text-[#332B24]">
                {diyResult.materials.map((m, i) => <li key={i} className="py-1 border-b border-[#EAE4DA]">{m}</li>)}
              </ul>
            </div>
            <div className="lg:col-span-8 space-y-3">
              <h4 className="font-serif text-xl text-[#1C1917]">Studio Steps</h4>
              {diyResult.steps.map((s) => (
                <div key={s.stepNumber} className="py-2 border-b border-[#EAE4DA]">
                  <p className="text-sm font-medium text-[#1C1917]">
                    {String(s.stepNumber).padStart(2, '0')}. {s.title}
                  </p>
                  <p className="text-sm text-[#574F46] mt-0.5">{s.detail}</p>
                </div>
              ))}
              <p className="text-xs italic text-[#7D7368] pt-2">Finishing note: {diyResult.finishingTip}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && tool === 'travel' && travelResult && (
        <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#7D7368]">Best season · {travelResult.bestSeason}</p>
            <h3 className="font-serif text-3xl text-[#1C1917] mt-1">{travelResult.destinationTitle}</h3>
            <p className="text-sm text-[#574F46] mt-2 leading-relaxed">{travelResult.atmosphere}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {travelResult.itinerary.map((day, idx) => (
              <div key={idx} className="p-5 rounded-xl bg-[#FAF7F2] border border-[#DDD5C7] space-y-2.5 text-sm">
                <h4 className="font-serif text-2xl text-[#1C1917]">{day.dayLabel}</h4>
                <p><span className="font-medium text-[#1C1917]">Morning:</span> <span className="text-[#574F46]">{day.morning}</span></p>
                <p><span className="font-medium text-[#1C1917]">Afternoon:</span> <span className="text-[#574F46]">{day.afternoon}</span></p>
                <p><span className="font-medium text-[#1C1917]">Evening:</span> <span className="text-[#574F46]">{day.evening}</span></p>
              </div>
            ))}
          </div>
          <p className="text-sm font-serif italic text-[#574F46] border-t border-[#EAE4DA] pt-4">
            Quiet detour: {travelResult.quietDetour}
          </p>
        </div>
      )}
    </div>
  );
}
