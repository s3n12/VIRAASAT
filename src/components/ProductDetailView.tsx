import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, ShieldCheck, ShoppingBag, Star } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatInr, getEffectiveProductPrice } from '../lib/commerce';
import type { Product, Review, UserProfile } from '../types/marketplace';
import { HeritageImage } from './HeritageImage';
import { ProductCard } from './ProductCard';

interface ProductDetailViewProps {
  product: Product;
  wishlisted: boolean;
  wishlistIds: string[];
  token: string | null;
  user: UserProfile | null;
  onBack: () => void;
  onSelectProduct: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onAddToCart: (product: Product, variantLabel: string, quantity: number) => void;
  onOpenAuth: () => void;
  onProductUpdated: (product: Product) => void;
}

export function ProductDetailView({
  product,
  wishlisted,
  wishlistIds,
  token,
  user,
  onBack,
  onSelectProduct,
  onToggleWishlist,
  onAddToCart,
  onOpenAuth,
  onProductUpdated,
}: ProductDetailViewProps) {
  const [selectedVariant, setSelectedVariant] = useState(
    product.variants[0]?.label || 'Standard Atelier Edition'
  );
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedVariant(product.variants[0]?.label || 'Standard Atelier Edition');
    setQuantity(1);
    let cancelled = false;
    setLoadingReviews(true);
    apiRequest<{ product: Product; reviews: Review[]; relatedProducts?: Product[] }>(
      `/api/products/${product.id}`
    )
      .then((res) => {
        if (!cancelled) {
          setReviews(res.reviews);
          setRelatedProducts(res.relatedProducts || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingReviews(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const activeVariant =
    product.variants.find((v) => v.label === selectedVariant) || product.variants[0];
  const baseEffective = getEffectiveProductPrice(product);
  const finalPrice = baseEffective + (activeVariant?.priceDeltaInr || 0);
  const originalPrice = product.priceInr + (activeVariant?.priceDeltaInr || 0);
  const hasDiscount = baseEffective < product.priceInr;
  const soldOut = product.stock <= 0;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user) {
      onOpenAuth();
      return;
    }
    if (comment.trim().length < 8) {
      setReviewError('Please share at least a sentence about the craftsmanship.');
      return;
    }
    setReviewError(null);
    setReviewNotice(null);
    setSubmittingReview(true);
    try {
      const res = await apiRequest<{ review: Review; product: Product }>(
        `/api/products/${product.id}/reviews`,
        {
          method: 'POST',
          token,
          body: { rating, comment: comment.trim() },
        }
      );
      setReviews((prev) => [res.review, ...prev]);
      onProductUpdated(res.product);
      setComment('');
      setReviewNotice('Thank you—your patron review has been published.');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to post review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#6E5F54] hover:text-[#6B1D2A] mb-8"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back to Catalogue</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-7 space-y-5">
          <div className="aspect-[4/3] bg-[#F3ECE1] border border-[#DFD3C0] overflow-hidden">
            <HeritageImage
              src={product.imageUrl}
              alt={product.title}
              fallbackTitle={product.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#DFD3C0] text-xs text-[#6E5F54]">
            <div>
              <p className="text-[#231B17] font-medium">SKU</p>
              <p className="mt-0.5 font-mono">{activeVariant?.sku || product.sku}</p>
            </div>
            <div>
              <p className="text-[#231B17] font-medium">Craft Duration</p>
              <p className="mt-0.5 tabular-nums">{product.craftTimeDays} days by hand</p>
            </div>
            <div>
              <p className="text-[#231B17] font-medium">Dimensions</p>
              <p className="mt-0.5">{product.dimensions}</p>
            </div>
            <div>
              <p className="text-[#231B17] font-medium">Weight</p>
              <p className="mt-0.5 tabular-nums">{product.weightGrams} g</p>
            </div>
          </div>

          <div className="p-5 bg-white border border-[#DFD3C0] space-y-2 text-xs text-[#6E5F54]">
            <p className="font-medium text-[#231B17]">Material Composition</p>
            <p>{product.material}</p>
            <p className="font-medium text-[#231B17] pt-2">Insured Vault Dispatch</p>
            <p>{product.shippingInfo}</p>
          </div>
        </div>

        <div className="lg:col-span-5 lg:sticky lg:top-24 bg-[#F3ECE1]/55 border border-[#DFD3C0] p-7 space-y-5">
          <div className="text-xs text-[#6E5F54] flex items-center gap-2">
            <span>{product.category}</span>
            <span aria-hidden="true">·</span>
            <span>{product.atelierName}</span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#231B17] leading-tight">
            {product.title}
          </h1>

          <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#DFD3C0]">
            <div>
              <div className="flex items-baseline gap-2.5">
                <p className="text-2xl font-mono font-semibold tabular-nums text-[#231B17]">
                  {formatInr(finalPrice)}
                </p>
                {hasDiscount && (
                  <p className="text-sm font-mono tabular-nums text-[#6E5F54] line-through">
                    {formatInr(originalPrice)}
                  </p>
                )}
              </div>
              <p className="text-xs text-[#6E5F54] mt-0.5">
                Exclusive of 12% GST · Complimentary insured courier over ₹25,000
              </p>
            </div>
            {product.reviewCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-[#231B17] tabular-nums">
                <Star className="w-4 h-4 fill-[#A67C37] text-[#A67C37]" aria-hidden="true" />
                <span className="font-medium">{product.ratingAvg.toFixed(1)}</span>
                <span className="text-[#6E5F54]">({product.reviewCount})</span>
              </div>
            )}
          </div>

          <p className="text-sm text-[#231B17]/90 leading-relaxed">{product.description}</p>

          {product.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#231B17]">Edition / Finish</p>
              <div className="space-y-2">
                {product.variants.map((variant) => {
                  const selected = variant.label === selectedVariant;
                  return (
                    <button
                      key={variant.sku}
                      type="button"
                      onClick={() => setSelectedVariant(variant.label)}
                      className={`w-full text-left px-3.5 py-2.5 border text-xs flex items-center justify-between transition-colors ${
                        selected
                          ? 'border-[#6B1D2A] bg-white text-[#231B17]'
                          : 'border-[#DFD3C0] bg-[#FAF7F2] text-[#6E5F54] hover:border-[#231B17]'
                      }`}
                    >
                      <span className="font-medium">{variant.label}</span>
                      <span className="font-mono tabular-nums">
                        {variant.priceDeltaInr === 0
                          ? 'Base'
                          : `${variant.priceDeltaInr > 0 ? '+' : ''}${formatInr(variant.priceDeltaInr)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6E5F54]">
              Availability:{' '}
              <strong className="text-[#231B17]">
                {soldOut ? 'Sold Out' : `${product.stock} piece(s) in vault`}
              </strong>
            </span>
            {!soldOut && (
              <div className="flex items-center gap-2">
                <label htmlFor="pdp-qty" className="text-[#6E5F54]">
                  Qty
                </label>
                <select
                  id="pdp-qty"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="px-2.5 py-1 bg-white border border-[#DFD3C0] font-mono text-[#231B17]"
                >
                  {Array.from({ length: Math.min(product.stock, 5) }, (_, idx) => idx + 1).map(
                    (num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              disabled={soldOut}
              onClick={() => onAddToCart(product, selectedVariant, quantity)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] disabled:opacity-40 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span>{soldOut ? 'Archive Exhausted' : 'Add to Acquisition Bag'}</span>
            </button>

            <button
              type="button"
              aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              onClick={() => onToggleWishlist(product.id)}
              className="px-4 py-3 border border-[#DFD3C0] bg-white text-[#231B17] hover:border-[#6B1D2A] transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${wishlisted ? 'fill-[#6B1D2A] text-[#6B1D2A]' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="pt-4 border-t border-[#DFD3C0] space-y-3 text-xs text-[#6E5F54]">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#A67C37] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium text-[#231B17]">Provenance</p>
                <p>{product.provenanceNote}</p>
              </div>
            </div>
            <div>
              <p className="font-medium text-[#231B17]">Archival Care</p>
              <p className="mt-0.5">{product.careInstructions}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Patron Reviews */}
      <section className="mt-16 pt-12 border-t border-[#DFD3C0] grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-6">
          <div>
            <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
              Patron Impressions
            </p>
            <h2 className="font-display text-3xl text-[#231B17] mt-1">
              Reviews ({reviews.length})
            </h2>
          </div>

          {loadingReviews ? (
            <p className="text-sm text-[#6E5F54]">Loading patron impressions...</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-[#6E5F54]">
              No reviews recorded yet for this edition. Be the first patron to leave an impression.
            </p>
          ) : (
            <div className="space-y-5">
              {reviews.map((rev) => (
                <article key={rev.id} className="p-5 bg-white border border-[#DFD3C0]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[#6E5F54] flex items-center gap-2">
                      <span className="font-semibold text-[#231B17]">{rev.authorName}</span>
                      {rev.verifiedPurchase && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#6B1D2A]">Verified Acquisition</span>
                        </>
                      )}
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#A67C37]">
                      {'★'.repeat(rev.rating)}
                      {'☆'.repeat(5 - rev.rating)}
                    </span>
                  </div>
                  <p className="text-sm text-[#231B17]/90 mt-3 leading-relaxed">{rev.comment}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <form
            onSubmit={handleSubmitReview}
            className="p-6 bg-[#F3ECE1]/60 border border-[#DFD3C0] space-y-4"
          >
            <h3 className="font-display text-2xl text-[#231B17]">Record Your Impression</h3>
            {reviewError && (
              <p role="alert" className="text-xs text-[#6B1D2A]">
                {reviewError}
              </p>
            )}
            {reviewNotice && (
              <p className="text-xs text-[#231B17] bg-white p-2.5 border border-[#DFD3C0]">
                {reviewNotice}
              </p>
            )}
            <div>
              <label htmlFor="review-rating" className="block text-xs font-medium text-[#231B17] mb-1">
                Rating
              </label>
              <select
                id="review-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
              >
                <option value={5}>5 — Museum-Grade Heirloom</option>
                <option value={4}>4 — Exceptional Craftsmanship</option>
                <option value={3}>3 — Refined</option>
                <option value={2}>2 — Fair</option>
                <option value={1}>1 — Below Expectation</option>
              </select>
            </div>
            <div>
              <label htmlFor="review-comment" className="block text-xs font-medium text-[#231B17] mb-1">
                Review Notes
              </label>
              <textarea
                id="review-comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share notes on craftsmanship, packaging, and provenance..."
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
              />
            </div>
            <button
              type="submit"
              disabled={submittingReview}
              className="w-full py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F] disabled:opacity-50"
            >
              {user ? 'Publish Patron Review' : 'Sign In to Publish Review'}
            </button>
          </form>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="mt-16 pt-12 border-t border-[#DFD3C0]">
          <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Companion Editions</p>
          <h2 className="font-display text-3xl text-[#231B17] mt-1">Related Heritage Pieces</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7 mt-6">
            {relatedProducts.map((rel) => (
              <ProductCard
                key={rel.id}
                product={rel}
                wishlisted={wishlistIds.includes(rel.id)}
                onSelect={onSelectProduct}
                onToggleWishlist={onToggleWishlist}
                onQuickAdd={(p) => onAddToCart(p, p.variants[0]?.label || 'Standard Atelier Edition', 1)}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
