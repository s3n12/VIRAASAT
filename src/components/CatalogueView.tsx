import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { filterAndSortProducts } from '../lib/commerce';
import type { Product, ProductCategory } from '../types/marketplace';
import { ProductCard } from './ProductCard';

interface CatalogueViewProps {
  products: Product[];
  initialCategory?: ProductCategory | 'All';
  wishlistIds: string[];
  recentlyViewedIds: string[];
  onSelectProduct: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onQuickAdd: (product: Product) => void;
}

const CATEGORIES: (ProductCategory | 'All')[] = [
  'All',
  'Fashion & Ethnic Wear',
  'Fine Jewellery',
  'Kashmiri Shawls',
  'Handicrafts & Brass',
  'Home Decor & Pottery',
  'Natural Wellness & Organic',
];

const PAGE_SIZE = 6;

export function CatalogueView({
  products,
  initialCategory = 'All',
  wishlistIds,
  recentlyViewedIds,
  onSelectProduct,
  onToggleWishlist,
  onQuickAdd,
}: CatalogueViewProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [category, setCategory] = useState<ProductCategory | 'All'>(initialCategory);
  const [origin, setOrigin] = useState<string>('All');
  const [atelier, setAtelier] = useState<string>('All');
  const [maxPrice, setMaxPrice] = useState<number>(250000);
  const [minRating, setMinRating] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<
    'featured' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest'
  >('featured');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setCategory(initialCategory);
    setPage(1);
  }, [initialCategory]);

  const origins = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.craftOrigin))).sort();
    return ['All', ...list];
  }, [products]);

  const ateliers = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.atelierName))).sort();
    return ['All', ...list];
  }, [products]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter(
        (p) =>
          p.status === 'active' &&
          p.approved &&
          `${p.title} ${p.craftOrigin} ${p.category} ${p.tags.join(' ')}`
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 4);
  }, [products, query]);

  const filtered = useMemo(
    () =>
      filterAndSortProducts(products, {
        query,
        category,
        origin,
        atelier,
        maxPrice,
        minRating,
        inStockOnly,
        sort,
      }),
    [products, query, category, origin, atelier, maxPrice, minRating, inStockOnly, sort]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const recentlyViewed = useMemo(
    () =>
      recentlyViewedIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p))
        .slice(0, 3),
    [recentlyViewedIds, products]
  );

  const resetFilters = () => {
    setQuery('');
    setCategory('All');
    setOrigin('All');
    setAtelier('All');
    setMaxPrice(250000);
    setMinRating(0);
    setInStockOnly(false);
    setSort('featured');
    setPage(1);
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-12">
      <div className="pb-8 border-b border-[#DFD3C0] flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
            Complete Archive
          </p>
          <h1 className="font-display text-4xl font-semibold text-[#231B17] mt-1">
            Artisan Catalogue
          </h1>
          <p className="text-sm text-[#6E5F54] mt-1">
            Search across handloom ethnic wear, Jaipur jewellery, Blue Pottery, brassware, Kashmiri pashmina, and natural wellness.
          </p>
        </div>

        <div className="relative w-full lg:w-96">
          <Search
            className="w-4 h-4 text-[#6E5F54] absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="catalogue-search" className="sr-only">
            Search heritage crafts, artisans, or regions
          </label>
          <input
            id="catalogue-search"
            type="search"
            value={query}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 160)}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search Banarasi, Pottery, Saffron, Polki..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#DFD3C0] text-[#231B17]"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#DFD3C0] shadow-lg divide-y divide-[#DFD3C0]/60">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={() => onSelectProduct(item)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-[#F3ECE1] flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-medium text-[#231B17] truncate">{item.title}</span>
                  <span className="text-[#6E5F54] shrink-0">{item.craftOrigin}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div
        role="tablist"
        aria-label="Filter by craft category"
        className="flex items-center gap-2 overflow-x-auto py-5 border-b border-[#DFD3C0]"
      >
        {CATEGORIES.map((cat) => {
          const active = category === cat;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => {
                setCategory(cat);
                setPage(1);
              }}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#6B1D2A] text-[#FAF7F2]'
                  : 'bg-[#F3ECE1] text-[#231B17] hover:bg-[#EBE1D1]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6E5F54]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#A67C37]" aria-hidden="true" />
            <label htmlFor="origin-filter" className="font-medium text-[#231B17]">
              Origin
            </label>
            <select
              id="origin-filter"
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#DFD3C0] text-[#231B17]"
            >
              {origins.map((o) => (
                <option key={o} value={o}>
                  {o === 'All' ? 'All Regions' : o}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="atelier-filter" className="font-medium text-[#231B17]">
              Artisan
            </label>
            <select
              id="atelier-filter"
              value={atelier}
              onChange={(e) => {
                setAtelier(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#DFD3C0] text-[#231B17]"
            >
              {ateliers.map((a) => (
                <option key={a} value={a}>
                  {a === 'All' ? 'All Ateliers' : a}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="price-filter" className="font-medium text-[#231B17]">
              Max Price
            </label>
            <select
              id="price-filter"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(Number(e.target.value));
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#DFD3C0] text-[#231B17] font-mono"
            >
              <option value={250000}>Any Price</option>
              <option value={20000}>Up to ₹20,000</option>
              <option value={50000}>Up to ₹50,000</option>
              <option value={100000}>Up to ₹1,00,000</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="rating-filter" className="font-medium text-[#231B17]">
              Rating
            </label>
            <select
              id="rating-filter"
              value={minRating}
              onChange={(e) => {
                setMinRating(Number(e.target.value));
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#DFD3C0] text-[#231B17]"
            >
              <option value={0}>All Ratings</option>
              <option value={4.5}>4.5★ & above</option>
              <option value={4.9}>4.9★ & above</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 cursor-pointer text-[#231B17]">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => {
                setInStockOnly(e.target.checked);
                setPage(1);
              }}
              className="accent-[#6B1D2A]"
            />
            <span>In Vault Only</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <span className="tabular-nums">
            Showing {filtered.length} piece{filtered.length === 1 ? '' : 's'}
          </span>
          <label htmlFor="sort-select" className="sr-only">
            Sort catalogue
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) =>
              setSort(
                e.target.value as
                  | 'featured'
                  | 'price_asc'
                  | 'price_desc'
                  | 'rating_desc'
                  | 'newest'
              )
            }
            className="px-3 py-1.5 bg-white border border-[#DFD3C0] text-[#231B17]"
          >
            <option value="featured">Curator Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating_desc">Highest Rated</option>
            <option value="newest">Newest Additions</option>
          </select>
        </div>
      </div>

      {/* Product Grid or Empty State */}
      {pagedProducts.length === 0 ? (
        <div className="my-12 p-12 border border-[#DFD3C0] bg-[#F3ECE1]/50 text-center">
          <h2 className="font-display text-2xl text-[#231B17]">
            No heirloom pieces match your current filters
          </h2>
          <p className="text-sm text-[#6E5F54] mt-2">
            Try clearing your search keyword or expanding the price range.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 px-5 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 mt-4">
            {pagedProducts.map((product) => (
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

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => {
                    setPage(pNum);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-9 h-9 text-xs font-mono border transition-colors ${
                    pNum === safePage
                      ? 'bg-[#6B1D2A] text-[#FAF7F2] border-[#6B1D2A]'
                      : 'bg-white text-[#231B17] border-[#DFD3C0] hover:border-[#6B1D2A]'
                  }`}
                >
                  {pNum}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {recentlyViewed.length > 0 && (
        <section className="mt-16 pt-10 border-t border-[#DFD3C0]">
          <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Your Archive History</p>
          <h2 className="font-display text-2xl text-[#231B17] mt-1">Recently Viewed Pieces</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-5">
            {recentlyViewed.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                wishlisted={wishlistIds.includes(p.id)}
                onSelect={onSelectProduct}
                onToggleWishlist={onToggleWishlist}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
