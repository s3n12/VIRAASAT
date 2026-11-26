-- =============================================================================
-- AURA — Luxury Visual Discovery & Lifestyle Inspiration Platform
-- Migration 003: Complete PostgreSQL Schema, Search Indexes, RLS Policies & Storage
-- =============================================================================
-- Run in Supabase SQL Editor or via `supabase db push`.
-- Preserves Supabase Auth (`auth.users`) as the single source of truth.
-- Never trusts client-supplied role fields.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. PROFILES (Linked 1:1 to auth.users; role/verification strictly server-controlled)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'AURA Member',
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'editor', 'admin')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  account_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (account_status IN ('pending_verification', 'active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper function: strict server-side admin check for RLS policies
CREATE OR REPLACE FUNCTION public.is_aura_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND account_status = 'active'
  );
$$;

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL,
  accent_hex TEXT NOT NULL DEFAULT '#8C6A43',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. MOODS
CREATE TABLE IF NOT EXISTS public.moods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  short_descriptor TEXT NOT NULL DEFAULT '',
  palette JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TAGS
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. STORIES
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL,
  cover_caption TEXT NOT NULL DEFAULT '',
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  reading_minutes INTEGER NOT NULL DEFAULT 5 CHECK (reading_minutes >= 1 AND reading_minutes <= 60),
  creator_name TEXT NOT NULL DEFAULT 'AURA Editorial',
  creator_role TEXT NOT NULL DEFAULT 'Editorial Contributor',
  creator_location TEXT NOT NULL DEFAULT '',
  creator_avatar TEXT,
  palette JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  daily_featured BOOLEAN NOT NULL DEFAULT FALSE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(creator_name, '')), 'D')
  ) STORED,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_status_published ON public.stories(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_category_id ON public.stories(category_id);
CREATE INDEX IF NOT EXISTS idx_stories_featured ON public.stories(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_stories_search_vector ON public.stories USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_stories_title_trgm ON public.stories USING GIN(title gin_trgm_ops);

-- 6. STORY SECTIONS
CREATE TABLE IF NOT EXISTS public.story_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (
    section_type IN (
      'editorial_intro',
      'step_by_step',
      'recipe',
      'styling_breakdown',
      'destination_guide',
      'wellness_routine',
      'diy_instructions',
      'tips_and_materials'
    )
  ),
  heading TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_sections_story_order ON public.story_sections(story_id, sort_order);

-- 7. STORY TAGS (Join Table)
CREATE TABLE IF NOT EXISTS public.story_tags (
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_story_tags_tag_id ON public.story_tags(tag_id);

-- 8. STORY MOODS (Join Table)
CREATE TABLE IF NOT EXISTS public.story_moods (
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  mood_id UUID NOT NULL REFERENCES public.moods(id) ON DELETE CASCADE,
  weight SMALLINT NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 10),
  PRIMARY KEY (story_id, mood_id)
);

CREATE INDEX IF NOT EXISTS idx_story_moods_mood_id ON public.story_moods(mood_id);

-- 9. COLLECTIONS (Personal "My Universe" Boards)
CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id, updated_at DESC);

-- 10. COLLECTION ITEMS
CREATE TABLE IF NOT EXISTS public.collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON public.collection_items(collection_id, added_at DESC);

-- 11. MOODBOARDS
CREATE TABLE IF NOT EXISTS public.moodboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mood_id UUID REFERENCES public.moods(id) ON DELETE SET NULL,
  palette JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moodboards_user_id ON public.moodboards(user_id, updated_at DESC);

-- 12. MOODBOARD ITEMS
CREATE TABLE IF NOT EXISTS public.moodboard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodboard_id UUID NOT NULL REFERENCES public.moodboards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('story_image', 'uploaded_image', 'text_note', 'color_swatch')),
  story_id UUID REFERENCES public.stories(id) ON DELETE SET NULL,
  image_url TEXT,
  title TEXT,
  note TEXT,
  hex_color TEXT,
  span TEXT NOT NULL DEFAULT 'standard' CHECK (span IN ('wide', 'tall', 'standard')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moodboard_items_board_order ON public.moodboard_items(moodboard_id, sort_order);

-- 13. USER PREFERENCES
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_category_slugs TEXT[] NOT NULL DEFAULT '{}',
  preferred_mood_slugs TEXT[] NOT NULL DEFAULT '{}',
  zen_show_clock BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- UPDATED_AT TRIGGER & AUTH.USERS PROFILE SYNC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_stories_updated ON public.stories;
CREATE TRIGGER trg_stories_updated BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_collections_updated ON public.collections;
CREATE TRIGGER trg_collections_updated BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_moodboards_updated ON public.moodboards;
CREATE TRIGGER trg_moodboards_updated BEFORE UPDATE ON public.moodboards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_aura_auth_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_verified BOOLEAN := NEW.email_confirmed_at IS NOT NULL;
  v_phone_verified BOOLEAN := NEW.phone_confirmed_at IS NOT NULL;
BEGIN
  INSERT INTO public.profiles (
    id, email, phone, display_name,
    email_verified, phone_verified, email_verified_at, phone_verified_at, account_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email, 'member'), '@', 1)),
    v_email_verified,
    v_phone_verified,
    NEW.email_confirmed_at,
    NEW.phone_confirmed_at,
    CASE WHEN v_email_verified THEN 'active' ELSE 'pending_verification' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    email_verified = EXCLUDED.email_verified,
    phone_verified = EXCLUDED.phone_verified,
    email_verified_at = COALESCE(EXCLUDED.email_verified_at, public.profiles.email_verified_at),
    phone_verified_at = COALESCE(EXCLUDED.phone_verified_at, public.profiles.phone_verified_at),
    account_status = CASE
      WHEN public.profiles.account_status = 'suspended' THEN 'suspended'
      WHEN EXCLUDED.email_verified THEN 'active'
      ELSE public.profiles.account_status
    END,
    updated_at = NOW();

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_aura_auth_user_synced ON auth.users;
CREATE TRIGGER on_aura_auth_user_synced
  AFTER INSERT OR UPDATE OF email, phone, email_confirmed_at, phone_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_aura_auth_user_sync();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Public read for taxonomy and PUBLISHED stories only
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "Public read moods" ON public.moods FOR SELECT USING (TRUE);
CREATE POLICY "Public read tags" ON public.tags FOR SELECT USING (TRUE);

