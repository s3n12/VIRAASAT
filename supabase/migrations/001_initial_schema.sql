-- ============================================================================
-- VIRAASAT — Luxury Indian Lifestyle & Artisan Marketplace
-- Complete Normalized PostgreSQL / Supabase Migration (29 Tables + RLS)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'seller', 'admin');
  CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');
  CREATE TYPE order_status AS ENUM ('placed', 'confirmed', 'crafted', 'dispatched', 'delivered', 'cancelled', 'refunded');
  CREATE TYPE payment_status AS ENUM ('pending', 'authorized', 'captured', 'failed', 'refunded');
  CREATE TYPE otp_channel AS ENUM ('email', 'phone');
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
  CREATE TYPE refund_status AS ENUM ('requested', 'approved', 'rejected', 'processed');
  CREATE TYPE coupon_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. PROFILES, ROLES & DUAL VERIFICATIONS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  phone TEXT UNIQUE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  notification_preferences JSONB NOT NULL DEFAULT '{"orderEmail":true,"orderSms":true,"securityAlerts":true,"editorialNewsletter":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'customer',
  assigned_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  channel otp_channel NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_verifications_lookup ON public.user_verifications (identifier, channel, created_at DESC);

-- 3. SELLER PROFILES & KYC DOCUMENTS
CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_address TEXT NOT NULL,
  craft_region TEXT NOT NULL,
  gstin TEXT,
  pan_number TEXT NOT NULL,
  bank_account_last4 TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  commission_override_percent NUMERIC(5, 2),
  approval_status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.seller_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_profile_id UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_reference TEXT NOT NULL,
  storage_path TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CATEGORIES, PRODUCTS, IMAGES, VARIANTS & INVENTORY
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  subtitle TEXT,
  description TEXT NOT NULL,
  craft_origin TEXT NOT NULL,
  atelier_name TEXT NOT NULL,
  price_inr NUMERIC(12, 2) NOT NULL CHECK (price_inr > 0),
  discount_price_inr NUMERIC(12, 2) CHECK (discount_price_inr IS NULL OR discount_price_inr > 0),
  material TEXT,
  weight_grams INTEGER,
  dimensions TEXT,
  shipping_info TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  provenance_note TEXT,
  care_instructions TEXT,
  craft_time_days INTEGER NOT NULL DEFAULT 21,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  status product_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_discovery ON public.products (status, approved, featured, craft_origin);

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  size TEXT,
  color TEXT,
  price_delta_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CARTS, WISHLISTS & ADDRESSES
CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, product_id, variant_label)
);

CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  wishlist_id UUID NOT NULL REFERENCES public.wishlists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wishlist_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Residence',
  full_name TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL CHECK (postal_code ~ '^\d{6}$'),
  phone TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. COUPONS, ORDERS, PAYMENTS, REFUNDS & SHIPMENTS
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  type coupon_type NOT NULL,
  value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
  min_order_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_discount_inr NUMERIC(12, 2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  subtotal_inr NUMERIC(12, 2) NOT NULL CHECK (subtotal_inr >= 0),
  discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_inr >= 0),
  tax_inr NUMERIC(12, 2) NOT NULL CHECK (tax_inr >= 0),
  shipping_inr NUMERIC(12, 2) NOT NULL CHECK (shipping_inr >= 0),
  shipping_method TEXT NOT NULL DEFAULT 'standard',
  total_inr NUMERIC(12, 2) NOT NULL CHECK (total_inr > 0),
  payment_method TEXT NOT NULL DEFAULT 'upi',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  status order_status NOT NULL DEFAULT 'placed',
  shipping_address JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_inr NUMERIC(12, 2) NOT NULL CHECK (unit_price_inr > 0)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  discount_inr NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  gateway TEXT NOT NULL DEFAULT 'razorpay',
  gateway_order_id TEXT UNIQUE,
  gateway_payment_id TEXT UNIQUE,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  amount_inr NUMERIC(12, 2) NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  amount_inr NUMERIC(12, 2) NOT NULL,
  status refund_status NOT NULL DEFAULT 'requested',
  admin_note TEXT,
  processed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL DEFAULT 'BlueDart Vault Insured',
  tracking_number TEXT,
  status TEXT NOT NULL DEFAULT 'preparing',
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. REVIEWS, NOTIFICATIONS, EDITORIAL CMS, NEWSLETTER, SETTINGS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 5 AND 1000),
  verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'order',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.artisan_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  region TEXT NOT NULL,
  read_time TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kicker TEXT NOT NULL,
  headline TEXT NOT NULL,
  subheadline TEXT NOT NULL,
  cta_label TEXT NOT NULL,
  image_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- 8. ROW LEVEL SECURITY (RLS) HELPER & POLICIES
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_dual_verified() RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND email_verified = TRUE AND phone_verified = TRUE AND suspended = FALSE
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artisan_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_or_admin ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY user_roles_self_or_admin ON public.user_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY user_roles_admin_write ON public.user_roles
  FOR ALL USING (public.is_admin());

CREATE POLICY seller_profiles_owner_or_admin ON public.seller_profiles
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY products_public_approved ON public.products
  FOR SELECT USING ((status = 'active' AND approved = TRUE) OR seller_id = auth.uid() OR public.is_admin());
CREATE POLICY products_seller_write ON public.products
  FOR ALL USING (
    public.is_admin() OR (
      seller_id = auth.uid() AND public.is_dual_verified() AND EXISTS (
        SELECT 1 FROM public.seller_profiles sp WHERE sp.user_id = auth.uid() AND sp.approval_status = 'approved'
      )
    )
  );

CREATE POLICY addresses_owner_all ON public.addresses
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY orders_scoped_select ON public.orders
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = orders.id AND oi.seller_id = auth.uid())
  );
CREATE POLICY orders_dual_verified_insert ON public.orders
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_dual_verified());

CREATE POLICY refunds_owner_or_admin ON public.refunds
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY refunds_owner_insert ON public.refunds
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_dual_verified());

CREATE POLICY notifications_owner_all ON public.notifications
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY coupons_public_active ON public.coupons
  FOR SELECT USING (active = TRUE OR public.is_admin());
CREATE POLICY coupons_admin_write ON public.coupons
  FOR ALL USING (public.is_admin());

CREATE POLICY banners_public_read ON public.banners FOR SELECT USING (TRUE);
CREATE POLICY banners_admin_write ON public.banners FOR ALL USING (public.is_admin());

CREATE POLICY stories_public_read ON public.artisan_stories FOR SELECT USING (published = TRUE OR public.is_admin());
CREATE POLICY stories_admin_write ON public.artisan_stories FOR ALL USING (public.is_admin());

CREATE POLICY settings_admin_only ON public.admin_settings FOR ALL USING (public.is_admin());
CREATE POLICY audit_logs_admin_read ON public.audit_logs FOR SELECT USING (public.is_admin());
