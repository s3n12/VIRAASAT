import type {
  Coupon,
  OrderStatus,
  Product,
  ProductCategory,
  ShippingMethod,
} from '../types/marketplace';

export const GST_RATE = 0.12;
export const FREE_INSURED_SHIPPING_THRESHOLD_INR = 25000;
export const INSURED_COURIER_FEE_INR = 650;
export const EXPRESS_VAULT_AIR_FEE_INR = 1450;

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['crafted', 'cancelled'],
  crafted: ['dispatched'],
  dispatched: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export interface CartTotals {
  subtotalInr: number;
  discountInr: number;
  taxInr: number;
  shippingInr: number;
  totalInr: number;
  freeShippingRemainingInr: number;
}

export function formatInr(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function getEffectiveProductPrice(product: Pick<Product, 'priceInr' | 'discountPriceInr'>): number {
  if (
    typeof product.discountPriceInr === 'number' &&
    product.discountPriceInr > 0 &&
    product.discountPriceInr < product.priceInr
  ) {
    return product.discountPriceInr;
  }
  return product.priceInr;
}

export function calculateCouponDiscount(
  subtotalInr: number,
  coupon?: Coupon | null
): { discountInr: number; error?: string } {
  if (!coupon) return { discountInr: 0 };
  if (!coupon.active) return { discountInr: 0, error: 'This privilege code is no longer active.' };
  if (new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { discountInr: 0, error: 'This privilege code has expired.' };
  }
  if (subtotalInr < coupon.minOrderInr) {
    return {
      discountInr: 0,
      error: `Minimum acquisition of ${formatInr(coupon.minOrderInr)} required for ${coupon.code}.`,
    };
  }

  let rawDiscount =
    coupon.type === 'percentage'
      ? Math.round((subtotalInr * coupon.value) / 100)
      : Math.round(coupon.value);

  if (typeof coupon.maxDiscountInr === 'number' && coupon.maxDiscountInr > 0) {
    rawDiscount = Math.min(rawDiscount, coupon.maxDiscountInr);
  }
  const discountInr = Math.min(subtotalInr, Math.max(0, rawDiscount));
  return { discountInr };
}

export function calculateCartTotals(
  items: { unitPriceInr: number; quantity: number }[],
  options?: {
    coupon?: Coupon | null;
    shippingMethod?: ShippingMethod;
    freeShippingThresholdInr?: number;
  }
): CartTotals {
  const threshold = options?.freeShippingThresholdInr ?? FREE_INSURED_SHIPPING_THRESHOLD_INR;
  const shippingMethod = options?.shippingMethod ?? 'standard';

  const subtotalInr = items.reduce((sum, item) => {
    const qty = Math.max(0, Math.floor(item.quantity));
    const price = Math.max(0, item.unitPriceInr);
    return sum + Math.round(price * qty);
  }, 0);

  if (subtotalInr === 0) {
    return {
      subtotalInr: 0,
      discountInr: 0,
      taxInr: 0,
      shippingInr: 0,
      totalInr: 0,
      freeShippingRemainingInr: threshold,
    };
  }

  const { discountInr } = calculateCouponDiscount(subtotalInr, options?.coupon);
  const taxableBase = Math.max(0, subtotalInr - discountInr);
  const taxInr = Math.round(taxableBase * GST_RATE);

  const shippingInr =
    shippingMethod === 'express'
      ? EXPRESS_VAULT_AIR_FEE_INR
      : taxableBase >= threshold
        ? 0
        : INSURED_COURIER_FEE_INR;

  const totalInr = taxableBase + taxInr + shippingInr;
  const freeShippingRemainingInr = Math.max(0, threshold - taxableBase);

  return {
    subtotalInr,
    discountInr,
    taxInr,
    shippingInr,
    totalInr,
    freeShippingRemainingInr,
  };
}

export function canTransitionOrderStatus(
  current: OrderStatus,
  next: OrderStatus,
  isAdmin = false
): boolean {
  if (current === next) return false;
  if (isAdmin && next === 'refunded' && current !== 'refunded') {
    return true;
  }
  return ALLOWED_ORDER_TRANSITIONS[current].includes(next);
}

export interface ProductFilterParams {
  query?: string;
  category?: ProductCategory | 'All';
  origin?: string | 'All';
  atelier?: string | 'All';
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';
}

export function filterAndSortProducts(
  products: Product[],
  params: ProductFilterParams
): Product[] {
  const q = (params.query || '').trim().toLowerCase();

  const filtered = products.filter((p) => {
    if (p.status !== 'active' || !p.approved) return false;
    if (params.category && params.category !== 'All' && p.category !== params.category) {
      return false;
    }
    if (params.origin && params.origin !== 'All' && p.craftOrigin !== params.origin) {
      return false;
    }
    if (params.atelier && params.atelier !== 'All' && p.atelierName !== params.atelier) {
      return false;
    }
    const effectivePrice = getEffectiveProductPrice(p);
    if (typeof params.minPrice === 'number' && effectivePrice < params.minPrice) {
      return false;
    }
    if (typeof params.maxPrice === 'number' && effectivePrice > params.maxPrice) {
      return false;
    }
    if (typeof params.minRating === 'number' && params.minRating > 0 && p.ratingAvg < params.minRating) {
      return false;
    }
    if (params.inStockOnly && p.stock <= 0) {
      return false;
    }
    if (q) {
      const haystack = `${p.title} ${p.subtitle} ${p.description} ${p.atelierName} ${p.craftOrigin} ${p.category} ${p.subcategory} ${p.material} ${p.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  switch (params.sort) {
    case 'price_asc':
      sorted.sort((a, b) => getEffectiveProductPrice(a) - getEffectiveProductPrice(b));
      break;
    case 'price_desc':
      sorted.sort((a, b) => getEffectiveProductPrice(b) - getEffectiveProductPrice(a));
      break;
    case 'rating_desc':
      sorted.sort((a, b) => b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount);
      break;
    case 'newest':
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case 'featured':
    default:
      sorted.sort((a, b) => Number(b.featured) - Number(a.featured) || b.ratingAvg - a.ratingAvg);
      break;
  }

  return sorted;
}

export function computeRatingSummary(ratings: number[]): { avg: number; count: number } {
  if (ratings.length === 0) return { avg: 0, count: 0 };
  const sum = ratings.reduce((acc, r) => acc + Math.min(5, Math.max(1, r)), 0);
  return {
    avg: Math.round((sum / ratings.length) * 10) / 10,
    count: ratings.length,
  };
}
