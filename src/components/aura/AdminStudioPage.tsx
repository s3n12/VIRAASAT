import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type {
  AuraCategory,
  AuraMood,
  AuraProfile,
  AuraStory,
  CategorySlug,
  MoodSlug,
  StorySectionType,
} from '../../types/aura';
import { EditorialEmptyState, EditorialImage, StoryGridSkeleton } from './EditorialPrimitives';

const SECTION_TYPES: Array<{ value: StorySectionType; label: string }> = [
  { value: 'editorial_intro', label: 'Editorial Introduction' },
  { value: 'step_by_step', label: 'Step-by-Step Guide' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'styling_breakdown', label: 'Styling Breakdown' },
  { value: 'destination_guide', label: 'Destination Guide' },
  { value: 'wellness_routine', label: 'Wellness Routine' },
  { value: 'diy_instructions', label: 'DIY Instructions' },
  { value: 'tips_and_materials', label: 'Tips & Materials' },
];

interface SectionDraft {
  id?: string;
  type: StorySectionType;
  heading: string;
  body: string;
  itemsText: string;
  note: string;
}

export function AdminStudioPage({
  mode,
  storyId,
  user,
  categories,
  moods,
}: {
  mode: 'list' | 'new' | 'edit';
  storyId?: string;
  user: AuraProfile | null;
  categories: AuraCategory[];
  moods: AuraMood[];
}) {
  const { navigate } = useAuraRouter();
  const [stories, setStories] = useState<AuraStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Story form state
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [coverImage, setCoverImage] = useState('/src/assets/images/aura_hero_home_living_1795577433853.jpg');
  const [coverCaption, setCoverCaption] = useState('');
  const [categorySlug, setCategorySlug] = useState<CategorySlug>('home-and-living');
  const [tagsText, setTagsText] = useState('editorial, quiet luxury, tactile');
  const [selectedMoods, setSelectedMoods] = useState<MoodSlug[]>(['minimal-and-calm']);
  const [readingMinutes, setReadingMinutes] = useState(5);
  const [creatorName, setCreatorName] = useState(user?.displayName || 'AURA Editorial');
  const [creatorRole, setCreatorRole] = useState('Editorial Contributor');
  const [creatorLocation, setCreatorLocation] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [featured, setFeatured] = useState(false);
  const [dailyFeatured, setDailyFeatured] = useState(false);
  const [sections, setSections] = useState<SectionDraft[]>([
    {
      type: 'editorial_intro',
      heading: 'Opening Note',
      body: '',
      itemsText: '',
      note: '',
    },
  ]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    updateDocumentSeo('Admin Content Studio — AURA', 'Protected editorial publishing studio for AURA.');
  }, []);

  const loadStories = useCallback(async () => {
    if (!user || user.role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await auraApi.adminGetStories();
      setStories(res.stories);
      if (mode === 'edit' && storyId) {
        const target = res.stories.find((s) => s.id === storyId);
        if (target) {
          setTitle(target.title);
          setSubtitle(target.subtitle);
          setExcerpt(target.excerpt);
          setCoverImage(target.coverImage);
          setCoverCaption(target.coverCaption);
          setCategorySlug(target.categorySlug);
          setTagsText(target.tags.join(', '));
          setSelectedMoods(target.moods);
          setReadingMinutes(target.readingMinutes);
          setCreatorName(target.creator.name);
          setCreatorRole(target.creator.role);
          setCreatorLocation(target.creator.location);
          setStatus(target.status);
          setFeatured(target.featured);
          setDailyFeatured(Boolean(target.dailyFeatured));
          setSections(
            target.sections.map((sec) => ({
              id: sec.id,
              type: sec.type,
              heading: sec.heading,
              body: sec.body,
              itemsText: (sec.items || []).join('\n'),
              note: sec.note || '',
            }))
          );
        } else {
          setError('Story not found.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin studio.');
    } finally {
      setLoading(false);
    }
  }, [user, mode, storyId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  if (!user) {
    return (
      <EditorialEmptyState
        title="Editorial Studio Sign-In Required"
        description="Sign in with an authorized administrator account. Admin privileges are strictly verified on the server and database."
        actionLabel="Sign in"
        onAction={() => navigate('/auth/sign-in')}
      />
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[#8B2E2E]">Access Restricted</p>
        <h1 className="font-serif text-4xl text-[#1C1917]">Administrator Role Required</h1>
        <p className="text-sm text-[#574F46] leading-relaxed">
          Signed in as <span className="font-medium text-[#1C1917]">{user.email}</span> ({user.role}). To grant editorial admin access, add this email to <code className="font-mono text-xs">ADMIN_EMAILS</code> in server secrets or update <code className="font-mono text-xs">public.profiles.role = 'admin'</code> via Supabase SQL.
        </p>
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="px-5 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg"
        >
          Return to Discover
        </button>
      </div>
    );
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Cover image must be 5MB or smaller.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
      });
      const res = await auraApi.uploadMedia({
        bucket: 'story-covers',
        mimeType: file.type,
        dataBase64: dataUrl,
      });
      setCoverImage(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function toggleMood(slug: MoodSlug) {
    setSelectedMoods((prev) => {
      if (prev.includes(slug)) {
        return prev.length > 1 ? prev.filter((m) => m !== slug) : prev;
      }
      return [...prev, slug].slice(0, 5);
    });
  }

  async function handleSubmitStory(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        excerpt: excerpt.trim(),
        coverImage: coverImage.trim(),
        coverCaption: coverCaption.trim(),
        categorySlug,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        moods: selectedMoods,
        readingMinutes: Number(readingMinutes) || 5,
        creatorName: creatorName.trim() || 'AURA Editorial',
        creatorRole: creatorRole.trim() || 'Editorial Contributor',
        creatorLocation: creatorLocation.trim(),
        sections: sections.map((sec) => ({
          id: sec.id,
          type: sec.type,
          heading: sec.heading.trim(),
          body: sec.body.trim(),
          items: sec.itemsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          note: sec.note.trim() || undefined,
        })),
        status,
        featured,
        dailyFeatured,
      };

      if (mode === 'edit' && storyId) {
        await auraApi.adminUpdateStory(storyId, payload);
        setNotice('Story updated.');
      } else {
        await auraApi.adminCreateStory(payload);
        navigate('/admin/stories');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save story.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFlag(
    id: string,
    patch: { status?: 'draft' | 'published'; featured?: boolean; dailyFeatured?: boolean }
  ) {
    try {
      const res = await auraApi.adminToggleStoryFlags(id, patch);
      setStories((prev) => prev.map((s) => (s.id === id ? res.story : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Flag update failed.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await auraApi.adminDeleteStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  // CREATE / EDIT FORM VIEW
  if (mode === 'new' || mode === 'edit') {
    return (
      <div className="max-w-4xl mx-auto px-6 sm:px-8 py-12 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/stories')}
            className="inline-flex items-center gap-2 text-xs text-[#574F46] hover:text-[#1C1917]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Stories
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] rounded-lg hover:bg-[#EAE4DA] inline-flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            {previewOpen ? 'Back to Editor' : 'Live Preview'}
          </button>
        </div>

        <h1 className="font-serif text-4xl text-[#1C1917]">
          {mode === 'edit' ? 'Edit Editorial Story' : 'Compose New Story'}
        </h1>

        {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}
        {notice && <p className="p-4 rounded-xl bg-[#2F5D46]/10 text-sm text-[#2F5D46]">{notice}</p>}

        {previewOpen ? (
          <div className="p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-6">
            <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368]">
              {categories.find((c) => c.slug === categorySlug)?.name} · {readingMinutes} min read · {status}
            </p>
            <h2 className="font-serif text-4xl text-[#1C1917]">{title || 'Untitled Story'}</h2>
            <p className="text-base text-[#574F46]">{subtitle}</p>
            <div className="aspect-[16/9] rounded-xl overflow-hidden bg-[#EAE4DA]">
              <EditorialImage src={coverImage} alt={title} className="w-full h-full object-cover" />
            </div>
            {sections.map((sec, idx) => (
              <div key={idx} className="space-y-2 pt-4 border-t border-[#EAE4DA]">
                <h3 className="font-serif text-2xl text-[#1C1917]">{sec.heading}</h3>
                <p className="text-sm text-[#332B24] leading-relaxed">{sec.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmitStory} className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-[#DDD5C7] space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#574F46] mb-1">Editorial Headline</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#574F46] mb-1">Subtitle / Descriptive Hook</label>
                <input
                  type="text"
                  required
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#574F46] mb-1">Excerpt</label>
                <textarea
                  rows={2}
                  required
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#574F46] mb-1">Department</label>
                  <select
                    value={categorySlug}
                    onChange={(e) => setCategorySlug(e.target.value as CategorySlug)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#574F46] mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    required
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-[#574F46] mb-2">Moods (select 1–5)</span>
                <div className="flex flex-wrap gap-2">
                  {moods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMood(m.slug)}
                      className={`px-3 py-1.5 text-xs rounded-lg ${
                        selectedMoods.includes(m.slug)
                          ? 'bg-[#1C1917] text-[#FAF7F2]'
                          : 'bg-[#F3EFE8] text-[#574F46] border border-[#DDD5C7]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-9">
                  <label className="block text-xs font-medium text-[#574F46] mb-1">Cover Image Path or HTTPS URL</label>
                  <input
                    type="text"
                    required
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="w-full py-2.5 px-3 text-xs font-medium border border-[#DDD5C7] rounded-lg hover:bg-[#EAE4DA] cursor-pointer inline-flex items-center justify-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload Cover'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleCoverUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#574F46] mb-1">Creator Name</label>
                  <input
                    type="text"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#574F46] mb-1">Creator Role</label>
                  <input
                    type="text"
                    value={creatorRole}
                    onChange={(e) => setCreatorRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#574F46] mb-1">Reading Time (min)</label>
                  <input
                    type="number"
                    min={1}
                    max={45}
                    value={readingMinutes}
                    onChange={(e) => setReadingMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-[#332B24]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={status === 'published'}
                    onChange={(e) => setStatus(e.target.checked ? 'published' : 'draft')}
                  />
                  Published publicly
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                  Feature on Discover homepage
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dailyFeatured}
                    onChange={(e) => setDailyFeatured(e.target.checked)}
                  />
                  Set as Daily Featured Story
                </label>
              </div>
            </div>

            {/* Dynamic Story Sections Builder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-[#1C1917]">Story Sections</h2>
                <button
                  type="button"
                  onClick={() =>
                    setSections((prev) => [
                      ...prev,
                      { type: 'step_by_step', heading: '', body: '', itemsText: '', note: '' },
                    ])
                  }
                  className="px-3.5 py-2 text-xs font-medium border border-[#DDD5C7] rounded-lg hover:bg-[#EAE4DA] inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Section
                </button>
              </div>

              {sections.map((sec, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-white border border-[#DDD5C7] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <select
                      value={sec.type}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, type: e.target.value as StorySectionType } : s))
                        )
                      }
                      className="px-3 py-1.5 text-xs bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                    >
                      {SECTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSections((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-[#8B2E2E] hover:underline"
                      >
                        Remove section
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={sec.heading}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, heading: e.target.value } : s))
                      )
                    }
                    placeholder="Section heading..."
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                  <textarea
                    rows={3}
                    required
                    value={sec.body}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, body: e.target.value } : s))
                      )
                    }
                    placeholder="Editorial prose..."
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                  <textarea
                    rows={3}
                    value={sec.itemsText}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, itemsText: e.target.value } : s))
                      )
                    }
                    placeholder="Optional steps, ingredients, or materials (one item per line)..."
                    className="w-full px-3.5 py-2 text-xs bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Story...' : mode === 'edit' ? 'Update Story' : 'Publish / Save Story'}
            </button>
          </form>
        )}
      </div>
    );
  }

  // ADMIN STORIES LIST VIEW (/admin & /admin/stories)
  return (
    <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-12 space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 border-b border-[#DDD5C7]">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">Protected Admin Content Studio</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">Editorial Archive</h1>
        </div>
        <AuraLink
          to="/admin/stories/new"
          className="px-5 py-2.5 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-end"
        >
          <Plus className="w-4 h-4" />
          New Editorial Story
        </AuraLink>
      </header>

      {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}

      {loading ? (
        <StoryGridSkeleton count={3} />
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-[#DDD5C7]">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#DDD5C7] text-xs uppercase tracking-wider text-[#7D7368]">
                <th className="py-3.5 px-5">Story</th>
                <th className="py-3.5 px-4">Department</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Featured</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE4DA]">
              {stories.map((story) => (
                <tr key={story.id} className="hover:bg-[#FAF7F2]">
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <EditorialImage
                        src={story.coverImage}
                        alt={story.title}
                        className="w-12 h-9 rounded object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-[#1C1917] truncate max-w-md">{story.title}</p>
                        <p className="text-xs text-[#7D7368] tabular-nums">{story.readingMinutes} min · {story.creator.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-[#574F46] whitespace-nowrap">
                    {categories.find((c) => c.slug === story.categorySlug)?.name}
                  </td>
                  <td className="py-3.5 px-4">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleFlag(story.id, {
                          status: story.status === 'published' ? 'draft' : 'published',
                        })
                      }
                      className="text-xs underline underline-offset-4 text-[#1C1917]"
                    >
                      {story.status === 'published' ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td className="py-3.5 px-4">
                    <button
                      type="button"
                      onClick={() => handleToggleFlag(story.id, { featured: !story.featured })}
                      aria-label="Toggle homepage featured"
                      className={`p-1.5 rounded-lg ${story.featured ? 'text-[#8C6A43]' : 'text-[#CCC2B4]'}`}
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  </td>
                  <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-2">
                    <AuraLink
                      to={`/admin/stories/${story.id}/edit`}
                      className="inline-flex items-center gap-1 text-xs text-[#1C1917] hover:underline"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </AuraLink>
                    <button
                      type="button"
                      onClick={() => handleDelete(story.id)}
                      className="inline-flex items-center gap-1 text-xs text-[#8B2E2E] hover:underline ml-3"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
