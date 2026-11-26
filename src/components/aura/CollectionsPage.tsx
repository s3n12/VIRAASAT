import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type { AuraCollection, AuraProfile } from '../../types/aura';
import {
  EditorialEmptyState,
  EditorialImage,
  StoryGridSkeleton,
} from './EditorialPrimitives';

export function CollectionsPage({
  collectionId,
  user,
}: {
  collectionId?: string;
  user: AuraProfile | null;
}) {
  const { navigate } = useAuraRouter();
  const [collections, setCollections] = useState<AuraCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<AuraCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingMeta, setEditingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [editingNoteStoryId, setEditingNoteStoryId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    updateDocumentSeo(
      collectionId ? 'Collection — My Universe | AURA' : 'My Universe — Personal Collections | AURA',
      'Organize saved editorial stories, personal notes, and moodboards in your private AURA Universe.'
    );
  }, [collectionId]);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (collectionId) {
        const res = await auraApi.getCollection(collectionId);
        setActiveCollection(res.collection);
        setEditTitle(res.collection.title);
        setEditDesc(res.collection.description);
      } else {
        const res = await auraApi.getCollections();
        setCollections(res.collections);
        setActiveCollection(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load collections.');
    } finally {
      setLoading(false);
    }
  }, [user, collectionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center space-y-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">My Universe</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">
          Curate your private visual archive
        </h1>
        <p className="text-sm sm:text-base text-[#574F46] leading-relaxed">
          Sign in with your verified AURA account to save stories, create named collections, keep personal editorial notes, and assemble visual moodboards.
        </p>
        <div className="flex items-center justify-center gap-3 pt-3">
          <button
            type="button"
            onClick={() => navigate('/auth/sign-in')}
            className="px-6 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => navigate('/auth/sign-up')}
            className="px-6 py-2.5 text-sm font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors whitespace-nowrap"
          >
            Create verified account
          </button>
        </div>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await auraApi.createCollection({
        title: newTitle.trim(),
        description: newDesc.trim(),
      });
      setCollections((prev) => [res.collection, ...prev]);
      setNewTitle('');
      setNewDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create collection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCollection || !editTitle.trim()) return;
    try {
      const res = await auraApi.updateCollection(activeCollection.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
      });
      setActiveCollection(res.collection);
      setEditingMeta(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename collection.');
    }
  }

  async function handleDeleteCollection(id: string) {
    try {
      await auraApi.deleteCollection(id);
      if (collectionId) {
        navigate('/collections');
      } else {
        setCollections((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete collection.');
    }
  }

  async function handleSaveItemNote(storyId: string) {
    if (!activeCollection) return;
    try {
      const res = await auraApi.updateCollectionItemNote(activeCollection.id, storyId, noteDraft);
      setActiveCollection(res.collection);
      setEditingNoteStoryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update note.');
    }
  }

  async function handleRemoveStory(storyId: string) {
    if (!activeCollection) return;
    try {
      const res = await auraApi.removeStoryFromCollection(activeCollection.id, storyId);
      setActiveCollection(res.collection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove story.');
    }
  }

  // DETAIL VIEW: /collections/:id
  if (collectionId) {
    return (
      <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-12 space-y-10">
        <button
          type="button"
          onClick={() => navigate('/collections')}
          className="inline-flex items-center gap-2 text-xs text-[#574F46] hover:text-[#1C1917]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Collections
        </button>

        {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}

        {loading ? (
          <StoryGridSkeleton count={3} />
        ) : !activeCollection ? (
          <EditorialEmptyState
            title="Collection not found"
            description="This collection may have been deleted or belongs to another account."
            actionLabel="Back to My Universe"
            onAction={() => navigate('/collections')}
          />
        ) : (
          <>
            <header className="pb-8 border-b border-[#DDD5C7] flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              {editingMeta ? (
                <form onSubmit={handleRenameSubmit} className="space-y-3 max-w-xl w-full">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-lg font-serif bg-white border border-[#DDD5C7] rounded-lg"
                  />
                  <textarea
                    rows={2}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Collection description..."
                    className="w-full px-3.5 py-2 text-sm bg-white border border-[#DDD5C7] rounded-lg"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingMeta(false)}
                      className="px-4 py-2 text-xs text-[#574F46]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#7D7368] tabular-nums">
                    My Universe · {activeCollection.items.length}{' '}
                    {activeCollection.items.length === 1 ? 'story' : 'stories'}
                  </p>
                  <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">
                    {activeCollection.title}
                  </h1>
                  {activeCollection.description && (
                    <p className="text-sm text-[#574F46] leading-relaxed">
                      {activeCollection.description}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingMeta((v) => !v)}
                  className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCollection(activeCollection.id)}
                  className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#8B2E2E] rounded-lg hover:bg-[#8B2E2E]/10 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </header>

            {activeCollection.items.length === 0 ? (
              <EditorialEmptyState
                title="This collection is still quiet"
                description="Explore stories across Discover or Categories and click Save to add visual inspiration here."
                actionLabel="Explore Discover"
                onAction={() => navigate('/discover')}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                {activeCollection.items.map((item) => {
                  if (!item.story) return null;
                  const isEditingNote = editingNoteStoryId === item.storyId;
                  return (
                    <article key={item.id} className="space-y-3 flex flex-col">
                      <AuraLink
                        to={`/story/${item.story.slug}`}
                        className="block aspect-[4/3] rounded-2xl overflow-hidden bg-[#EAE4DA] group"
                      >
                        <EditorialImage
                          src={item.story.coverImage}
                          alt={item.story.title}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        />
                      </AuraLink>
                      <div className="space-y-2 flex-1">
                        <AuraLink to={`/story/${item.story.slug}`} className="block">
                          <h2 className="font-serif text-2xl text-[#1C1917] hover:text-[#8C6A43] transition-colors leading-snug">
                            {item.story.title}
                          </h2>
                        </AuraLink>

                        {isEditingNote ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              rows={2}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Add your personal editorial note..."
                              className="w-full px-3 py-2 text-xs bg-white border border-[#DDD5C7] rounded-lg"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveItemNote(item.storyId)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-md"
                              >
                                Save note
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNoteStoryId(null)}
                                className="px-3 py-1.5 text-xs text-[#574F46]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-[#574F46] italic">
                            {item.note ? `"${item.note}"` : 'No personal note yet.'}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-[#EAE4DA] flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteStoryId(item.storyId);
                            setNoteDraft(item.note || '');
                          }}
                          className="text-[#574F46] hover:text-[#1C1917] underline-offset-4 hover:underline"
                        >
                          {item.note ? 'Edit note' : 'Add note'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveStory(item.storyId)}
                          className="text-[#8B2E2E] hover:underline underline-offset-4"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // LIST VIEW: /collections
  return (
    <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-12 space-y-12">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#DDD5C7]">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">My Universe</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">Personal Collections</h1>
          <p className="text-sm text-[#574F46] leading-relaxed">
            Organize saved editorial stories by room, season, journey, or wardrobe mood.
          </p>
        </div>

        <AuraLink
          to="/moodboards"
          className="px-5 py-2.5 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors whitespace-nowrap self-start lg:self-end"
        >
          Open Moodboard Studio
        </AuraLink>
      </header>

      {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}

      {/* Create Named Collection Form */}
      <form
        onSubmit={handleCreate}
        className="p-6 rounded-2xl bg-[#F3EFE8] border border-[#DDD5C7] grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
      >
        <div className="md:col-span-4 space-y-1.5">
          <label htmlFor="new-col-title" className="block text-xs font-medium text-[#574F46]">
            New Collection Name
          </label>
          <input
            id="new-col-title"
            type="text"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Autumn Dining Table, Kyoto Retreat"
            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
          />
        </div>
        <div className="md:col-span-6 space-y-1.5">
          <label htmlFor="new-col-desc" className="block text-xs font-medium text-[#574F46]">
            Editorial Note (optional)
          </label>
          <input
            id="new-col-desc"
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="A short note describing this aesthetic chapter..."
            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
          />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={creating || !newTitle.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>

      {loading ? (
        <StoryGridSkeleton count={3} />
      ) : collections.length === 0 ? (
        <EditorialEmptyState
          title="No collections yet"
          description="Create your first named collection above and begin saving visual inspiration."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {collections.map((col) => (
            <div key={col.id} className="group space-y-3">
              <AuraLink
                to={`/collections/${col.id}`}
                className="block aspect-[4/3] rounded-2xl overflow-hidden bg-[#EAE4DA]"
              >
                <EditorialImage
                  src={col.coverImage}
                  alt={col.title}
                  fallbackTitle={col.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                />
              </AuraLink>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <AuraLink to={`/collections/${col.id}`} className="block">
                    <h2 className="font-serif text-2xl text-[#1C1917] group-hover:text-[#8C6A43] transition-colors truncate">
                      {col.title}
                    </h2>
                  </AuraLink>
                  <p className="text-xs text-[#7D7368] tabular-nums mt-0.5">
                    {col.items.length} {col.items.length === 1 ? 'story' : 'stories'}
                  </p>
                  {col.description && (
                    <p className="text-xs text-[#574F46] mt-1 line-clamp-2">{col.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteCollection(col.id)}
                  aria-label={`Delete ${col.title}`}
                  className="p-2 text-[#7D7368] hover:text-[#8B2E2E] transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
