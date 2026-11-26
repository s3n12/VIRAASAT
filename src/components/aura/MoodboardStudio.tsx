import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  ImagePlus,
  Palette,
  Plus,
  Save,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type {
  AuraMood,
  AuraMoodboard,
  AuraProfile,
  AuraStory,
  MoodSlug,
  MoodboardItem,
} from '../../types/aura';
import {
  EditorialEmptyState,
  EditorialImage,
  StoryGridSkeleton,
} from './EditorialPrimitives';

export function MoodboardStudio({
  moodboardId,
  user,
  moods,
}: {
  moodboardId?: string;
  user: AuraProfile | null;
  moods: AuraMood[];
}) {
  const { navigate } = useAuraRouter();
  const [boards, setBoards] = useState<AuraMoodboard[]>([]);
  const [stories, setStories] = useState<AuraStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Active editor state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [moodSlug, setMoodSlug] = useState<MoodSlug | ''>('');
  const [palette, setPalette] = useState<Array<{ name: string; hex: string; role: string }>>([]);
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Add note & palette generation controls
  const [noteInput, setNoteInput] = useState('');
  const [palettePrompt, setPalettePrompt] = useState('');
  const [generatingPalette, setGeneratingPalette] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showStoryPicker, setShowStoryPicker] = useState(false);

  // New board quick create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    updateDocumentSeo(
      moodboardId ? 'Moodboard Canvas — AURA Studio' : 'AI Moodboard Studio — AURA',
      'Assemble visual moodboards with editorial photography, personal notes, and Gemini AI color palettes.'
    );
  }, [moodboardId]);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [storiesRes, boardData] = await Promise.all([
        auraApi.getStories(),
        moodboardId ? auraApi.getMoodboard(moodboardId) : auraApi.getMoodboards(),
      ]);
      setStories(storiesRes.stories);
      if (moodboardId && 'moodboard' in boardData) {
        const b = boardData.moodboard;
        setTitle(b.title);
        setDescription(b.description);
        setMoodSlug(b.moodSlug || '');
        setPalette(b.palette || []);
        setItems(b.items || []);
      } else if ('moodboards' in boardData) {
        setBoards(boardData.moodboards);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load moodboards.');
    } finally {
      setLoading(false);
    }
  }, [user, moodboardId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center space-y-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">AI Moodboard Studio</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">
          Compose tactile visual boards
        </h1>
        <p className="text-sm sm:text-base text-[#574F46] leading-relaxed">
          Sign in to arrange saved story photography, upload textures, write editorial notes, and generate harmonious color palettes with Gemini AI.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/auth/sign-in')}
            className="px-6 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => navigate('/ai-studio')}
            className="px-6 py-2.5 text-sm font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors"
          >
            Try AI Aura Assistant
          </button>
        </div>
      </div>
    );
  }

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setError(null);
    try {
      const res = await auraApi.createMoodboard({
        title: newTitle.trim(),
        description: newDesc.trim(),
      });
      navigate(`/moodboards/${res.moodboard.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create moodboard.');
    }
  }

  async function handleSaveBoard() {
    if (!moodboardId || !title.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await auraApi.updateMoodboard(moodboardId, {
        title: title.trim(),
        description: description.trim(),
        moodSlug: moodSlug || undefined,
        palette,
        items: items.map((it) => ({
          id: it.id,
          kind: it.kind,
          storyId: it.storyId,
          imageUrl: it.imageUrl,
          title: it.title,
          note: it.note,
          hexColor: it.hexColor,
          span: it.span,
        })),
      });
      setItems(res.moodboard.items);
      setNotice('Moodboard saved.');
      setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save moodboard.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBoard(id: string) {
    try {
      await auraApi.deleteMoodboard(id);
      if (moodboardId) {
        navigate('/moodboards');
      } else {
        setBoards((prev) => prev.filter((b) => b.id !== id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete moodboard.');
    }
  }

  function addStoryImage(story: AuraStory) {
    const newItem: MoodboardItem = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      moodboardId: moodboardId || '',
      kind: 'story_image',
      storyId: story.id,
      imageUrl: story.coverImage,
      title: story.title,
      span: items.length === 0 ? 'wide' : 'standard',
      sortOrder: items.length + 1,
    };
    setItems((prev) => [...prev, newItem]);
    setShowStoryPicker(false);
  }

  function addTextNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteInput.trim()) return;
    const newItem: MoodboardItem = {
      id: `local_${Date.now()}`,
      moodboardId: moodboardId || '',
      kind: 'text_note',
      note: noteInput.trim(),
      span: 'standard',
      sortOrder: items.length + 1,
    };
    setItems((prev) => [...prev, newItem]);
    setNoteInput('');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5MB or smaller.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
      const res = await auraApi.uploadMedia({
        bucket: 'moodboard-assets',
        mimeType: file.type,
        dataBase64: dataUrl,
      });
      setItems((prev) => [
        ...prev,
        {
          id: `local_${Date.now()}`,
          moodboardId: moodboardId || '',
          kind: 'uploaded_image',
          imageUrl: res.url,
          title: file.name.replace(/\.[^.]+$/, ''),
          span: 'standard',
          sortOrder: prev.length + 1,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleGenerateAiPalette() {
    const prompt = palettePrompt.trim() || `${title} ${description}`.trim();
    if (prompt.length < 3) {
      setError('Add a moodboard title or palette prompt first.');
      return;
    }
    setGeneratingPalette(true);
    setError(null);
    try {
      const res = await auraApi.aiPalette(prompt);
      setPalette(
        res.result.swatches.map((s) => ({
          name: s.name,
          hex: s.hex,
          role: s.role,
        }))
      );
      setNotice(`Generated "${res.result.themeName}" palette — click Save Board to persist.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gemini AI palette generation failed.');
    } finally {
      setGeneratingPalette(false);
    }
  }

  function cycleSpan(id: string) {
    const order: MoodboardItem['span'][] = ['standard', 'wide', 'tall'];
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = order[(order.indexOf(it.span) + 1) % order.length];
        return { ...it, span: next };
      })
    );
  }

  function moveItem(index: number, delta: number) {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= items.length) return;
    const copy = [...items];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setItems(copy);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // EDITOR VIEW: /moodboards/:id
  if (moodboardId) {
    return (
      <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/moodboards')}
            className="inline-flex items-center gap-2 text-xs text-[#574F46] hover:text-[#1C1917]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Moodboards
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveBoard}
              disabled={saving}
              className="px-5 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Board'}
            </button>
            <button
              type="button"
              onClick={() => handleDeleteBoard(moodboardId)}
              className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#8B2E2E] rounded-lg hover:bg-[#8B2E2E]/10 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>

        {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}
        {notice && <p className="p-4 rounded-xl bg-[#2F5D46]/10 text-sm text-[#2F5D46]">{notice}</p>}

        {loading ? (
          <StoryGridSkeleton count={3} />
        ) : (
          <>
            {/* Board Header Metadata */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8 border-b border-[#DDD5C7]">
              <div className="lg:col-span-8 space-y-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Moodboard title..."
                  aria-label="Moodboard title"
                  className="w-full font-serif text-3xl sm:text-4xl text-[#1C1917] bg-transparent border-b border-transparent focus:border-[#DDD5C7] pb-1"
                />
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the sensory direction, materials, light, and occasion..."
                  aria-label="Moodboard description"
                  className="w-full text-sm text-[#574F46] bg-transparent border border-[#DDD5C7] rounded-xl px-3.5 py-2.5"
                />
              </div>

              <div className="lg:col-span-4 space-y-3">
                <label htmlFor="mb-mood" className="block text-xs uppercase tracking-[0.14em] text-[#7D7368]">
                  Primary Vibe
                </label>
                <select
                  id="mb-mood"
                  value={moodSlug}
                  onChange={(e) => setMoodSlug(e.target.value as MoodSlug | '')}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DDD5C7] rounded-lg"
                >
                  <option value="">Open Editorial</option>
                  {moods.map((m) => (
                    <option key={m.id} value={m.slug}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Workspace Toolbar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-5 rounded-2xl bg-[#F3EFE8] border border-[#DDD5C7]">
              <div className="lg:col-span-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowStoryPicker((v) => !v)}
                  className="px-3.5 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Add Story Photo
                </button>

                <label className="px-3.5 py-2 text-xs font-medium bg-[#FAF7F2] border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading...' : 'Upload Asset'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <form onSubmit={addTextNote} className="lg:col-span-4 flex items-center gap-2">
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Add an editorial note card..."
                  className="flex-1 px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-medium border border-[#DDD5C7] bg-[#FAF7F2] rounded-lg hover:bg-[#EAE4DA] inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  Add Note
                </button>
              </form>

              <div className="lg:col-span-4 flex items-center gap-2">
                <input
                  type="text"
                  value={palettePrompt}
                  onChange={(e) => setPalettePrompt(e.target.value)}
                  placeholder="Palette mood (e.g. Jaipur sandstone dusk)"
                  className="flex-1 px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
                <button
                  type="button"
                  disabled={generatingPalette}
                  onClick={handleGenerateAiPalette}
                  className="px-3 py-2 text-xs font-medium bg-[#8C6A43] text-[#FAF7F2] rounded-lg hover:bg-[#755736] disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {generatingPalette ? 'Thinking...' : 'AI Palette'}
                </button>
              </div>
            </div>

            {/* Story Photo Picker Drawer */}
            {showStoryPicker && (
              <div className="p-6 rounded-2xl bg-white border border-[#DDD5C7] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl text-[#1C1917]">Select Editorial Photography</h3>
                  <button
                    type="button"
                    onClick={() => setShowStoryPicker(false)}
                    className="text-xs text-[#574F46] hover:text-[#1C1917]"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 max-h-72 overflow-y-auto pr-1">
                  {stories.map((story) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => addStoryImage(story)}
                      className="text-left group space-y-1.5"
                    >
                      <div className="aspect-[4/3] rounded-lg overflow-hidden bg-[#EAE4DA]">
                        <EditorialImage
                          src={story.coverImage}
                          alt={story.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <p className="text-[11px] text-[#332B24] line-clamp-2">{story.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Palette Strip */}
            {palette.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#7D7368]">
                  <Palette className="w-3.5 h-3.5" />
                  <span>Board Palette</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {palette.map((swatch, idx) => (
                    <div key={`${swatch.hex}-${idx}`} className="space-y-1.5">
                      <div
                        className="h-16 rounded-xl border border-[#DDD5C7]"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <p className="text-xs font-medium text-[#1C1917]">{swatch.name}</p>
                      <p className="font-mono text-[11px] text-[#7D7368] tabular-nums">
                        {swatch.hex} · {swatch.role}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Responsive Visual Canvas Grid */}
            {items.length === 0 ? (
              <EditorialEmptyState
                title="Your moodboard canvas is ready"
                description="Add curated story photography, upload textures, drop in editorial notes, or generate an AI color palette above."
                actionLabel="Browse Editorial Photos"
                onAction={() => setShowStoryPicker(true)}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-auto">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl overflow-hidden border border-[#DDD5C7] bg-[#FAF7F2] flex flex-col ${
                      item.span === 'wide' ? 'md:col-span-2' : item.span === 'tall' ? 'row-span-2' : ''
                    }`}
                  >
                    {item.kind === 'text_note' ? (
                      <div className="p-8 bg-[#F3EFE8] flex-1 flex flex-col justify-center">
                        <p className="font-serif italic text-2xl text-[#1C1917] leading-relaxed">
                          “{item.note}”
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[240px] bg-[#EAE4DA]">
                        <EditorialImage
                          src={item.imageUrl}
                          alt={item.title || 'Moodboard asset'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="px-4 py-2.5 bg-[#FAF7F2] border-t border-[#EAE4DA] flex items-center justify-between gap-2 text-xs text-[#574F46]">
                      <span className="truncate">{item.title || (item.kind === 'text_note' ? 'Editorial Note' : 'Visual Reference')}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => cycleSpan(item.id)}
                          title="Toggle card proportion"
                          className="hover:text-[#1C1917] px-1.5 py-0.5 rounded bg-[#F3EFE8]"
                        >
                          {item.span}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0}
                          aria-label="Move earlier"
                          className="hover:text-[#1C1917] disabled:opacity-30"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label="Remove item"
                          className="hover:text-[#8B2E2E]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // LIST VIEW: /moodboards
  return (
    <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-12 space-y-12">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#DDD5C7]">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">Visual Workspace</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">AI Moodboard Studio</h1>
          <p className="text-sm text-[#574F46] leading-relaxed">
            Pair editorial photography, uploaded swatches, written notes, and Gemini-generated color harmonies.
          </p>
        </div>

        <AuraLink
          to="/ai-studio"
          className="px-5 py-2.5 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap self-start lg:self-end"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate Board from Prompt
        </AuraLink>
      </header>

      {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}

      <form
        onSubmit={handleCreateBoard}
        className="p-6 rounded-2xl bg-[#F3EFE8] border border-[#DDD5C7] grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
      >
        <div className="md:col-span-4 space-y-1.5">
          <label htmlFor="new-mb-title" className="block text-xs font-medium text-[#574F46]">
            Moodboard Title
          </label>
          <input
            id="new-mb-title"
            type="text"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Sunlit Limestone Living Room"
            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
          />
        </div>
        <div className="md:col-span-6 space-y-1.5">
          <label htmlFor="new-mb-desc" className="block text-xs font-medium text-[#574F46]">
            Creative Direction (optional)
          </label>
          <input
            id="new-mb-desc"
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Textures, season, light notes..."
            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
          />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Board
          </button>
        </div>
      </form>

      {loading ? (
        <StoryGridSkeleton count={3} />
      ) : boards.length === 0 ? (
        <EditorialEmptyState
          title="No moodboards yet"
          description="Create a blank visual workspace above or let Aura AI turn a text prompt into a structured board."
          actionLabel="Open AI Aura Assistant"
          onAction={() => navigate('/ai-studio')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {boards.map((board) => {
            const firstImage = board.items.find((i) => i.imageUrl)?.imageUrl;
            return (
              <div key={board.id} className="group space-y-3">
                <AuraLink
                  to={`/moodboards/${board.id}`}
                  className="block aspect-[4/3] rounded-2xl overflow-hidden bg-[#EAE4DA]"
                >
                  <EditorialImage
                    src={firstImage}
                    alt={board.title}
                    fallbackTitle={board.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </AuraLink>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <AuraLink to={`/moodboards/${board.id}`} className="block">
                      <h2 className="font-serif text-2xl text-[#1C1917] group-hover:text-[#8C6A43] transition-colors truncate">
                        {board.title}
                      </h2>
                    </AuraLink>
                    <p className="text-xs text-[#7D7368] tabular-nums">
                      {board.items.length} elements · {board.palette.length} swatches
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBoard(board.id)}
                    aria-label={`Delete ${board.title}`}
                    className="p-2 text-[#7D7368] hover:text-[#8B2E2E] shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
