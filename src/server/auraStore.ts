import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { AURA_CATEGORIES, AURA_MOODS, SEEDED_AURA_STORIES } from '../data/auraSeed.ts';
import type {
  AccountStatus,
  AuraCategory,
  AuraCollection,
  AuraMood,
  AuraMoodboard,
  AuraProfile,
  AuraStory,
  CategorySlug,
  CollectionItem,
  MoodSlug,
  MoodboardItem,
  StorySection,
  UserRole,
} from '../types/aura.ts';
import { createSupabaseAdminClient, type SupabaseAuthEnvConfig } from './supabaseAuth.ts';

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

export interface AuraDataStore {
  categories: AuraCategory[];
  moods: AuraMood[];
  stories: Map<string, AuraStory>;
  profiles: Map<string, AuraProfile>;
  collections: Map<string, AuraCollection>;
  moodboards: Map<string, AuraMoodboard>;
  revokedTokens: Map<string, number>;
}

export function createAuraDataStore(): AuraDataStore {
  const stories = new Map<string, AuraStory>();
  for (const story of SEEDED_AURA_STORIES) {
    stories.set(story.id, structuredClone(story));
  }

  return {
    categories: structuredClone(AURA_CATEGORIES),
    moods: structuredClone(AURA_MOODS),
    stories,
    profiles: new Map<string, AuraProfile>(),
    collections: new Map<string, AuraCollection>(),
    moodboards: new Map<string, AuraMoodboard>(),
    revokedTokens: new Map<string, number>(),
  };
}

export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  const set = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

export function resolveAuraUserRole(email: string, existingRole?: UserRole): UserRole {
  const normalized = email.trim().toLowerCase();
  if (getAdminEmails().has(normalized)) {
    return 'admin';
  }
  return existingRole ?? 'member';
}

export function isSafeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/src/assets/images/') || trimmed.startsWith('/uploads/')) {
    return !trimmed.includes('..');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

export function listCategoriesWithCounts(store: AuraDataStore): AuraCategory[] {
  const counts = new Map<CategorySlug, number>();
  for (const story of store.stories.values()) {
    if (story.status !== 'published') continue;
    counts.set(story.categorySlug, (counts.get(story.categorySlug) ?? 0) + 1);
  }
  return store.categories.map((cat) => ({
    ...cat,
    storyCount: counts.get(cat.slug) ?? 0,
  }));
}

