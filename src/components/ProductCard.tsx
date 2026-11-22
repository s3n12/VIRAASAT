import { Heart, ShoppingBag } from 'lucide-react';
import { formatInr, getEffectiveProductPrice } from '../lib/commerce';
import type { Product } from '../types/marketplace';
import { HeritageImage } from './HeritageImage';

interface ProductCardProps {
  product: Product;
  wishlisted: boolean;
  onSelect: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onQuickAdd: (product: Product) => void;
}

export function ProductCard({
  product,
  wishlisted,
  onSelect,
  onToggleWishlist,
  onQuickAdd,
}: ProductCardProps) {
  const soldOut = product.stock <= 0;
  const effectivePrice = getEffectiveProductPrice(product);
  const hasDiscount = effectivePrice < product.priceInr;

  return (
    <article className="group flex flex-col bg-[#FAF7F2] border border-[#DFD3C0]/80 hover:border-[#A67C37]/70 transition-all duration-200 hover:-translate-y-0.5">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F3ECE1]">
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="block w-full h-full text-left"
          aria-label={`View details for ${product.title}`}
        >
          <HeritageImage
            src={product.imageUrl}
            alt={product.title}
            fallbackTitle={product.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </button>

        <button
          type="button"
          aria-label={
            wishlisted
              ? `Remove ${product.title} from wishlist`
              : `Save ${product.title} to wishlist`
          }
          onClick={() => onToggleWishlist(product.id)}
          className="absolute top-3 right-3 p-2 bg-[#FAF7F2]/90 text-[#231B17] hover:text-[#6B1D2A] transition-colors"
        >
          <Heart
            className={`w-4 h-4 ${wishlisted ? 'fill-[#6B1D2A] text-[#6B1D2A]' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5 text-xs text-[#6E5F54]">
          <span>{product.craftOrigin}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{product.atelierName}</span>
        </div>

        <button
          type="button"
          onClick={() => onSelect(product)}
          className="text-left mt-1.5"
        >
          <h3 className="font-display text-xl font-semibold text-[#231B17] group-hover:text-[#6B1D2A] transition-colors leading-snug">
            {product.title}
          </h3>
        </button>

        <p className="text-xs text-[#6E5F54] mt-1 line-clamp-2">
          {product.subtitle}
        </p>

        <div className="mt-auto pt-4 flex items-center justify-between gap-3 border-t border-[#DFD3C0]/60">
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-semibold font-mono tabular-nums text-[#231B17]">
                {formatInr(effectivePrice)}
              </p>
              {hasDiscount && (
                <p className="text-xs font-mono tabular-nums text-[#6E5F54] line-through">
                  {formatInr(product.priceInr)}
                </p>
              )}
            </div>
            <p className="text-[11px] text-[#6E5F54] mt-0.5">
              {soldOut
                ? 'Archive Exhausted'
                : product.stock <= product.lowStockThreshold
                  ? `Only ${product.stock} remaining`
                  : 'In Atelier Vault'}
            </p>
          </div>

          <button
            type="button"
            disabled={soldOut}
            onClick={() => onQuickAdd(product)}
            aria-label={`Add ${product.title} to bag`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{soldOut ? 'Sold Out' : 'Add to Bag'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
