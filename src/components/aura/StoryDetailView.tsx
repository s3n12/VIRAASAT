import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Share2, Sparkles } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type {
  AiStorySummaryResult,
  AuraCategory,
  AuraMood,
  AuraStory,
  StorySection,
} from '../../types/aura';
import {
  EditorialEmptyState,
  EditorialImage,
  StoryReaderSkeleton,
} from './EditorialPrimitives';

const SECTION_TYPE_LABEL: Record<StorySection['type'], string> = {
  editorial_intro: 'Editorial Note',
  step_by_step: 'Step-by-Step Guide',
  recipe: 'Recipe & Measures',
  styling_breakdown: 'Styling Breakdown',
  destination_guide: 'Destination Journal',
  wellness_routine: 'Wellness Ritual',
  diy_instructions: 'Studio DIY Instructions',
  tips_and_materials: 'Tips & Materials',
};

export function StoryDetailView({
  slug,
  moods,
  onSaveStory,
}: {
  slug: string;
  moods: AuraMood[];
  onSaveStory: (story: AuraStory) => void;
}) {
  const { navigate } = useAuraRouter();
  const [story, setStory] = useState<AuraStory | null>(null);
  const [category, setCategory] = useState<AuraCategory | null>(null);
  const [related, setRelated] = useState<AuraStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  // Real Gemini AI Story Summarizer state
  const [summary, setSummary] = useState<AiStorySummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSummary(null);
    setSummaryError(null);
    auraApi
      .getStory(slug)
      .then((res) => {
        if (!active) return;
        setStory(res.story);
        setCategory(res.category);
        setRelated(res.related);
        updateDocumentSeo(`${res.story.title} — AURA`, res.story.excerpt);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Story could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        setReadProgress(0);
        return;
      }
      setReadProgress(Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleShare() {
    if (!story) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: story.title, text: story.excerpt, url });
        return;
      } catch {
        // User canceled native share; fallback to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard rejection
    }
  }

  async function handleSummarize() {
    if (!story) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await auraApi.aiSummarizeStory(story.slug);
      setSummary(res.result);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Unable to summarize story right now.');
    } finally {
      setSummarizing(false);
    }
  }

  if (loading) {
    return <StoryReaderSkeleton />;
  }

  if (error || !story) {
    return (
      <EditorialEmptyState
        title="Editorial story not found"
        description={error || 'This story may have been moved or is currently in editorial draft.'}
        actionLabel="Return to Discover"
        onAction={() => navigate('/discover')}
      />
    );
  }

  const moodLabels = story.moods
    .map((m) => moods.find((x) => x.slug === m)?.label || m)
    .join(' · ');

  return (
    <article className="bg-[#FAF7F2]">
      {/* Thin Editorial Reading Progress Bar */}
      <div
        aria-hidden="true"
        className="fixed top-16 left-0 right-0 z-30 h-[2px] bg-transparent pointer-events-none"
      >
        <div
          className="h-full bg-[#1C1917] transition-all duration-150"
          style={{ width: `${readProgress}%` }}
        />
      </div>

      {/* Story Masthead */}
      <header className="max-w-[1160px] mx-auto px-6 sm:px-8 pt-10 pb-8 space-y-6">
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="inline-flex items-center gap-2 text-xs text-[#574F46] hover:text-[#1C1917] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Discover
        </button>

        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#7D7368]">
            {category && (
              <AuraLink to={`/category/${category.slug}`} className="hover:text-[#1C1917] transition-colors">
                {category.name}
              </AuraLink>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{story.readingMinutes} min read</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(story.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] text-[#1C1917] leading-[1.08] font-normal">
            {story.title}
          </h1>

          <p className="text-base sm:text-lg text-[#574F46] leading-relaxed">
            {story.subtitle}
          </p>
        </div>

        {/* Creator Byline & Story Actions */}
        <div className="pt-4 border-t border-[#DDD5C7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-sm">
            <span className="font-medium text-[#1C1917]">{story.creator.name}</span>
            <span className="text-[#7D7368]">
              {' '}· {story.creator.role}
              {story.creator.location ? ` · ${story.creator.location}` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onSaveStory(story)}
              className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Save to Universe
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Link Copied' : 'Share'}
            </button>

            <button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing}
              className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] disabled:opacity-60 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {summarizing ? 'Summarizing...' : 'Aura AI Summary'}
            </button>
          </div>
        </div>
      </header>

      {/* Full-Bleed Editorial Cover Image */}
      <figure className="max-w-[1280px] mx-auto px-4 sm:px-8 pb-12">
        <div className="aspect-[16/9] rounded-2xl overflow-hidden bg-[#EAE4DA]">
          <EditorialImage
            src={story.coverImage}
            alt={story.title}
            priority
            className="w-full h-full object-cover"
          />
        </div>
        {story.coverCaption && (
          <figcaption className="mt-3 text-xs font-serif italic text-[#7D7368]">
            {story.coverCaption}
          </figcaption>
        )}
      </figure>

      {/* Asymmetric Reading Canvas + Margin Notes */}
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-12 max-w-[68ch]">
          {/* AI Summary Panel (Real Gemini Output, Error & Retry) */}
          {summaryError && (
            <div className="p-5 rounded-xl bg-[#F3EFE8] border border-[#DDD5C7] space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[#8B2E2E]">Aura AI Summary Unavailable</p>
              <p className="text-sm text-[#332B24]">{summaryError}</p>
              <button
                type="button"
                onClick={handleSummarize}
                className="text-xs font-medium text-[#1C1917] underline"
              >
                Retry summary
              </button>
            </div>
          )}

          {summary && (
            <div className="p-6 rounded-2xl bg-[#F3EFE8] border border-[#DDD5C7] space-y-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">
                Aura AI Editorial Digest
              </p>
              <p className="font-serif text-2xl text-[#1C1917] leading-snug">
                {summary.headlineTakeaway}
              </p>
              <ul className="space-y-2 text-sm text-[#332B24] list-disc pl-5">
                {summary.keyHighlights.map((hl, i) => (
                  <li key={i}>{hl}</li>
                ))}
              </ul>
              <p className="text-sm text-[#574F46] pt-2 border-t border-[#DDD5C7]">
                <span className="font-medium text-[#1C1917]">Try this: </span>
                {summary.actionableIdea}
              </p>
            </div>
          )}

          {/* Story Sections */}
          {story.sections.map((section, idx) => (
            <section key={section.id} className="space-y-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">
                {String(idx + 1).padStart(2, '0')} · {SECTION_TYPE_LABEL[section.type]}
              </p>
              <h2 className="font-serif text-3xl text-[#1C1917] leading-snug">
                {section.heading}
              </h2>
              <p
                className={`text-base text-[#332B24] leading-[1.8] ${
                  idx === 0 && section.type === 'editorial_intro' ? 'editorial-dropcap' : ''
                }`}
              >
                {section.body}
              </p>

              {section.items && section.items.length > 0 && (
                <div className="pt-2 space-y-3">
                  {section.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className="flex items-start gap-4 py-3 border-b border-[#EAE4DA] text-sm sm:text-[15px] text-[#332B24] leading-relaxed"
                    >
                      <span className="font-mono text-xs text-[#7D7368] tabular-nums pt-1 shrink-0">
                        {String(itemIdx + 1).padStart(2, '0')}
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {section.note && (
                <p className="pt-2 text-sm font-serif italic text-[#574F46] border-t border-[#DDD5C7]">
                  Curator note: {section.note}
                </p>
              )}
            </section>
          ))}
        </div>

        {/* Right Curatorial Margin Rail */}
        <aside className="lg:col-span-4 space-y-8 lg:pl-6 lg:border-l border-[#DDD5C7]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">Visual Palette</p>
            <div className="grid grid-cols-2 gap-3">
              {story.palette.map((hex) => (
                <div key={hex} className="space-y-1.5">
                  <div
                    className="h-12 rounded-lg border border-[#DDD5C7]"
                    style={{ backgroundColor: hex }}
                  />
                  <p className="font-mono text-xs text-[#574F46] tabular-nums">{hex}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-6 border-t border-[#DDD5C7]">
            <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">Vibes</p>
            <p className="text-sm text-[#332B24] leading-relaxed">{moodLabels}</p>
          </div>

          <div className="space-y-2 pt-6 border-t border-[#DDD5C7]">
            <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">Keywords</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-[#574F46]">
              {story.tags.map((tag) => (
                <AuraLink
                  key={tag}
                  to={`/search?tag=${encodeURIComponent(tag)}`}
                  className="hover:text-[#1C1917] underline-offset-4 hover:underline"
                >
                  {tag}
                </AuraLink>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-[#DDD5C7] space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">Creative Studio</p>
            <p className="text-sm text-[#574F46] leading-relaxed">
              Use this story’s imagery and palette to assemble a visual moodboard in your Universe.
            </p>
            <AuraLink
              to="/moodboards"
              className="inline-block px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors"
            >
              Open Moodboard Studio
            </AuraLink>
          </div>
        </aside>
      </div>

      {/* Related Editorial Stories */}
      {related.length > 0 && (
        <section className="border-t border-[#DDD5C7] bg-[#F3EFE8] py-16">
          <div className="max-w-[1380px] mx-auto px-6 sm:px-8 space-y-8">
            <h2 className="font-serif text-3xl text-[#1C1917]">Related Stories</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {related.map((rel) => (
                <AuraLink key={rel.id} to={`/story/${rel.slug}`} className="group block space-y-3">
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[#EAE4DA]">
                    <EditorialImage
                      src={rel.coverImage}
                      alt={rel.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  </div>
                  <p className="text-xs text-[#7D7368] tabular-nums">{rel.readingMinutes} min read</p>
                  <h3 className="font-serif text-xl text-[#1C1917] group-hover:text-[#8C6A43] transition-colors leading-snug">
                    {rel.title}
                  </h3>
                </AuraLink>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
