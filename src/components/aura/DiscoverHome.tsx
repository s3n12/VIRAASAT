import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Maximize2,
  Search,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type { AuraCategory, AuraMood, AuraStory, MoodSlug } from '../../types/aura';
import {
  EditorialEmptyState,
  EditorialImage,
  StoryGridSkeleton,
} from './EditorialPrimitives';

export function DiscoverHome({
  categories,
  moods,
  initialMood,
  onSaveStory,
}: {
  categories: AuraCategory[];
  moods: AuraMood[];
  initialMood?: MoodSlug | null;
  onSaveStory: (story: AuraStory) => void;
}) {
  const { navigate } = useAuraRouter();
  const [selectedMood, setSelectedMood] = useState<MoodSlug | null>(initialMood ?? null);
  const [stories, setStories] = useState<AuraStory[]>([]);
  const [dailyFeatured, setDailyFeatured] = useState<AuraStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');

  const touchStartX = useRef<number | null>(null);
  const wheelLockRef = useRef<number>(0);

  useEffect(() => {
    updateDocumentSeo(
      'AURA — Discover Your World, One Vibe at a Time',
      'Explore curated editorial stories across interiors, fashion, slow travel, craft, wellness, and culinary living.'
    );
  }, []);

  const loadStories = useCallback(async (mood: MoodSlug | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await auraApi.getStories(mood ? { mood } : undefined);
      setStories(res.stories);
      setDailyFeatured(res.dailyFeatured);
      setActiveIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load curated stories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories(selectedMood);
  }, [selectedMood, loadStories]);

  const deckStories = useMemo(() => {
    const featured = stories.filter((s) => s.featured);
    return featured.length >= 3 ? featured : stories.slice(0, 8);
  }, [stories]);

  const activeStory = deckStories[activeIndex] ?? stories[0] ?? null;
  const activeMoodObj = moods.find((m) => m.slug === selectedMood) ?? null;
  const categoryNameMap = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories]
  );

  const goNext = useCallback(() => {
    if (deckStories.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % deckStories.length);
  }, [deckStories.length]);

  const goPrev = useCallback(() => {
    if (deckStories.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + deckStories.length) % deckStories.length);
  }, [deckStories.length]);

  const handleShuffle = useCallback(() => {
    if (stories.length <= 1) return;
    const pool = stories.filter((s) => s.id !== activeStory?.id);
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    if (!chosen) return;
    const idxInDeck = deckStories.findIndex((s) => s.id === chosen.id);
    if (idxInDeck >= 0) {
      setActiveIndex(idxInDeck);
    } else {
      navigate(`/story/${chosen.slug}`);
    }
  }, [stories, deckStories, activeStory, navigate]);

  // Keyboard navigation on Discover hero
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key.toLowerCase() === 'z' && !e.metaKey && !e.ctrlKey) {
        navigate('/zen');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, navigate]);

  // Subtle horizontal mouse-wheel / trackpad gesture on the full-bleed hero canvas
  const handleHeroWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > 28 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const now = Date.now();
      if (now - wheelLockRef.current < 550) return;
      wheelLockRef.current = now;
      if (e.deltaX > 0) goNext();
      else goPrev();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = touchStartX.current - endX;
    touchStartX.current = null;
    if (Math.abs(delta) > 45) {
      if (delta > 0) goNext();
      else goPrev();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchDraft.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  const continueExploring = useMemo(
    () => stories.filter((s) => s.id !== activeStory?.id),
    [stories, activeStory]
  );

  return (
    <div className="bg-[#FAF7F2]">
      {/* FULL-BLEED EDITORIAL MAGAZINE STAGE */}
      <section
        aria-label="Featured editorial stories"
        onWheel={handleHeroWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full min-h-[78vh] lg:min-h-[85vh] overflow-hidden bg-[#1C1917] flex items-end"
      >
        {activeStory ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStory.id}
              initial={{ opacity: 0.25, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.25 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <EditorialImage
                src={activeStory.coverImage}
                alt={activeStory.title}
                priority
                className="w-full h-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#14110F]/88 via-[#14110F]/35 to-[#14110F]/15"
              />
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="absolute inset-0 bg-[#231E1A] animate-pulse" />
        )}

        {/* Editorial Foreground Copy */}
        <div className="relative z-10 w-full max-w-[1380px] mx-auto px-6 sm:px-10 pt-28 pb-12 sm:pb-16 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
          {activeStory && (
            <div className="max-w-2xl space-y-5 text-[#FAF7F2]">
              <div className="flex flex-wrap items-center gap-2.5 text-xs tracking-widest uppercase text-[#EAE4DA]/90 tabular-nums">
                <span>
                  {String(activeIndex + 1).padStart(2, '0')} / {String(deckStories.length).padStart(2, '0')}
                </span>
                <span aria-hidden="true">·</span>
                <span>{categoryNameMap.get(activeStory.categorySlug) || activeStory.categorySlug}</span>
                <span aria-hidden="true">·</span>
                <span>{activeStory.readingMinutes} min read</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.75rem] font-normal leading-[1.06] tracking-tight text-[#FAF7F2]">
                {activeStory.title}
              </h1>

              <p className="text-sm sm:text-base text-[#EAE4DA]/90 max-w-xl leading-relaxed">
                {activeStory.subtitle}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(`/story/${activeStory.slug}`)}
                  className="px-6 py-3 text-sm font-medium bg-[#FAF7F2] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  Explore Story
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSaveStory(activeStory)}
                  className="px-4 py-3 text-sm font-medium bg-[#1C1917]/55 backdrop-blur-md text-[#FAF7F2] border border-[#FAF7F2]/25 rounded-lg hover:bg-[#1C1917]/80 transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  <Bookmark className="w-4 h-4" />
                  Save
                </button>

                <button
                  type="button"
                  onClick={handleShuffle}
                  className="px-4 py-3 text-sm font-medium bg-[#1C1917]/55 backdrop-blur-md text-[#FAF7F2] border border-[#FAF7F2]/25 rounded-lg hover:bg-[#1C1917]/80 transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  <Shuffle className="w-4 h-4" />
                  Unexpected
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/zen')}
                  className="px-4 py-3 text-sm font-medium bg-[#1C1917]/55 backdrop-blur-md text-[#FAF7F2] border border-[#FAF7F2]/25 rounded-lg hover:bg-[#1C1917]/80 transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  <Maximize2 className="w-4 h-4" />
                  Zen Mode
                </button>
              </div>
            </div>
          )}

          {/* Previous / Next Controls & Subtle Hint */}
          <div className="flex items-center gap-4 self-start lg:self-end shrink-0">
            <span className="hidden sm:inline text-xs text-[#EAE4DA]/75">
              Use arrows or swipe
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous featured story"
                className="w-11 h-11 rounded-full bg-[#1C1917]/60 backdrop-blur-md border border-[#FAF7F2]/25 text-[#FAF7F2] hover:bg-[#FAF7F2] hover:text-[#1C1917] transition-colors flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next featured story"
                className="w-11 h-11 rounded-full bg-[#1C1917]/60 backdrop-blur-md border border-[#FAF7F2]/25 text-[#FAF7F2] hover:bg-[#FAF7F2] hover:text-[#1C1917] transition-colors flex items-center justify-center"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* TUNE YOUR VIBE (REAL MOOD DISCOVERY + SEARCH BAR) */}
      <section className="border-b border-[#DDD5C7] bg-[#F3EFE8]">
        <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">
                Discover your world · One vibe at a time
              </p>
              <h2 className="font-serif text-3xl text-[#1C1917] mt-1">Tune Your Vibe</h2>
            </div>

            <form onSubmit={handleSearchSubmit} className="w-full lg:w-96 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#7D7368] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search stories, moods, rituals, materials..."
                  aria-label="Search AURA stories"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg text-[#1C1917] placeholder:text-[#7D7368]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap"
              >
                Search
              </button>
            </form>
          </div>

          {/* Interactive Mood Filter Buttons */}
          <div
            role="tablist"
            aria-label="Mood selector"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedMood === null}
              onClick={() => setSelectedMood(null)}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedMood === null
                  ? 'bg-[#1C1917] text-[#FAF7F2]'
                  : 'bg-[#FAF7F2] text-[#574F46] hover:text-[#1C1917] border border-[#DDD5C7]'
              }`}
            >
              All Vibes
            </button>
            {moods.map((mood) => {
              const active = selectedMood === mood.slug;
              return (
                <button
                  key={mood.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedMood(mood.slug)}
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1C1917] text-[#FAF7F2]'
                      : 'bg-[#FAF7F2] text-[#574F46] hover:text-[#1C1917] border border-[#DDD5C7]'
                  }`}
                >
                  {mood.label}
                </button>
              );
            })}
          </div>

          {activeMoodObj && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-[#DDD5C7]">
              <div className="flex items-center gap-4">
                <div className="flex items-center -space-x-1" aria-hidden="true">
                  {activeMoodObj.palette.map((hex) => (
                    <span
                      key={hex}
                      className="w-5 h-5 rounded-full border border-[#FAF7F2]"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                <p className="text-sm text-[#332B24]">{activeMoodObj.shortDescriptor}</p>
              </div>
              <AuraLink
                to={`/ai-studio?mood=${activeMoodObj.slug}`}
                className="text-xs font-medium text-[#1C1917] hover:text-[#8C6A43] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Curate this vibe with Aura AI
              </AuraLink>
            </div>
          )}
        </div>
      </section>

      {/* EDITORIAL CATEGORIES STRIP */}
      <section className="max-w-[1380px] mx-auto px-6 sm:px-8 pt-12 pb-6">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="font-serif text-2xl text-[#1C1917]">Curated Departments</h2>
          <AuraLink
            to="/search"
            className="text-xs text-[#574F46] hover:text-[#1C1917] transition-colors whitespace-nowrap"
          >
            Browse full archive
          </AuraLink>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
          {categories.map((cat) => (
            <AuraLink
              key={cat.id}
              to={`/category/${cat.slug}`}
              className="group block space-y-2"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[#EAE4DA]">
                <EditorialImage
                  src={cat.coverImage}
                  alt={cat.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-[#1C1917] group-hover:text-[#8C6A43] transition-colors truncate">
                  {cat.name}
                </p>
                <p className="text-[11px] text-[#7D7368] tabular-nums">
                  {cat.storyCount ?? 0} stories
                </p>
              </div>
            </AuraLink>
          ))}
        </div>
      </section>

      {/* DAILY FEATURED STORY */}
      {dailyFeatured && !selectedMood && (
        <section className="max-w-[1380px] mx-auto px-6 sm:px-8 py-14 border-t border-[#DDD5C7] mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7">
              <AuraLink
                to={`/story/${dailyFeatured.slug}`}
                className="block h-full min-h-[340px] rounded-2xl overflow-hidden bg-[#EAE4DA] group"
              >
                <EditorialImage
                  src={dailyFeatured.coverImage}
                  alt={dailyFeatured.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                />
              </AuraLink>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between py-2 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#7D7368]">
                  <span>Daily Featured Story</span>
                  <span aria-hidden="true">·</span>
                  <span>{categoryNameMap.get(dailyFeatured.categorySlug)}</span>
                </div>

                <h2 className="font-serif text-3xl sm:text-4xl text-[#1C1917] leading-[1.12]">
                  {dailyFeatured.title}
                </h2>

                <p className="text-sm sm:text-base text-[#574F46] leading-relaxed">
                  {dailyFeatured.excerpt}
                </p>

                <div className="flex items-center gap-2 text-xs text-[#7D7368] pt-2">
                  <span>By {dailyFeatured.creator.name}</span>
                  <span aria-hidden="true">·</span>
                  <span>{dailyFeatured.readingMinutes} min read</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-[#DDD5C7]">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#7D7368]">Story Palette</span>
                  <div className="flex items-center gap-1.5">
                    {dailyFeatured.palette.map((hex) => (
                      <span
                        key={hex}
                        title={hex}
                        className="w-5 h-5 rounded-full border border-[#DDD5C7]"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/story/${dailyFeatured.slug}`)}
                    className="px-5 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap"
                  >
                    Read Monograph
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveStory(dailyFeatured)}
                    className="px-4 py-2.5 text-sm font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors whitespace-nowrap"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CONTINUE EXPLORING EDITORIAL GALLERY */}
      <section className="max-w-[1380px] mx-auto px-6 sm:px-8 py-14 border-t border-[#DDD5C7]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">
              {activeMoodObj ? `Filtered by ${activeMoodObj.label}` : 'Curated Visual Archive'}
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl text-[#1C1917] mt-1">
              Continue Exploring
            </h2>
          </div>
          <p className="text-xs text-[#7D7368] tabular-nums">
            Showing {continueExploring.length} editorial {continueExploring.length === 1 ? 'story' : 'stories'}
          </p>
        </div>

        {error && (
          <div className="p-6 rounded-xl bg-[#8B2E2E]/8 text-[#8B2E2E] text-sm flex items-center justify-between gap-4 mb-8">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadStories(selectedMood)}
              className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <StoryGridSkeleton count={6} />
        ) : continueExploring.length === 0 ? (
          <EditorialEmptyState
            title="No stories match this vibe yet"
            description="Reset the mood selector to browse the full editorial collection, or ask Aura AI to generate a bespoke moodboard."
            actionLabel="Show all stories"
            onAction={() => setSelectedMood(null)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {continueExploring.map((story, idx) => (
              <article
                key={story.id}
                className={`group flex flex-col ${idx === 0 ? 'md:col-span-2 lg:col-span-2' : ''}`}
              >
                <div className="relative rounded-2xl overflow-hidden bg-[#EAE4DA]">
                  <AuraLink
                    to={`/story/${story.slug}`}
                    className={`block ${idx === 0 ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}
                  >
                    <EditorialImage
                      src={story.coverImage}
                      alt={story.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                    />
                  </AuraLink>
                  <button
                    type="button"
                    onClick={() => onSaveStory(story)}
                    aria-label={`Save ${story.title}`}
                    className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-[#FAF7F2]/90 backdrop-blur-sm text-[#1C1917] hover:bg-[#1C1917] hover:text-[#FAF7F2] transition-colors flex items-center justify-center shadow-sm"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-4 space-y-2 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 text-xs text-[#7D7368]">
                    <span>{categoryNameMap.get(story.categorySlug) || story.categorySlug}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{story.readingMinutes} min read</span>
                    <span aria-hidden="true">·</span>
                    <span>{story.creator.name}</span>
                  </div>

                  <AuraLink to={`/story/${story.slug}`} className="block">
                    <h3
                      className={`font-serif text-[#1C1917] group-hover:text-[#8C6A43] transition-colors leading-snug ${
                        idx === 0 ? 'text-2xl sm:text-3xl' : 'text-2xl'
                      }`}
                    >
                      {story.title}
                    </h3>
                  </AuraLink>

                  <p className="text-sm text-[#574F46] leading-relaxed line-clamp-2">
                    {story.excerpt}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
