import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo } from '../../lib/router';
import type { AuraCategory, AuraMood, AuraStory, MoodSlug } from '../../types/aura';
import {
  EditorialEmptyState,
  EditorialImage,
  StoryGridSkeleton,
} from './EditorialPrimitives';

export function CategoryPage({
  slug,
  categories,
  moods,
  onSaveStory,
}: {
  slug: string;
  categories: AuraCategory[];
  moods: AuraMood[];
  onSaveStory: (story: AuraStory) => void;
}) {
  const [stories, setStories] = useState<AuraStory[]>([]);
  const [selectedMood, setSelectedMood] = useState<MoodSlug | ''>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentCategory = useMemo(
    () => categories.find((c) => c.slug === slug) ?? categories[0] ?? null,
    [categories, slug]
  );

  useEffect(() => {
    setSelectedMood('');
    setSelectedTag('');
  }, [slug]);

  useEffect(() => {
    if (!currentCategory) return;
    updateDocumentSeo(
      `${currentCategory.name} — AURA Editorial`,
      currentCategory.description
    );
    let active = true;
    setLoading(true);
    setError(null);
    auraApi
      .getStories({
        category: currentCategory.slug,
        mood: selectedMood || undefined,
        tag: selectedTag || undefined,
      })
      .then((res) => {
        if (active) setStories(res.stories);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load category stories.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentCategory, selectedMood, selectedTag]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of stories) {
      for (const t of s.tags) set.add(t);
    }
    return Array.from(set).slice(0, 10);
  }, [stories]);

  if (!currentCategory) {
    return (
      <div className="max-w-[1380px] mx-auto px-6 py-20">
        <StoryGridSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="bg-[#FAF7F2]">
      {/* Category Switcher Rail */}
      <div className="border-b border-[#DDD5C7] bg-[#F3EFE8]">
        <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-4 flex items-center gap-6 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const active = cat.slug === currentCategory.slug;
            return (
              <AuraLink
                key={cat.id}
                to={`/category/${cat.slug}`}
                className={`text-xs whitespace-nowrap shrink-0 pb-1 border-b transition-colors ${
                  active
                    ? 'text-[#1C1917] font-semibold border-[#1C1917]'
                    : 'text-[#574F46] border-transparent hover:text-[#1C1917]'
                }`}
              >
                {cat.name}
              </AuraLink>
            );
          })}
        </div>
      </div>

      {/* Category Editorial Banner */}
      <section className="max-w-[1380px] mx-auto px-6 sm:px-8 pt-12 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">AURA Department</p>
            <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917] leading-tight">
              {currentCategory.name}
            </h1>
            <p className="font-serif italic text-xl text-[#574F46]">{currentCategory.tagline}</p>
            <p className="text-sm sm:text-base text-[#574F46] leading-relaxed max-w-xl">
              {currentCategory.description}
            </p>
          </div>
          <div className="lg:col-span-6">
            <div className="aspect-[16/9] lg:h-full rounded-2xl overflow-hidden bg-[#EAE4DA]">
              <EditorialImage
                src={currentCategory.coverImage}
                alt={currentCategory.name}
                priority
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Mood & Tag Filter Controls */}
      <section className="max-w-[1380px] mx-auto px-6 sm:px-8 py-6 border-y border-[#DDD5C7] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedMood('')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              selectedMood === ''
                ? 'bg-[#1C1917] text-[#FAF7F2]'
                : 'bg-[#F3EFE8] text-[#574F46] hover:text-[#1C1917]'
            }`}
          >
            All Moods
          </button>
          {moods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedMood(m.slug)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                selectedMood === m.slug
                  ? 'bg-[#1C1917] text-[#FAF7F2]'
                  : 'bg-[#F3EFE8] text-[#574F46] hover:text-[#1C1917]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {availableTags.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="cat-tag-filter" className="text-xs text-[#7D7368]">
              Tag
            </label>
            <select
              id="cat-tag-filter"
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-[#DDD5C7] rounded-lg text-[#1C1917]"
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Curated Stories Grid */}
      <section className="max-w-[1380px] mx-auto px-6 sm:px-8 py-14">
        {error && (
          <p className="mb-6 p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>
        )}

        {loading ? (
          <StoryGridSkeleton count={6} />
        ) : stories.length === 0 ? (
          <EditorialEmptyState
            title="No stories match this filter combination"
            description="Clear the active mood or tag filter to explore all editorial features in this department."
            actionLabel="Reset filters"
            onAction={() => {
              setSelectedMood('');
              setSelectedTag('');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {stories.map((story) => (
              <article key={story.id} className="group flex flex-col">
                <div className="relative rounded-2xl overflow-hidden bg-[#EAE4DA]">
                  <AuraLink to={`/story/${story.slug}`} className="block aspect-[4/3]">
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
                    className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-[#FAF7F2]/90 text-[#1C1917] hover:bg-[#1C1917] hover:text-[#FAF7F2] transition-colors flex items-center justify-center"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[#7D7368]">
                    <span className="tabular-nums">{story.readingMinutes} min read</span>
                    <span aria-hidden="true">·</span>
                    <span>{story.creator.name}</span>
                  </div>
                  <AuraLink to={`/story/${story.slug}`} className="block">
                    <h2 className="font-serif text-2xl text-[#1C1917] group-hover:text-[#8C6A43] transition-colors leading-snug">
                      {story.title}
                    </h2>
                  </AuraLink>
                  <p className="text-sm text-[#574F46] leading-relaxed line-clamp-2">
                    {story.excerpt}
                  </p>
                  <p className="text-xs text-[#7D7368] pt-1">
                    {story.tags.slice(0, 4).join(' · ')}
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
