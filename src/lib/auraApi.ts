import type {
  AiDiyResult,
  AiInspirationBoardResult,
  AiPaletteResult,
  AiRecommendationResult,
  AiStorySummaryResult,
  AiStylingResult,
  AiTravelResult,
  AuraCategory,
  AuraCollection,
  AuraMood,
  AuraMoodboard,
  AuraProfile,
  AuraStory,
  AuthConfigStatus,
  CategorySlug,
  MoodSlug,
  MoodboardItem,
  StorySection,
} from '../types/aura';

// Keep auth token strictly in JS memory (never localStorage) to prevent XSS token persistence
let inMemoryAuthToken: string | null = null;

export function setAuraAuthToken(token: string | null) {
  inMemoryAuthToken = token;
}

export function getAuraAuthToken(): string | null {
  return inMemoryAuthToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterSec?: number;
  missingVariables?: string[];

  constructor(
    message: string,
    status: number,
    extra?: { code?: string; retryAfterSec?: number; missingVariables?: string[] }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = extra?.code;
    this.retryAfterSec = extra?.retryAfterSec;
    this.missingVariables = extra?.missingVariables;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'AURA-Client');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAuthToken}`);
  }

  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, {
      code: data?.code,
      retryAfterSec: data?.retryAfterSec,
      missingVariables: data?.missingVariables,
    });
  }
  return data as T;
}

export const auraApi = {
  // Public Discovery
  getAuthConfig: () => requestJson<AuthConfigStatus>('/api/auth/config'),
  getCategories: () => requestJson<{ categories: AuraCategory[] }>('/api/categories'),
  getMoods: () => requestJson<{ moods: AuraMood[] }>('/api/moods'),
  getStories: (params?: { category?: string; mood?: string; tag?: string; q?: string; featured?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.mood) qs.set('mood', params.mood);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.q) qs.set('q', params.q);
    if (params?.featured) qs.set('featured', 'true');
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson<{ stories: AuraStory[]; dailyFeatured: AuraStory | null; total: number }>(
      `/api/stories${suffix}`
    );
  },
  getStory: (slug: string) =>
    requestJson<{ story: AuraStory; category: AuraCategory | null; related: AuraStory[] }>(
      `/api/stories/${encodeURIComponent(slug)}`
    ),
  searchStories: (params: { q?: string; category?: string; mood?: string; tag?: string }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.category) qs.set('category', params.category);
    if (params.mood) qs.set('mood', params.mood);
    if (params.tag) qs.set('tag', params.tag);
    return requestJson<{ query: string; results: AuraStory[]; total: number; suggestions: string[] }>(
      `/api/search?${qs.toString()}`
    );
  },

  // Auth: Dual OTP + Password + Reset
  sendEmailOtp: (payload: { email: string; intent: 'register' | 'login'; displayName?: string; captchaToken?: string }) =>
    requestJson<{ ok: boolean; normalizedIdentifier: string; resendCooldownSec: number; message: string }>(
      '/api/auth/otp/email/send',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  verifyEmailOtp: (payload: { email: string; code: string; displayName?: string }) =>
    requestJson<{ ok: boolean; token: string; user: AuraProfile; requiresPhoneVerification: boolean }>(
      '/api/auth/otp/email/verify',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  sendPhoneOtp: (payload: { phone: string; intent: 'register' | 'login'; captchaToken?: string }) =>
    requestJson<{ ok: boolean; normalizedIdentifier: string; resendCooldownSec: number; message: string }>(
      '/api/auth/otp/phone/send',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  verifyPhoneOtp: (payload: { phone: string; code: string; intent: 'register' | 'login' }) =>
    requestJson<{ ok: boolean; token: string; user: AuraProfile }>('/api/auth/otp/phone/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  signUpPassword: (payload: { displayName: string; email: string; password: string }) =>
    requestJson<{ ok: boolean; token?: string; user?: AuraProfile; requiresEmailConfirmation?: boolean; message: string }>(
      '/api/auth/signup',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  signInPassword: (payload: { email: string; password: string }) =>
    requestJson<{ ok: boolean; token: string; user: AuraProfile }>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetPassword: (email: string) =>
    requestJson<{ ok: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  getMe: () => requestJson<{ user: AuraProfile }>('/api/auth/me'),
  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Profile
  getProfile: () =>
    requestJson<{
      profile: AuraProfile;
      stats: { collectionsCount: number; savedStoriesCount: number; moodboardsCount: number };
    }>('/api/profile'),
  updateProfile: (payload: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string | null;
    favoriteCategories?: CategorySlug[];
    preferredMoods?: MoodSlug[];
  }) => requestJson<{ profile: AuraProfile }>('/api/profile', { method: 'PATCH', body: JSON.stringify(payload) }),

  // Collections ("My Universe")
  getCollections: () => requestJson<{ collections: AuraCollection[] }>('/api/collections'),
  getCollection: (id: string) => requestJson<{ collection: AuraCollection }>(`/api/collections/${encodeURIComponent(id)}`),
  createCollection: (payload: { title: string; description?: string }) =>
    requestJson<{ collection: AuraCollection }>('/api/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCollection: (id: string, payload: { title?: string; description?: string }) =>
    requestJson<{ collection: AuraCollection }>(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCollection: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addStoryToCollection: (collectionId: string, storyId: string, note = '') =>
    requestJson<{ collection: AuraCollection }>(`/api/collections/${encodeURIComponent(collectionId)}/items`, {
      method: 'POST',
      body: JSON.stringify({ storyId, note }),
    }),
  updateCollectionItemNote: (collectionId: string, storyId: string, note: string) =>
    requestJson<{ collection: AuraCollection }>(
      `/api/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(storyId)}`,
      { method: 'PATCH', body: JSON.stringify({ note }) }
    ),
  removeStoryFromCollection: (collectionId: string, storyId: string) =>
    requestJson<{ collection: AuraCollection }>(
      `/api/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(storyId)}`,
      { method: 'DELETE' }
    ),

  // Moodboards
  getMoodboards: () => requestJson<{ moodboards: AuraMoodboard[] }>('/api/moodboards'),
  getMoodboard: (id: string) => requestJson<{ moodboard: AuraMoodboard }>(`/api/moodboards/${encodeURIComponent(id)}`),
  createMoodboard: (payload: {
    title: string;
    description?: string;
    moodSlug?: MoodSlug;
    palette?: Array<{ name: string; hex: string; role: string }>;
    items?: Array<Omit<MoodboardItem, 'id' | 'moodboardId' | 'sortOrder'> & { id?: string }>;
  }) =>
    requestJson<{ moodboard: AuraMoodboard }>('/api/moodboards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMoodboard: (
    id: string,
    payload: {
      title: string;
      description?: string;
      moodSlug?: MoodSlug;
      palette?: Array<{ name: string; hex: string; role: string }>;
      items: Array<Omit<MoodboardItem, 'id' | 'moodboardId' | 'sortOrder'> & { id?: string }>;
    }
  ) =>
    requestJson<{ moodboard: AuraMoodboard }>(`/api/moodboards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteMoodboard: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/moodboards/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Media Upload
  uploadMedia: (payload: {
    bucket: 'story-covers' | 'user-avatars' | 'moodboard-assets';
    mimeType: string;
    dataBase64: string;
  }) =>
    requestJson<{ url: string; storage: 'supabase' | 'local' }>('/api/storage/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // AI Aura Assistant (Server-side Gemini + Zod)
  aiRecommend: (payload: { moodSlug: MoodSlug; prompt?: string }) =>
    requestJson<{ result: AiRecommendationResult }>('/api/ai/recommend', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  aiInspirationBoard: (payload: { prompt: string; moodSlug?: MoodSlug }) =>
    requestJson<{ result: AiInspirationBoardResult }>('/api/ai/inspiration-board', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  aiStyling: (prompt: string) =>
    requestJson<{ result: AiStylingResult }>('/api/ai/styling', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  aiPalette: (prompt: string) =>
    requestJson<{ result: AiPaletteResult }>('/api/ai/palette', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  aiDiy: (prompt: string) =>
    requestJson<{ result: AiDiyResult }>('/api/ai/diy', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  aiTravel: (prompt: string) =>
    requestJson<{ result: AiTravelResult }>('/api/ai/travel', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  aiSummarizeStory: (slug: string) =>
    requestJson<{ result: AiStorySummaryResult }>('/api/ai/summarize-story', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }),

  // Admin Content Studio
  adminGetStories: () => requestJson<{ stories: AuraStory[] }>('/api/admin/stories'),
  adminCreateStory: (payload: {
    title: string;
    subtitle: string;
    excerpt: string;
    coverImage: string;
    coverCaption?: string;
    categorySlug: CategorySlug;
    tags: string[];
    moods: MoodSlug[];
    readingMinutes: number;
    creatorName: string;
    creatorRole: string;
    creatorLocation?: string;
    palette?: string[];
    sections: Array<Omit<StorySection, 'id' | 'sortOrder'> & { id?: string }>;
    status: 'draft' | 'published';
    featured: boolean;
    dailyFeatured?: boolean;
  }) =>
    requestJson<{ story: AuraStory }>('/api/admin/stories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminUpdateStory: (
    id: string,
    payload: {
      title: string;
      subtitle: string;
      excerpt: string;
      coverImage: string;
      coverCaption?: string;
      categorySlug: CategorySlug;
      tags: string[];
      moods: MoodSlug[];
      readingMinutes: number;
      creatorName: string;
      creatorRole: string;
      creatorLocation?: string;
      palette?: string[];
      sections: Array<Omit<StorySection, 'id' | 'sortOrder'> & { id?: string }>;
      status: 'draft' | 'published';
      featured: boolean;
      dailyFeatured?: boolean;
    }
  ) =>
    requestJson<{ story: AuraStory }>(`/api/admin/stories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  adminToggleStoryFlags: (
    id: string,
    payload: { status?: 'draft' | 'published'; featured?: boolean; dailyFeatured?: boolean }
  ) =>
    requestJson<{ story: AuraStory }>(`/api/admin/stories/${encodeURIComponent(id)}/flags`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  adminDeleteStory: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/admin/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