export function queryStories(
  store: AuraDataStore,
  options: {
    includeDrafts?: boolean;
    category?: string;
    mood?: string;
    tag?: string;
    q?: string;
    featuredOnly?: boolean;
    preferredMoods?: MoodSlug[];
  } = {}
): AuraStory[] {
  const all = Array.from(store.stories.values()).filter((s) =>
    options.includeDrafts ? true : s.status === 'published'
  );

  const categoryFilter = options.category?.trim().toLowerCase();
  const moodFilter = options.mood?.trim().toLowerCase() as MoodSlug | undefined;
  const tagFilter = options.tag?.trim().toLowerCase();
  const queryText = options.q?.trim().toLowerCase() || '';

  const moodMetaMap = new Map(store.moods.map((m) => [m.slug, m]));
  const catMetaMap = new Map(store.categories.map((c) => [c.slug, c]));

  const scored = all
    .map((story) => {
      if (options.featuredOnly && !story.featured) return null;
      if (categoryFilter && story.categorySlug !== categoryFilter) return null;
      if (tagFilter && !story.tags.some((t) => t.toLowerCase() === tagFilter)) return null;

      let score = 0;

      // Real mood filtering & ranking using stored mood metadata and keywords
      if (moodFilter) {
        const moodIndex = story.moods.indexOf(moodFilter);
        const moodDef = moodMetaMap.get(moodFilter);
        const keywordMatch =
          moodDef?.keywords.some((kw) => {
            const hay = `${story.title} ${story.subtitle} ${story.excerpt} ${story.tags.join(' ')}`.toLowerCase();
            return hay.includes(kw);
          }) ?? false;

        if (moodIndex === -1 && !keywordMatch) {
          return null;
        }
        // Primary mood gets strongest rank weight
        score += moodIndex === 0 ? 40 : moodIndex > 0 ? 25 : 10;
      }

      // Personalization boost from user's saved preferred moods
      if (options.preferredMoods?.length) {
        for (const pref of options.preferredMoods) {
          if (story.moods.includes(pref)) {
            score += 6;
          }
        }
      }

      // Real search across title, subtitle, excerpt, category name, tags, keywords, mood labels & section copy
      if (queryText) {
        const tokens = queryText.split(/\s+/).filter(Boolean);
        const catName = catMetaMap.get(story.categorySlug)?.name.toLowerCase() || '';
        const moodLabels = story.moods
          .map((m) => moodMetaMap.get(m)?.label.toLowerCase() || m)
          .join(' ');
        const sectionText = story.sections
          .map((sec) => `${sec.heading} ${sec.body} ${(sec.items || []).join(' ')}`)
          .join(' ')
          .toLowerCase();

        let matchedAll = true;
        for (const token of tokens) {
          let tokenScore = 0;
          if (story.title.toLowerCase().includes(token)) tokenScore += 20;
          if (story.subtitle.toLowerCase().includes(token)) tokenScore += 12;
          if (story.excerpt.toLowerCase().includes(token)) tokenScore += 10;
          if (catName.includes(token) || story.categorySlug.includes(token)) tokenScore += 14;
          if (story.tags.some((t) => t.toLowerCase().includes(token))) tokenScore += 15;
          if (moodLabels.includes(token)) tokenScore += 14;
          if (story.creator.name.toLowerCase().includes(token)) tokenScore += 8;
          if (sectionText.includes(token)) tokenScore += 5;

          if (tokenScore === 0) {
            matchedAll = false;
            break;
          }
          score += tokenScore;
        }
        if (!matchedAll) return null;
      }

      if (story.dailyFeatured) score += 8;
      if (story.featured) score += 4;

      return { story, score };
    })
    .filter((entry): entry is { story: AuraStory; score: number } => entry !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.story.publishedAt).getTime() - new Date(a.story.publishedAt).getTime();
  });

  return scored.map((s) => s.story);
}

