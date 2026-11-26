import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { CartDrawer } from './components/CartDrawer';
import { CatalogueView } from './components/CatalogueView';
import { CheckoutView } from './components/CheckoutView';
import { CustomerDashboard } from './components/CustomerDashboard';
import { AteliersView, JournalView } from './components/EditorialViews';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header, type AppView } from './components/Header';
import { ProductDetailView } from './components/ProductDetailView';
import {
  AboutView,
  ContactView,
  FaqView,
  PolicyView,
  SellerRegistrationView,
} from './components/PublicPages';
import { SellerDashboard } from './components/SellerDashboard';
import { StorefrontHome } from './components/StorefrontHome';
import { apiRequest } from './lib/api';
import { getEffectiveProductPrice } from './lib/commerce';
import { auth } from './lib/firebase';
import { applySeoMetadata } from './lib/seo';
import { getBrowserSupabaseClient } from './lib/supabaseClient';
import type {
  CartItem,
  CmsContent,
  Order,
  Product,
  ProductCategory,
  UserProfile,
} from './types/marketplace';

const DEFAULT_CMS: CmsContent = {
  announcement: {
    enabled: true,
    text: 'Complimentary Insured Vault Delivery above ₹25,000 · Use code VIRAASAT10 · GI-Certified Indian Ateliers',
  },
  hero: {
    kicker: 'Autumn / Winter Archive · Direct from Master Ateliers',
    headline: 'Living Indian Heritage, Woven for Generations',
    subheadline:
      'Acquire authenticated Banarasi Katan silks, Jaipur Polki Kundan, Blue Pottery, Kashmiri Sozni Pashmina, and Kannauj botanicals directly from fifth-generation craft houses.',
    ctaLabel: 'Explore the Archive',
    imageUrl: '/src/assets/images/hero_viraasat_heritage_1795263356378.jpg',
  },
  heroSlides: [],
  heritageStory: {
    heading: 'Provenance Without Intermediaries',
    lead: 'Every VIRAASAT acquisition is numbered, GI-verified, and dispatched directly from the master artisan house that created it.',
    body: 'Across Varanasi, Jaipur, Srinagar, Moradabad, Kannauj, and Kutch, living craft lineages sustain techniques that take months per piece.',
    atelierCount: '38 Master Ateliers',
    craftClusters: '12 GI Craft Clusters',
    authenticityGuarantee: '100% Signed Provenance',
  },
  testimonials: [],
  journalEntries: [],
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [catalogueCategory, setCatalogueCategory] = useState<ProductCategory | 'All'>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cms, setCms] = useState<CmsContent>(DEFAULT_CMS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dashboardPane, setDashboardPane] = useState<'customer' | 'seller' | 'admin'>('customer');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const fetchCatalogueAndCms = async () => {
    try {
      const [prodRes, cmsRes] = await Promise.all([
        apiRequest<{ products: Product[] }>('/api/products?includeAll=true'),
        apiRequest<{ cms: CmsContent }>('/api/cms'),
      ]);
      setProducts(prodRes.products);
      setCms(cmsRes.cms);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to reach VIRAASAT gallery server.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCatalogueAndCms();
  }, []);

  // Dynamic SEO titles, meta descriptions, canonical URL & Schema.org JSON-LD
  useEffect(() => {
    if (view === 'product' && selectedProduct) {
      applySeoMetadata({
        title: selectedProduct.seoTitle || `${selectedProduct.title} | VIRAASAT`,
        description: selectedProduct.seoDescription || selectedProduct.subtitle,
        path: `/product/${selectedProduct.slug}`,
        product: selectedProduct,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: selectedProduct.category, path: '/catalogue' },
          { name: selectedProduct.title, path: `/product/${selectedProduct.slug}` },
        ],
      });
      return;
    }

    const metaMap: Record<Exclude<AppView, 'product'>, { title: string; desc: string; path: string }> = {
      home: {
        title: 'VIRAASAT — Luxury Indian Heritage & Artisan Marketplace',
        desc: 'Acquire authenticated Banarasi silks, Jaipur Polki Kundan, Blue Pottery, Kashmiri Pashmina, and Kannauj botanicals directly from master Indian ateliers.',
        path: '/',
      },
      catalogue: {
        title:
          catalogueCategory === 'All'
            ? 'Artisan Catalogue | VIRAASAT'
            : `${catalogueCategory} | VIRAASAT`,
        desc: 'Explore GI-certified Indian ethnic wear, fine jewellery, handicrafts, pottery, and natural wellness curated directly from master ateliers.',
        path: '/catalogue',
      },
      ateliers: {
        title: 'Master Ateliers & Craft Houses | VIRAASAT',
        desc: 'Meet the vetted Indian craft houses behind VIRAASAT across Varanasi, Jaipur, Srinagar, Moradabad, and Kannauj.',
        path: '/ateliers',
      },
      journal: {
        title: 'Artisan Stories & Heritage Journal | VIRAASAT',
        desc: 'Editorial essays exploring Kadwa pit looms, Champlevé Meenakari, Jaipur Blue Pottery, and Kannauj copper-still attars.',
        path: '/journal',
      },
      about: {
        title: 'About VIRAASAT — Direct Artisan Patronage',
        desc: 'Learn how VIRAASAT sustains India’s living craft clusters with direct artisan equity and dual-verified commerce.',
        path: '/about',
      },
      'seller-register': {
        title: 'Artisan & Seller Onboarding | VIRAASAT',
        desc: 'Apply to partner your Indian craft house or GI-certified atelier with VIRAASAT.',
        path: '/seller-registration',
      },
      contact: {
        title: 'Contact Curatorial Concierge | VIRAASAT',
        desc: 'Reach VIRAASAT’s New Delhi and Varanasi concierge for bespoke commissions and patron assistance.',
        path: '/contact',
      },
      faq: {
        title: 'Frequently Asked Questions | VIRAASAT',
        desc: 'Answers on GI authenticity, dual Email and Phone OTP security, Razorpay payments, and insured vault delivery.',
        path: '/faq',
      },
      privacy: {
        title: 'Privacy Policy | VIRAASAT',
        desc: 'How VIRAASAT safeguards patron identity, OTP credentials, and privacy.',
        path: '/privacy-policy',
      },
      terms: {
        title: 'Terms & Conditions | VIRAASAT',
        desc: 'Marketplace terms governing direct artisan acquisitions and server-verified settlement.',
        path: '/terms',
      },
      returns: {
        title: 'Return & Refund Policy | VIRAASAT',
        desc: '7-day archival inspection window and refund settlement guidelines.',
        path: '/return-policy',
      },
      shipping: {
        title: 'Insured Vault Shipping Policy | VIRAASAT',
        desc: 'Complimentary insured courier over ₹25,000 and armored express air dispatch across India.',
        path: '/shipping-policy',
      },
      checkout: {
        title: 'Dual-Verified Insured Checkout | VIRAASAT',
        desc: 'Complete your authenticated VIRAASAT acquisition with Razorpay HMAC-verified settlement.',
        path: '/checkout',
      },
      dashboard: {
        title: 'Member Portal | VIRAASAT',
        desc: 'Manage your VIRAASAT acquisitions, artisan studio listings, or Super Admin governance console.',
        path: '/dashboard',
      },
    };

    const meta = metaMap[view === 'product' ? 'home' : view];
    applySeoMetadata({
      title: meta.title,
      description: meta.desc,
      path: meta.path,
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: meta.title.split(' | ')[0], path: meta.path },
      ],
    });
  }, [view, selectedProduct, catalogueCategory]);

  const navigateTo = (next: AppView, category?: ProductCategory | 'All') => {
    if (next === 'dashboard' && !user) {
      setAuthOpen(true);
      return;
    }
    if (category) {
      setCatalogueCategory(category);
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthenticated = async (
    newToken: string,
    newUser: UserProfile,
    redirectAfterDualVerify = false
  ) => {
    setToken(newToken);
    setUser(newUser);
    if (newUser.role === 'admin') {
      setDashboardPane('admin');
    } else if (newUser.role === 'seller') {
      setDashboardPane('seller');
    } else {
      setDashboardPane('customer');
    }

    if (redirectAfterDualVerify && newUser.emailVerified && newUser.phoneVerified) {
      setView('dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast(
        newUser.role === 'admin'
          ? 'Signed in as Super Admin.'
          : newUser.role === 'seller'
            ? 'Signed in to your Artisan Studio dashboard.'
            : 'Account verified and activated. Welcome to your Customer Dashboard.'
      );
    }

    try {
      const wl = await apiRequest<{ productIds: string[] }>('/api/wishlist', {
        token: newToken,
      });
      setWishlistIds(wl.productIds);
    } catch {
      // ignore non-fatal sync error
    }
  };

  const handleLogout = async () => {
    if (token) {
      await apiRequest('/api/auth/logout', { method: 'POST', token }).catch(() => {});
    }
    const sb = getBrowserSupabaseClient();
    if (sb) {
      await sb.auth.signOut().catch(() => {});
    }
    await firebaseSignOut(auth).catch(() => {});
    setToken(null);
    setUser(null);
    setWishlistIds([]);
    setView('home');
    showToast('Signed out securely. Session revoked in Supabase Auth.');
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setRecentlyViewedIds((prev) => [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 6));
    setView('product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddToCart = async (
    product: Product,
    variantLabel?: string,
    quantity = 1
  ) => {
    const resolvedVariant =
      product.variants.find((v) => v.label === variantLabel) ||
      product.variants[0] || {
        label: 'Standard Atelier Edition',
        sku: product.sku,
        priceDeltaInr: 0,
      };
    const unitPriceInr = getEffectiveProductPrice(product) + resolvedVariant.priceDeltaInr;

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === product.id && i.variantLabel === resolvedVariant.label
      );
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((i) =>
          i.productId === product.id && i.variantLabel === resolvedVariant.label
            ? { ...i, quantity: nextQty }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          variantLabel: resolvedVariant.label,
          quantity: Math.min(product.stock, quantity),
          title: product.title,
          atelierName: product.atelierName,
          craftOrigin: product.craftOrigin,
          imageUrl: product.imageUrl,
          unitPriceInr,
          stock: product.stock,
        },
      ];
    });

    if (token) {
      await apiRequest('/api/cart', {
        method: 'POST',
        token,
        body: { productId: product.id, variantLabel: resolvedVariant.label, quantity },
      }).catch(() => {});
    }

    setCartOpen(true);
    showToast(`Added "${product.title}" to your acquisition bag.`);
  };

  const handleUpdateCartQty = async (
    productId: string,
    variantLabel: string,
    quantity: number
  ) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter(
          (i) => !(i.productId === productId && i.variantLabel === variantLabel)
        );
      }
      return prev.map((i) =>
        i.productId === productId && i.variantLabel === variantLabel
          ? { ...i, quantity: Math.min(i.stock, quantity) }
          : i
      );
    });
    if (token) {
      await apiRequest('/api/cart', {
        method: 'PATCH',
        token,
        body: { productId, variantLabel, quantity },
      }).catch(() => {});
    }
  };

  const handleToggleWishlist = async (productId: string) => {
    setWishlistIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
    if (token) {
      await apiRequest(`/api/wishlist/${productId}`, {
        method: 'POST',
        token,
      }).catch(() => {});
    }
  };

  const handleOrderCompleted = (_order: Order) => {
    setCart([]);
    void fetchCatalogueAndCms();
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#231B17]">
        <Header
          activeView={view}
          onNavigate={navigateTo}
          cartCount={cartCount}
          onOpenCart={() => setCartOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          user={user}
          announcement={cms.announcement}
        />

        {toast && (
          <div
            role="status"
            className="fixed bottom-5 right-5 z-50 px-4 py-3 bg-[#231B17] text-[#FAF7F2] text-xs shadow-lg border border-[#A67C37]/40 max-w-sm"
          >
            {toast}
          </div>
        )}

        <div className="flex-1">
          {loading ? (
            <div className="max-w-[1280px] mx-auto px-6 py-16 space-y-8">
              <div className="h-[420px] bg-[#F3ECE1] animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                <div className="h-80 bg-[#F3ECE1] animate-pulse" />
                <div className="h-80 bg-[#F3ECE1] animate-pulse" />
                <div className="h-80 bg-[#F3ECE1] animate-pulse" />
              </div>
            </div>
          ) : loadError ? (
            <div className="max-w-lg mx-auto px-6 py-20 text-center">
              <p className="font-display text-2xl text-[#6B1D2A]">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchCatalogueAndCms()}
                className="mt-4 px-5 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {view === 'home' && (
                <StorefrontHome
                  cms={cms}
                  products={products}
                  wishlistIds={wishlistIds}
                  onSelectProduct={handleSelectProduct}
                  onToggleWishlist={handleToggleWishlist}
                  onQuickAdd={(p) => void handleAddToCart(p)}
                  onExploreCatalogue={(cat) => navigateTo('catalogue', cat || 'All')}
                  onExploreAteliers={() => navigateTo('ateliers')}
                  onBecomeSeller={() => navigateTo('seller-register')}
                />
              )}

              {view === 'catalogue' && (
                <CatalogueView
                  products={products}
                  initialCategory={catalogueCategory}
                  wishlistIds={wishlistIds}
                  recentlyViewedIds={recentlyViewedIds}
                  onSelectProduct={handleSelectProduct}
                  onToggleWishlist={handleToggleWishlist}
                  onQuickAdd={(p) => void handleAddToCart(p)}
                />
              )}

              {view === 'product' && selectedProduct && (
                <ProductDetailView
                  product={
                    products.find((p) => p.id === selectedProduct.id) || selectedProduct
                  }
                  wishlisted={wishlistIds.includes(selectedProduct.id)}
                  wishlistIds={wishlistIds}
                  token={token}
                  user={user}
                  onBack={() => navigateTo('catalogue')}
                  onSelectProduct={handleSelectProduct}
                  onToggleWishlist={handleToggleWishlist}
                  onAddToCart={(p, variant, qty) => void handleAddToCart(p, variant, qty)}
                  onOpenAuth={() => setAuthOpen(true)}
                  onProductUpdated={(updated) =>
                    setProducts((prev) =>
                      prev.map((p) => (p.id === updated.id ? updated : p))
                    )
                  }
                />
              )}

              {view === 'ateliers' && (
                <AteliersView products={products} onSelectProduct={handleSelectProduct} />
              )}

              {view === 'journal' && <JournalView cms={cms} />}
              {view === 'about' && (
                <AboutView
                  onExploreCatalogue={() => navigateTo('catalogue', 'All')}
                  onBecomeSeller={() => navigateTo('seller-register')}
                />
              )}
              {view === 'seller-register' && <SellerRegistrationView />}
              {view === 'contact' && <ContactView />}
              {view === 'faq' && <FaqView />}
              {(view === 'privacy' || view === 'terms' || view === 'returns' || view === 'shipping') && (
                <PolicyView type={view} />
              )}

              {view === 'checkout' && (
                <CheckoutView
                  items={cart}
                  user={user}
                  token={token}
                  onOpenAuth={() => setAuthOpen(true)}
                  onOrderCompleted={handleOrderCompleted}
                  onBackToCatalogue={() => navigateTo('catalogue', 'All')}
                />
              )}

              {view === 'dashboard' && user && token && (
                <main className="max-w-[1280px] mx-auto px-6 py-12 space-y-8">
                  <div className="pb-6 border-b border-[#DFD3C0] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                      <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
                        {user.role === 'admin'
                          ? 'Super Admin Governance'
                          : user.role === 'seller'
                            ? 'Artisan Atelier Studio'
                            : 'Patron Account'}
                      </p>
                      <h1 className="font-display text-4xl text-[#231B17] mt-1">
                        Namaste, {user.displayName}
                      </h1>
                      <p className="text-xs text-[#6E5F54] mt-1">
                        {user.email} · {user.phone || 'Phone not verified'} · Role:{' '}
                        <strong className="uppercase text-[#6B1D2A]">{user.role}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDashboardPane('customer')}
                        className={`px-3.5 py-2 text-xs font-medium transition-colors ${
                          dashboardPane === 'customer'
                            ? 'bg-[#231B17] text-[#FAF7F2]'
                            : 'bg-[#F3ECE1] text-[#231B17]'
                        }`}
                      >
                        Patron View
                      </button>
                      {(user.role === 'seller' || user.role === 'admin') && (
                        <button
                          type="button"
                          onClick={() => setDashboardPane('seller')}
                          className={`px-3.5 py-2 text-xs font-medium transition-colors ${
                            dashboardPane === 'seller'
                              ? 'bg-[#231B17] text-[#FAF7F2]'
                              : 'bg-[#F3ECE1] text-[#231B17]'
                          }`}
                        >
                          Seller Studio
                        </button>
                      )}
                      {user.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => setDashboardPane('admin')}
                          className={`px-3.5 py-2 text-xs font-medium transition-colors ${
                            dashboardPane === 'admin'
                              ? 'bg-[#231B17] text-[#FAF7F2]'
                              : 'bg-[#F3ECE1] text-[#231B17]'
                          }`}
                        >
                          Admin Console
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#DFD3C0] bg-white text-[#6B1D2A] hover:border-[#6B1D2A]"
                      >
                        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>

                  {dashboardPane === 'customer' && (
                    <CustomerDashboard
                      user={user}
                      token={token}
                      products={products}
                      wishlistIds={wishlistIds}
                      onToggleWishlist={handleToggleWishlist}
                      onSelectProduct={handleSelectProduct}
                      onOpenAuth={() => setAuthOpen(true)}
                      onUserUpdated={(updated) => setUser(updated)}
                    />
                  )}

                  {dashboardPane === 'seller' &&
                    (user.role === 'seller' || user.role === 'admin') && (
                      <SellerDashboard
                        user={user}
                        token={token}
                        products={products}
                        onRefreshProducts={fetchCatalogueAndCms}
                      />
                    )}

                  {dashboardPane === 'admin' && user.role === 'admin' && (
                    <AdminDashboard
                      token={token}
                      cms={cms}
                      products={products}
                      onCmsUpdated={(updated) => setCms(updated)}
                      onRefreshProducts={fetchCatalogueAndCms}
                    />
                  )}
                </main>
              )}
            </>
          )}
        </div>

        {/* Comprehensive Luxury Editorial Footer */}
        <footer className="border-t border-[#DFD3C0] bg-[#F3ECE1]/70 mt-16">
          <div className="max-w-[1280px] mx-auto px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 text-xs text-[#6E5F54]">
            <div className="lg:col-span-2 space-y-2">
              <p className="font-display text-2xl tracking-[0.18em] text-[#231B17]">VIRAASAT</p>
              <p className="max-w-sm leading-relaxed">
                Curated Indian heritage lifestyle and artisan marketplace connecting patrons directly with GI-certified master weavers, jewellers, potters, metalworkers, and perfumers.
              </p>
              <p className="pt-2 text-[11px]">© 2026 VIRAASAT Heritage Crafts · All rights reserved.</p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-[#231B17]">Collections</p>
              <ul className="space-y-1.5">
                {(
                  [
                    'Fashion & Ethnic Wear',
                    'Fine Jewellery',
                    'Kashmiri Shawls',
                    'Handicrafts & Brass',
                    'Home Decor & Pottery',
                    'Natural Wellness & Organic',
                  ] as ProductCategory[]
                ).map((cat) => (
                  <li key={cat}>
                    <button
                      type="button"
                      onClick={() => navigateTo('catalogue', cat)}
                      className="hover:text-[#6B1D2A]"
                    >
                      {cat}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-[#231B17]">House of VIRAASAT</p>
              <ul className="space-y-1.5">
                <li>
                  <button type="button" onClick={() => navigateTo('about')} className="hover:text-[#6B1D2A]">
                    About Us
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('ateliers')} className="hover:text-[#6B1D2A]">
                    Master Ateliers
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('journal')} className="hover:text-[#6B1D2A]">
                    Artisan Stories
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('seller-register')} className="hover:text-[#6B1D2A]">
                    Seller Registration
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('contact')} className="hover:text-[#6B1D2A]">
                    Contact Concierge
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('faq')} className="hover:text-[#6B1D2A]">
                    FAQ
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-[#231B17]">Policies & Security</p>
              <ul className="space-y-1.5">
                <li>
                  <button type="button" onClick={() => navigateTo('privacy')} className="hover:text-[#6B1D2A]">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('terms')} className="hover:text-[#6B1D2A]">
                    Terms & Conditions
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('returns')} className="hover:text-[#6B1D2A]">
                    Return & Refund Policy
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('shipping')} className="hover:text-[#6B1D2A]">
                    Shipping Policy
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </footer>

        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          items={cart}
          onUpdateQty={(pid, v, q) => void handleUpdateCartQty(pid, v, q)}
          onProceedCheckout={() => navigateTo('checkout')}
          onBrowseCatalogue={() => navigateTo('catalogue', 'All')}
        />

        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          token={token}
          user={user}
          onAuthenticated={(t, u) => void handleAuthenticated(t, u)}
        />
      </div>
    </ErrorBoundary>
  );
}
