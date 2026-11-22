import { useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { CmsContent, Product, ProductCategory } from '../types/marketplace';
import { HeritageImage } from './HeritageImage';
import { ProductCard } from './ProductCard';

interface StorefrontHomeProps {
  cms: CmsContent;
  products: Product[];
  wishlistIds: string[];
  onSelectProduct: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onQuickAdd: (product: Product) => void;
  onExploreCatalogue: (category?: ProductCategory | 'All') => void;
  onExploreAteliers: () => void;
  onBecomeSeller: () => void;
}

const FEATURED_CATEGORIES: {
  name: ProductCategory;
  region: string;
  tagline: string;
}[] = [
  { name: 'Fashion & Ethnic Wear', region: 'Varanasi & Kutch', tagline: 'Kadwa Katan Silks & Zari Dupattas' },
  { name: 'Fine Jewellery', region: 'Johari Bazaar, Jaipur', tagline: '22K Polki Kundan & Meenakari' },
  { name: 'Kashmiri Shawls', region: 'Srinagar', tagline: 'Hand-Spun Changthangi Sozni' },
  { name: 'Handicrafts & Brass', region: 'Moradabad', tagline: 'Hand-Chased Sand-Cast Brass' },
  { name: 'Home Decor & Pottery', region: 'Sanganer, Jaipur', tagline: 'GI Quartz-Glazed Blue Pottery' },
  { name: 'Natural Wellness & Organic', region: 'Kannauj & Pampore', tagline: 'Copper-Still Attars & Kashmiri Saffron' },
];

export function StorefrontHome({
  cms,
  products,
  wishlistIds,
  onSelectProduct,
  onToggleWishlist,
  onQuickAdd,
  onExploreCatalogue,
  onExploreAteliers,
  onBecomeSeller,
}: StorefrontHomeProps) {
  const slides =
    cms.heroSlides && cms.heroSlides.length > 0
      ? cms.heroSlides
      : [
          {
            id: 'default',
            kicker: cms.hero.kicker,
            headline: cms.hero.headline,
            subheadline: cms.hero.subheadline,
            ctaLabel: cms.hero.ctaLabel,
            categoryTarget: 'All' as const,
            imageUrl: cms.hero.imageUrl,
            captionLabel: 'Jaipur & Varanasi Curatorial Archive',
            captionTitle: 'Numbered editions dispatched directly from master karkhanas',
          },
        ];

  const [slideIdx, setSlideIdx] = useState(0);
  const [collectionTab, setCollectionTab] = useState<'trending' | 'new' | 'bestsellers'>('trending');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);
  const [submittingNews, setSubmittingNews] = useState(false);

  const currentSlide = slides[slideIdx % slides.length];
  const activeProducts = products.filter((p) => p.status === 'active' && p.approved);

  const displayProducts = [...activeProducts]
    .sort((a, b) => {
      if (collectionTab === 'new') return b.createdAt.localeCompare(a.createdAt);
      if (collectionTab === 'bestsellers') return b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount;
      return Number(b.featured) - Number(a.featured) || b.ratingAvg - a.ratingAvg;
    })
    .slice(0, 6);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubmittingNews(true);
    setNewsletterStatus(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/newsletter', {
        method: 'POST',
        body: { email: newsletterEmail.trim() },
      });
      setNewsletterStatus(res.message);
      setNewsletterEmail('');
    } catch (err) {
      setNewsletterStatus(err instanceof Error ? err.message : 'Subscription failed.');
    } finally {
      setSubmittingNews(false);
    }
  };

  return (
    <main>
      {/* Section 1: Editorial Hero Carousel */}
      <section className="border-b border-[#DFD3C0] bg-[#F3ECE1]/60">
        <div className="max-w-[1280px] mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-center">
            <p className="text-xs text-[#A67C37] tracking-[0.16em] uppercase font-medium">
              {currentSlide.kicker}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08] font-semibold text-[#231B17] mt-4 text-balance">
              {currentSlide.headline}
            </h1>
            <p className="text-[15px] leading-relaxed text-[#6E5F54] mt-5 max-w-lg">
              {currentSlide.subheadline}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onExploreCatalogue(currentSlide.categoryTarget || 'All')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] transition-colors whitespace-nowrap"
              >
                <span>{currentSlide.ctaLabel}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onExploreAteliers}
                className="px-5 py-3 border border-[#DFD3C0] bg-[#FAF7F2] text-[#231B17] text-sm font-medium hover:border-[#6B1D2A] transition-colors whitespace-nowrap"
              >
                Meet the Ateliers
              </button>
            </div>

            {slides.length > 1 && (
              <div className="mt-8 flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Previous editorial slide"
                  onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)}
                  className="p-2 border border-[#DFD3C0] bg-[#FAF7F2] text-[#231B17] hover:border-[#6B1D2A]"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-2">
                  {slides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={`View slide ${idx + 1}`}
                      onClick={() => setSlideIdx(idx)}
                      className={`h-1.5 transition-all ${
                        idx === slideIdx ? 'w-8 bg-[#6B1D2A]' : 'w-3 bg-[#DFD3C0]'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Next editorial slide"
                  onClick={() => setSlideIdx((i) => (i + 1) % slides.length)}
                  className="p-2 border border-[#DFD3C0] bg-[#FAF7F2] text-[#231B17] hover:border-[#6B1D2A]"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-[#DFD3C0] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#6E5F54]">
              <span>GI-Tagged Crafts</span>
              <span aria-hidden="true">·</span>
              <span>Dual OTP Verified Checkout</span>
              <span aria-hidden="true">·</span>
              <span>Insured Vault Courier</span>
            </div>
          </div>

          <div className="lg:col-span-7 relative min-h-[320px] lg:min-h-[480px] overflow-hidden bg-[#EBE1D1]">
            <HeritageImage
              src={currentSlide.imageUrl}
              alt={currentSlide.headline}
              fallbackTitle="VIRAASAT Heritage Salon"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1A130F]/90 via-[#1A130F]/50 to-transparent p-6 text-[#FAF7F2]">
              <p className="text-xs tracking-widest uppercase text-[#F0D9A7]">
                {currentSlide.captionLabel}
              </p>
              <p className="font-display text-2xl mt-1">{currentSlide.captionTitle}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Featured Heritage Categories */}
      <section className="max-w-[1280px] mx-auto px-6 pt-14 pb-6">
        <div className="flex items-end justify-between gap-4 pb-6 border-b border-[#DFD3C0]">
          <div>
            <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Craft Disciplines</p>
            <h2 className="font-display text-3xl font-semibold text-[#231B17] mt-1">
              Explore by Craft Category
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-7">
          {FEATURED_CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => onExploreCatalogue(cat.name)}
              className="group text-left p-5 bg-white border border-[#DFD3C0] hover:border-[#6B1D2A] transition-colors flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#A67C37]">{cat.region}</p>
                <h3 className="font-display text-xl font-semibold text-[#231B17] mt-0.5 group-hover:text-[#6B1D2A] transition-colors">
                  {cat.name}
                </h3>
                <p className="text-xs text-[#6E5F54] mt-1">{cat.tagline}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#6E5F54] group-hover:text-[#6B1D2A] shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      {/* Section 3: Curated Collection Tabs (Trending / New Arrivals / Best Sellers) */}
      <section className="max-w-[1280px] mx-auto px-6 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#DFD3C0]">
          <div>
            <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
              Curated Acquisitions
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#231B17] mt-1">
              The Heritage Collection
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'trending', label: 'Trending' },
                { id: 'new', label: 'New Arrivals' },
                { id: 'bestsellers', label: 'Best Sellers' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCollectionTab(t.id)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  collectionTab === t.id
                    ? 'bg-[#6B1D2A] text-[#FAF7F2]'
                    : 'bg-[#F3ECE1] text-[#231B17] hover:bg-[#EBE1D1]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 mt-9">
          {displayProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlisted={wishlistIds.includes(product.id)}
              onSelect={onSelectProduct}
              onToggleWishlist={onToggleWishlist}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>

        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => onExploreCatalogue('All')}
            className="inline-flex items-center gap-2 px-6 py-3 border border-[#231B17] text-xs font-medium text-[#231B17] hover:bg-[#231B17] hover:text-[#FAF7F2] transition-colors"
          >
            <span>Explore All {activeProducts.length} Archive Editions</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Section 4: Provenance Narrative & Evidence */}
      <section className="bg-[#F3ECE1] border-y border-[#DFD3C0]">
        <div className="max-w-[1280px] mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
              Craft Provenance
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#231B17] mt-2 text-balance">
              {cms.heritageStory.heading}
            </h2>
            <p className="font-display text-xl text-[#231B17]/90 mt-4 leading-relaxed">
              {cms.heritageStory.lead}
            </p>
            <p className="text-sm text-[#6E5F54] mt-4 leading-relaxed max-w-2xl">
              {cms.heritageStory.body}
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={onBecomeSeller}
                className="text-xs font-medium text-[#6B1D2A] underline underline-offset-4 hover:text-[#52141F]"
              >
                Represent a GI Craft House? Apply for Atelier Onboarding →
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 gap-5 border-t lg:border-t-0 lg:border-l border-[#DFD3C0] pt-6 lg:pt-0 lg:pl-10">
            <div className="pb-5 border-b border-[#DFD3C0]">
              <p className="font-display text-3xl font-semibold text-[#6B1D2A]">
                {cms.heritageStory.atelierCount}
              </p>
              <p className="text-xs text-[#6E5F54] mt-1">
                Multi-generational workshops vetted for fair artisan equity
              </p>
            </div>
            <div className="pb-5 border-b border-[#DFD3C0]">
              <p className="font-display text-3xl font-semibold text-[#6B1D2A]">
                {cms.heritageStory.craftClusters}
              </p>
              <p className="text-xs text-[#6E5F54] mt-1">
                Varanasi, Jaipur, Srinagar, Moradabad, Kannauj, and Kutch
              </p>
            </div>
            <div>
              <p className="font-display text-3xl font-semibold text-[#6B1D2A]">
                {cms.heritageStory.authenticityGuarantee}
              </p>
              <p className="text-xs text-[#6E5F54] mt-1">
                Signed craft card, GI certification, and HMAC-verified Razorpay settlement
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Patron Testimonials & Newsletter Dispatch */}
      <section className="max-w-[1280px] mx-auto px-6 py-16 space-y-14">
        {cms.testimonials && cms.testimonials.length > 0 && (
          <div>
            <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Patron Voices</p>
            <h2 className="font-display text-3xl font-semibold text-[#231B17] mt-1">
              From Private Collections
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-7">
              {cms.testimonials.map((tst) => (
                <blockquote
                  key={tst.id}
                  className="p-6 bg-white border border-[#DFD3C0] flex flex-col justify-between gap-4"
                >
                  <p className="font-display text-lg text-[#231B17] leading-relaxed">
                    “{tst.quote}”
                  </p>
                  <footer className="text-xs text-[#6E5F54] pt-3 border-t border-[#DFD3C0]">
                    <p className="font-semibold text-[#231B17]">
                      {tst.patronName} · {tst.city}
                    </p>
                    <p className="mt-0.5">{tst.acquisition}</p>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#231B17] text-[#FAF7F2] p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-1.5">
            <p className="text-xs text-[#D4B475] tracking-[0.16em] uppercase">
              Private Collector Dispatches
            </p>
            <h2 className="font-display text-3xl">
              Receive Early Access to Single-Loom Releases
            </h2>
            <p className="text-xs text-[#DFD3C0]">
              Occasional letters on newly commissioned weaves, Jaipur kiln firings, and seasonal Kannauj harvests.
            </p>
          </div>
          <form onSubmit={handleSubscribe} className="lg:col-span-5 space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address for collector dispatches
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="patron@example.com"
                className="flex-1 px-4 py-2.5 text-sm bg-[#FAF7F2] text-[#231B17] border border-[#DFD3C0]"
              />
              <button
                type="submit"
                disabled={submittingNews}
                className="px-5 py-2.5 bg-[#A67C37] text-[#FAF7F2] text-xs font-medium hover:bg-[#8E682B] whitespace-nowrap disabled:opacity-50"
              >
                {submittingNews ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
            {newsletterStatus && (
              <p className="text-xs text-[#F0D9A7]">{newsletterStatus}</p>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