export function getRelatedStories(store: AuraDataStore, target: AuraStory, limit = 4): AuraStory[] {
  const candidates = Array.from(store.stories.values()).filter(
    (s) => s.status === 'published' && s.id !== target.id
  );

  return candidates
    .map((story) => {
      let overlap = 0;
      if (story.categorySlug === target.categorySlug) overlap += 10;
      for (const mood of story.moods) {
        if (target.moods.includes(mood)) overlap += 6;
      }
      for (const tag of story.tags) {
        if (target.tags.includes(tag)) overlap += 4;
      }
      return { story, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((x) => x.story);
}

export async function syncAuraProfileFromSupabaseUser(params: {
  store: AuraDataStore;
  sbUser: SupabaseUser;
  cfg: SupabaseAuthEnvConfig;
  displayNameOverride?: string;
}): Promise<AuraProfile> {
  const { store, sbUser, cfg, displayNameOverride } = params;
  const email = (sbUser.email || '').trim().toLowerCase();
  const phone = sbUser.phone ? sbUser.phone.trim() : null;
  const existing = store.profiles.get(sbUser.id);
  const emailVerified = Boolean(sbUser.email_confirmed_at);
  const phoneVerified = Boolean(sbUser.phone_confirmed_at);
  const displayName =
    displayNameOverride?.trim() ||
    (typeof sbUser.user_metadata?.display_name === 'string' && sbUser.user_metadata.display_name.trim()) ||
    existing?.displayName ||
    (email ? email.split('@')[0] : 'AURA Member');

  let role: UserRole = resolveAuraUserRole(email, existing?.role);
  let bio = existing?.bio ?? '';
  let avatarUrl = existing?.avatarUrl ?? null;
  let favoriteCategories: CategorySlug[] = existing?.favoriteCategories ?? [];
  let preferredMoods: MoodSlug[] = existing?.preferredMoods ?? [];
  let accountStatus: AccountStatus = existing?.accountStatus === 'suspended'
    ? 'suspended'
    : emailVerified
      ? 'active'
      : 'pending_verification';

  if (cfg.supabaseUrl && cfg.supabaseServiceRoleKey) {
    try {
      const admin = createSupabaseAdminClient(cfg);
      const { data: dbProfile } = await admin
        .from('profiles')
        .select('role, bio, avatar_url, account_status')
        .eq('id', sbUser.id)
        .maybeSingle();

      if (dbProfile) {
        if (dbProfile.role === 'admin' || dbProfile.role === 'editor' || dbProfile.role === 'member') {
          role = resolveAuraUserRole(email, dbProfile.role as UserRole);
        }
        if (typeof dbProfile.bio === 'string' && !existing?.bio) bio = dbProfile.bio;
        if (typeof dbProfile.avatar_url === 'string' && !existing?.avatarUrl) avatarUrl = dbProfile.avatar_url;
        if (dbProfile.account_status === 'suspended') accountStatus = 'suspended';
      }

      await admin.from('profiles').upsert(
        {
          id: sbUser.id,
          email: email || null,
          phone,
          display_name: displayName,
          bio,
          avatar_url: avatarUrl,
          role,
          email_verified: emailVerified,
          phone_verified: phoneVerified,
          email_verified_at: sbUser.email_confirmed_at ?? null,
          phone_verified_at: sbUser.phone_confirmed_at ?? null,
          account_status: accountStatus,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      const { data: prefs } = await admin
        .from('user_preferences')
        .select('favorite_category_slugs, preferred_mood_slugs')
        .eq('user_id', sbUser.id)
        .maybeSingle();

      if (prefs) {
        if (Array.isArray(prefs.favorite_category_slugs)) {
          favoriteCategories = prefs.favorite_category_slugs as CategorySlug[];
        }
        if (Array.isArray(prefs.preferred_mood_slugs)) {
          preferredMoods = prefs.preferred_mood_slugs as MoodSlug[];
        }
      }
    } catch {
      // Schema may not be pushed to Supabase yet; continue cleanly with verified Supabase Auth identity.
    }
  }

  const now = new Date().toISOString();
  const profile: AuraProfile = {
    id: sbUser.id,
    email,
    phone,
    displayName,
    avatarUrl,
    bio,
    role,
    emailVerified,
    phoneVerified,
    emailVerifiedAt: sbUser.email_confirmed_at ?? existing?.emailVerifiedAt ?? null,
    phoneVerifiedAt: sbUser.phone_confirmed_at ?? existing?.phoneVerifiedAt ?? null,
    accountStatus,
    favoriteCategories,
    preferredMoods,
    createdAt: existing?.createdAt ?? sbUser.created_at ?? now,
    updatedAt: now,
  };

  store.profiles.set(profile.id, profile);
  ensureStarterCollection(store, profile.id);
  return profile;
}

export function ensureStarterCollection(store: AuraDataStore, userId: string): void {
  const hasAny = Array.from(store.collections.values()).some((c) => c.userId === userId);
  if (hasAny) return;
  const now = new Date().toISOString();
  const id = `col_${crypto.randomUUID().slice(0, 12)}`;
  store.collections.set(id, {
    id,
    userId,
    title: 'Saved Inspiration',
    description: 'Your personal editorial archive of visual stories and quiet ideas.',
    coverImage: null,
    items: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function hydrateCollection(store: AuraDataStore, col: AuraCollection): AuraCollection {
  const hydratedItems: CollectionItem[] = [];
  for (const item of col.items) {
    const story = store.stories.get(item.storyId);
    if (story) {
      hydratedItems.push({ ...item, story });
    }
  }

  return {
    ...col,
    coverImage: col.coverImage || hydratedItems[0]?.story?.coverImage || null,
    items: hydratedItems,
  };
}

export function listUserCollections(store: AuraDataStore, userId: string): AuraCollection[] {
  ensureStarterCollection(store, userId);
  return Array.from(store.collections.values())
    .filter((c) => c.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((c) => hydrateCollection(store, c));
}

export function listUserMoodboards(store: AuraDataStore, userId: string): AuraMoodboard[] {
  return Array.from(store.moodboards.values())
    .filter((m) => m.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function saveValidatedUpload(params: {
  bucket: 'story-covers' | 'user-avatars' | 'moodboard-assets';
  userId: string;
  dataBase64: string;
  mimeType: string;
  cfg: SupabaseAuthEnvConfig;
}): Promise<{ url: string; storage: 'supabase' | 'local' }> {
  const { bucket, userId, dataBase64, mimeType, cfg } = params;
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported image type. Allowed formats: JPEG, PNG, WebP, or AVIF.');
  }

  const maxBytes = bucket === 'user-avatars' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  const cleaned = dataBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  const buffer = Buffer.from(cleaned, 'base64');

  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error(`Image exceeds maximum allowed size (${Math.floor(maxBytes / (1024 * 1024))}MB).`);
  }

  const ext = MIME_TO_EXT[mimeType] || '.jpg';
  const safeUserDir = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const objectPath = `${safeUserDir}/${filename}`;

  if (cfg.supabaseUrl && cfg.supabaseServiceRoleKey) {
    try {
      const admin = createSupabaseAdminClient(cfg);
      const { error } = await admin.storage.from(bucket).upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });
      if (!error) {
        const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
        if (data?.publicUrl) {
          return { url: data.publicUrl, storage: 'supabase' };
        }
      }
    } catch {
      // Fallback cleanly to confined local upload directory if bucket hasn't been migrated yet
    }
  }

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const targetDir = path.resolve(uploadsRoot, bucket, safeUserDir);
  if (!targetDir.startsWith(uploadsRoot + path.sep)) {
    throw new Error('Invalid upload target path.');
  }
  await fs.mkdir(targetDir, { recursive: true });
  const targetFile = path.resolve(targetDir, filename);
  if (!targetFile.startsWith(targetDir + path.sep)) {
    throw new Error('Invalid upload filename.');
  }
  await fs.writeFile(targetFile, buffer);

  return {
    url: `/uploads/${bucket}/${safeUserDir}/${filename}`,
    storage: 'local',
  };
}

export function normalizeStorySections(raw: Array<Omit<StorySection, 'id' | 'sortOrder'> & { id?: string }>): StorySection[] {
  return raw.map((sec, idx) => ({
    id: sec.id || `sec_${crypto.randomBytes(5).toString('hex')}`,
    type: sec.type,
    heading: sec.heading.trim(),
    body: sec.body.trim(),
    items: sec.items?.map((i) => i.trim()).filter(Boolean),
    note: sec.note?.trim() || undefined,
    sortOrder: idx + 1,
  }));
}

export function normalizeMoodboardItems(
  moodboardId: string,
  items: Array<Omit<MoodboardItem, 'id' | 'moodboardId' | 'sortOrder'> & { id?: string }>
): MoodboardItem[] {
  return items.map((item, idx) => ({
    id: item.id || `mbi_${crypto.randomBytes(5).toString('hex')}`,
    moodboardId,
    kind: item.kind,
    storyId: item.storyId,
    imageUrl: item.imageUrl,
    title: item.title?.trim(),
    note: item.note?.trim(),
    hexColor: item.hexColor?.toUpperCase(),
    span: item.span || 'standard',
    sortOrder: idx + 1,
  }));
}
