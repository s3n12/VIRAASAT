export type UserRole = 'member' | 'editor' | 'admin';

export type AccountStatus = 'pending_verification' | 'active' | 'suspended';

export type CategorySlug =
  | 'style-and-beauty'
  | 'bridal-and-festive'
  | 'home-and-living'
  | 'craft-and-diy'
  | 'nature-and-travel'
  | 'culture-and-heritage'
  | 'mind-and-wellness'
  | 'food-and-nutrition'
  | 'art-and-design';

export type MoodSlug =
  | 'earthy-and-craft'
  | 'minimal-and-calm'
  | 'luxury-and-elegant'
  | 'editorial-fashion'
  | 'nature-lover'
  | 'cultural-wanderlust'
  | 'creative-and-colorful'
  | 'cozy-living';

export type StorySectionType =
  | 'editorial_intro'
  | 'step_by_step'
  | 'recipe'
  | 'styling_breakdown'
  | 'destination_guide'
  | 'wellness_routine'
  | 'diy_instructions'
  | 'tips_and_materials';

export interface AuraCategory {
  id: string;
  slug: CategorySlug;
  name: string;
  tagline: string;
  description: string;
  coverImage: string;
  accentHex: string;
  storyCount?: number;
}

export interface AuraMood {
  id: string;
  slug: MoodSlug;
  label: string;
  shortDescriptor: string;
  palette: [string, string, string];
  keywords: string[];
}

export interface StorySection {
  id: string;
  type: StorySectionType;
  heading: string;
  body: string;
  items?: string[];
  note?: string;
  sortOrder: number;
}

export interface StoryCreator {
  name: string;
  role: string;
  location: string;
  avatarUrl?: string;
}

export interface AuraStory {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string;
  coverCaption: string;
  categorySlug: CategorySlug;
  tags: string[];
  moods: MoodSlug[];
  readingMinutes: number;
  creator: StoryCreator;
  palette: string[];
  sections: StorySection[];
  status: 'published' | 'draft';
  featured: boolean;
  dailyFeatured?: boolean;
  publishedAt: string;
  updatedAt: string;
  isSeeded?: boolean;
}

export interface AuraProfile {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  accountStatus: AccountStatus;
  favoriteCategories: CategorySlug[];
  preferredMoods: MoodSlug[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  storyId: string;
  note: string;
  addedAt: string;
  story?: AuraStory;
}

export interface AuraCollection {
  id: string;
  userId: string;
  title: string;
  description: string;
  coverImage: string | null;
  items: CollectionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MoodboardItem {
  id: string;
  moodboardId: string;
  kind: 'story_image' | 'uploaded_image' | 'text_note' | 'color_swatch';
  storyId?: string;
  imageUrl?: string;
  title?: string;
  note?: string;
  hexColor?: string;
  span: 'wide' | 'tall' | 'standard';
  sortOrder: number;
}

export interface AuraMoodboard {
  id: string;
  userId: string;
  title: string;
  description: string;
  moodSlug?: MoodSlug;
  palette: Array<{ name: string; hex: string; role: string }>;
  items: MoodboardItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthConfigStatus {
  supabaseAuthConfigured: boolean;
  supabaseDbConfigured: boolean;
  smsHookConfigured: boolean;
  msg91Configured: boolean;
  geminiConfigured: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  missingVariables: string[];
  otpExpirySeconds: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
}

export interface AiRecommendationResult {
  moodSummary: string;
  editorialNote: string;
  recommendedStories: Array<{
    slug: string;
    title: string;
    reason: string;
    stylingCue: string;
  }>;
  complementaryPalette: Array<{ name: string; hex: string; usage: string }>;
}

export interface AiInspirationBoardResult {
  title: string;
  concept: string;
  moodKeywords: string[];
  colorPalette: Array<{ name: string; hex: string; role: string }>;
  materialsAndTextures: string[];
  stylingIdeas: string[];
  editorialNotes: string[];
  matchedStorySlugs: string[];
}

export interface AiStylingResult {
  title: string;
  editorialDirection: string;
  looks: Array<{
    name: string;
    pieces: string[];
    accessories: string[];
    occasion: string;
    tip: string;
  }>;
  palette: Array<{ name: string; hex: string }>;
}

export interface AiPaletteResult {
  themeName: string;
  rationale: string;
  swatches: Array<{
    name: string;
    hex: string;
    role: string;
    pairingAdvice: string;
  }>;
}

export interface AiDiyResult {
  projectTitle: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Artisan';
  estimatedTime: string;
  materials: string[];
  steps: Array<{ stepNumber: number; title: string; detail: string }>;
  finishingTip: string;
}

export interface AiTravelResult {
  destinationTitle: string;
  atmosphere: string;
  bestSeason: string;
  itinerary: Array<{
    dayLabel: string;
    morning: string;
    afternoon: string;
    evening: string;
  }>;
  packingPalette: Array<{ name: string; hex: string }>;
  quietDetour: string;
}

export interface AiStorySummaryResult {
  headlineTakeaway: string;
  keyHighlights: string[];
  moodTags: string[];
  actionableIdea: string;
}