CREATE POLICY "Public read published stories" ON public.stories
  FOR SELECT USING (status = 'published' OR public.is_aura_admin());

CREATE POLICY "Public read published story sections" ON public.story_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND (s.status = 'published' OR public.is_aura_admin())
    )
  );

CREATE POLICY "Public read story tags" ON public.story_tags FOR SELECT USING (TRUE);
CREATE POLICY "Public read story moods" ON public.story_moods FOR SELECT USING (TRUE);

-- Admin-only editorial write access
CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());
CREATE POLICY "Admins manage moods" ON public.moods
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());
CREATE POLICY "Admins manage tags" ON public.tags
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());
CREATE POLICY "Admins manage stories" ON public.stories
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());
CREATE POLICY "Admins manage story sections" ON public.story_sections
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());
CREATE POLICY "Admins manage story tags" ON public.story_tags
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());
CREATE POLICY "Admins manage story moods" ON public.story_moods
  FOR ALL USING (public.is_aura_admin()) WITH CHECK (public.is_aura_admin());

-- Profiles: users read/update only their own safe fields; NEVER self-escalate role/verification
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_aura_admin());

CREATE POLICY "Users update own safe profile fields" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND email_verified = (SELECT p.email_verified FROM public.profiles p WHERE p.id = auth.uid())
    AND phone_verified = (SELECT p.phone_verified FROM public.profiles p WHERE p.id = auth.uid())
    AND account_status = (SELECT p.account_status FROM public.profiles p WHERE p.id = auth.uid())
  );

-- User Preferences: strict ownership
CREATE POLICY "Users manage own preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Collections & Collection Items: strict ownership
CREATE POLICY "Users manage own collections" ON public.collections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own collection items" ON public.collection_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );

-- Moodboards & Moodboard Items: strict ownership
CREATE POLICY "Users manage own moodboards" ON public.moodboards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own moodboard items" ON public.moodboard_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.moodboards m WHERE m.id = moodboard_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.moodboards m WHERE m.id = moodboard_id AND m.user_id = auth.uid())
  );

-- =============================================================================
-- SUPABASE STORAGE BUCKETS & POLICIES (5MB max, image MIME allowlist)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('story-covers', 'story-covers', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('user-avatars', 'user-avatars', TRUE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('moodboard-assets', 'moodboard-assets', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read story covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'story-covers');
CREATE POLICY "Admins upload story covers" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'story-covers' AND public.is_aura_admin());
CREATE POLICY "Admins delete story covers" ON storage.objects
  FOR DELETE USING (bucket_id = 'story-covers' AND public.is_aura_admin());

CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-avatars');
CREATE POLICY "Users manage own avatar folder" ON storage.objects
  FOR ALL
  USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public read moodboard assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'moodboard-assets');
CREATE POLICY "Users manage own moodboard assets" ON storage.objects
  FOR ALL
  USING (bucket_id = 'moodboard-assets' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'moodboard-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
