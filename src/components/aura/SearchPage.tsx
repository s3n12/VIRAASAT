import React, { useEffect, useState } from 'react';
import { Bookmark, Search as SearchIcon, X } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type { AuraCategory, AuraMood, AuraStory } from '../../types/aura';
import {
  EditorialEmptyState,
  EditorialImage,
  StoryGridSkeleton,
} from './EditorialPrimitives';

export function SearchPage({
  categories,
  moods,
  onSaveStory,
}: {
  categories: AuraCategory[];
  moods: AuraMood[];
  onSaveStory: (story: AuraStory) => void;
}) {
  const { query, navigate } = useAuraRouter();
  const [inputValue, setInputValue] = useState(query.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(query.get('category') || '');
  const [moodFilter, setMoodFilter] = useState(query.get('mood') || '');
  const [tagFilter, setTagFilter] = useState(query.get('tag') || '');

  const [results, setResults] = useState<AuraStory[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    updateDocumentSeo('Search Archive — AURA', 'Search editorial stories across categories, moods, tags, and materials.');
  }, []);

  useEffect(() => {
    setInputValue(query.get('q') || '');
    setCategoryFilter(query.get('category') || '');
    setMoodFilter(query.get('mood') || '');
    setTagFilter(query.get('tag') || '');
  }, [query]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      auraApi
        .searchStories({
          q: inputValue.trim() || undefined,
          category: categoryFilter || undefined,
          mood: moodFilter || undefined,
          tag: tagFilter || undefined,
        })
        .then((res) => {
          if (!active) return;
          setResults(res.results);
          setSuggestions(res.suggestions);
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inputValue, categoryFilter, moodFilter, tagFilter]);

  function clearAll() {
    setInputValue('');
    setCategoryFilter('');
    setMoodFilter('');
    setTagFilter('');
    navigate('/search', { replace: true });
  }

  return (
    <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-12 space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">Archive Search</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">
          Search across stories, moods & craft
        </h1>

        <div className="relative pt-2">
          <SearchIcon className="w-5 h-5 text-[#7D7368] absolute left-4 top-1/2 -translate-y-1/2 mt-1 pointer-events-none" />
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Try travertine, saffron figs, raw silk, morning ritual, or Minimal & Calm..."
            aria-label="Search published stories"
            className="w-full pl-12 pr-12 py-3.5 text-base bg-white border border-[#DDD5C7] rounded-xl text-[#1C1917] placeholder:text-[#7D7368]"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue('')}
              aria-label="Clear search query"
              className="absolute right-3 top-1/2 -translate-y-1/2 mt-1 p-1.5 text-[#7D7368] hover:text-[#1C1917]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Suggestions */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7D7368]">
            <span>Suggested:</span>
            {suggestions.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setInputValue(term)}
                className="text-[#574F46] hover:text-[#1C1917] underline-offset-4 hover:underline"
              >
                {term}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Facet Controls */}
      <div className="flex flex-wrap items-center gap-4 pb-6 border-b border-[#DDD5C7]">
        <div className="flex items-center gap-2">
          <label htmlFor="search-cat" className="text-xs text-[#7D7368]">
            Department
          </label>
          <select
            id="search-cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-[#DDD5C7] rounded-lg text-[#1C1917]"
          >
            <option value="">All departments</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="search-mood" className="text-xs text-[#7D7368]">
            Mood
          </label>
          <select
            id="search-mood"
            value={moodFilter}
            onChange={(e) => setMoodFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-[#DDD5C7] rounded-lg text-[#1C1917]"
          >
            <option value="">All moods</option>
            {moods.map((m) => (
              <option key={m.id} value={m.slug}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {(inputValue || categoryFilter || moodFilter || tagFilter) && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-[#1C1917] underline underline-offset-4"
          >
            Reset all filters
          </button>
        )}

        <span className="ml-auto text-xs text-[#7D7368] tabular-nums">
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </span>
      </div>

      {error && (
        <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>
      )}

      {loading ? (
        <StoryGridSkeleton count={6} />
      ) : results.length === 0 ? (
        <EditorialEmptyState
          title="No matching stories in the archive"
          description="Try a broader keyword such as linen, architecture, wellness, or saffron, or explore one of our suggested vibes."
          actionLabel="Clear search"
          onAction={clearAll}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {results.map((story) => (
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
                <p className="text-xs text-[#7D7368]">
                  {categories.find((c) => c.slug === story.categorySlug)?.name} · {story.readingMinutes} min read
                </p>
                <AuraLink to={`/story/${story.slug}`} className="block">
                  <h2 className="font-serif text-2xl text-[#1C1917] group-hover:text-[#8C6A43] transition-colors leading-snug">
                    {story.title}
                  </h2>
                </AuraLink>
                <p className="text-sm text-[#574F46] line-clamp-2 leading-relaxed">{story.excerpt}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
