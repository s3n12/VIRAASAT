import React, { useEffect, useState } from 'react';
import { Bookmark, Check, Plus, X } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { useAuraRouter } from '../../lib/router';
import type { AuraCollection, AuraProfile, AuraStory } from '../../types/aura';
import { EditorialImage } from './EditorialPrimitives';

export function SaveToCollectionModal({
  story,
  user,
  onClose,
  onSaved,
}: {
  story: AuraStory | null;
  user: AuraProfile | null;
  onClose: () => void;
  onSaved?: (collectionTitle: string) => void;
}) {
  const { navigate } = useAuraRouter();
  const [collections, setCollections] = useState<AuraCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [note, setNote] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!story || !user) return;
    let active = true;
    setLoading(true);
    setError(null);
    setDoneMessage(null);
    auraApi
      .getCollections()
      .then((res) => {
        if (!active) return;
        setCollections(res.collections);
        if (res.collections[0]) {
          setSelectedId(res.collections[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load collections.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [story, user]);

  if (!story) return null;

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await auraApi.createCollection({ title: newTitle.trim() });
      setCollections((prev) => [res.collection, ...prev]);
      setSelectedId(res.collection.id);
      setNewTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedId || !story) return;
    setSaving(true);
    setError(null);
    try {
      const res = await auraApi.addStoryToCollection(selectedId, story.id, note);
      setDoneMessage(`Saved to "${res.collection.title}"`);
      onSaved?.(res.collection.title);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save story.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1C1917]/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save story to collection"
    >
      <div className="bg-[#FAF7F2] border border-[#DDD5C7] rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DDD5C7]">
          <div className="flex items-center gap-2 text-[#1C1917]">
            <Bookmark className="w-4 h-4" />
            <h3 className="font-serif text-xl font-medium">Save to My Universe</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close save dialog"
            className="p-2 rounded-lg text-[#574F46] hover:bg-[#EAE4DA] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <EditorialImage
              src={story.coverImage}
              alt={story.title}
              className="w-16 h-16 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0">
              <p className="font-serif text-lg text-[#1C1917] leading-snug line-clamp-2">{story.title}</p>
              <p className="text-xs text-[#7D7368] mt-0.5">{story.readingMinutes} min read</p>
            </div>
          </div>

          {!user ? (
            <div className="bg-[#F3EFE8] rounded-xl p-5 space-y-4">
              <p className="text-sm text-[#332B24] leading-relaxed">
                Sign in to save editorial stories, build named collections, add private notes, and arrange moodboards in your personal Universe.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/auth/sign-in');
                  }}
                  className="px-4 py-2 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/auth/sign-up');
                  }}
                  className="px-4 py-2 text-sm font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors whitespace-nowrap"
                >
                  Create verified account
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <p className="text-sm text-[#8B2E2E] bg-[#8B2E2E]/8 px-3.5 py-2.5 rounded-lg">{error}</p>
              )}
              {doneMessage && (
                <div className="flex items-center gap-2 text-sm text-[#2F5D46] bg-[#2F5D46]/10 px-3.5 py-2.5 rounded-lg">
                  <Check className="w-4 h-4" />
                  <span>{doneMessage}</span>
                </div>
              )}

              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-10 bg-[#EAE4DA] rounded-lg" />
                  <div className="h-10 bg-[#EAE4DA] rounded-lg" />
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {collections.map((col) => {
                    const alreadySaved = col.items.some((i) => i.storyId === story.id);
                    const active = selectedId === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setSelectedId(col.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          active
                            ? 'border-[#1C1917] bg-[#F3EFE8]'
                            : 'border-[#DDD5C7] bg-[#FAF7F2] hover:bg-[#F3EFE8]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1C1917] truncate">{col.title}</p>
                          <p className="text-xs text-[#7D7368] tabular-nums">
                            {col.items.length} {col.items.length === 1 ? 'story' : 'stories'}
                            {alreadySaved ? ' · Saved' : ''}
                          </p>
                        </div>
                        {active && <Check className="w-4 h-4 text-[#1C1917] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleCreateCollection} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="New collection name..."
                  className="flex-1 px-3.5 py-2 text-sm bg-white border border-[#DDD5C7] rounded-lg text-[#1C1917] placeholder:text-[#7D7368]"
                />
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-3.5 py-2 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create
                </button>
              </form>

              <div>
                <label htmlFor="save-note" className="block text-xs font-medium text-[#574F46] mb-1.5">
                  Personal note (optional)
                </label>
                <textarea
                  id="save-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why this resonated, palette note, or room idea..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-[#DDD5C7] rounded-lg text-[#1C1917] placeholder:text-[#7D7368]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-[#574F46] hover:text-[#1C1917] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedId || saving}
                  onClick={handleSave}
                  className="px-5 py-2 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save story'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
