import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPRESS_VAULT_AIR_FEE_INR,
  FREE_INSURED_SHIPPING_THRESHOLD_INR,
  INSURED_COURIER_FEE_INR,
  calculateCartTotals,
  calculateCouponDiscount,
  canTransitionOrderStatus,
  computeRatingSummary,
  filterAndSortProducts,
  formatInr,
  getEffectiveProductPrice,
} from './commerce';
import type { Coupon, Product } from '../types/marketplace';

test('calculateCartTotals computes GST, coupon discounts, standard & express shipping, and waiver threshold', () => {
  const smallCart = calculateCartTotals([{ unitPriceInr: 10000, quantity: 1 }]);
  assert.equal(smallCart.subtotalInr, 10000);
  assert.equal(smallCart.discountInr, 0);
  assert.equal(smallCart.taxInr, 1200);
  assert.equal(smallCart.shippingInr, INSURED_COURIER_FEE_INR);
  assert.equal(smallCart.totalInr, 10000 + 1200 + INSURED_COURIER_FEE_INR);
  assert.equal(smallCart.freeShippingRemainingInr, FREE_INSURED_SHIPPING_THRESHOLD_INR - 10000);

  const luxuryCart = calculateCartTotals([{ unitPriceInr: 48500, quantity: 1 }]);
  assert.equal(luxuryCart.shippingInr, 0);
  assert.equal(luxuryCart.freeShippingRemainingInr, 0);
  assert.equal(luxuryCart.taxInr, 5820);
  assert.equal(luxuryCart.totalInr, 54320);

  const expressCart = calculateCartTotals([{ unitPriceInr: 48500, quantity: 1 }], {
    shippingMethod: 'express',
  });
  assert.equal(expressCart.shippingInr, EXPRESS_VAULT_AIR_FEE_INR);
  assert.equal(expressCart.totalInr, 48500 + 5820 + EXPRESS_VAULT_AIR_FEE_INR);

  const emptyCart = calculateCartTotals([]);
  assert.equal(emptyCart.totalInr, 0);
  assert.equal(emptyCart.shippingInr, 0);
});

test('calculateCouponDiscount enforces minimum order, caps percentage discounts, and rejects inactive/expired codes', () => {
  const pctCoupon: Coupon = {
    id: 'cpn_1',
    code: 'VIRAASAT10',
    description: '10% off up to ₹5,000',
    type: 'percentage',
    value: 10,
    minOrderInr: 10000,
    maxDiscountInr: 5000,
    active: true,
    redemptionCount: 0,
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  assert.equal(calculateCouponDiscount(20000, pctCoupon).discountInr, 2000);
  assert.equal(calculateCouponDiscount(80000, pctCoupon).discountInr, 5000);
  assert.match(calculateCouponDiscount(5000, pctCoupon).error || '', /Minimum acquisition/);

  const expiredCoupon: Coupon = {
    ...pctCoupon,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };
  assert.match(calculateCouponDiscount(30000, expiredCoupon).error || '', /expired/);

  const discountedTotals = calculateCartTotals([{ unitPriceInr: 30000, quantity: 1 }], {
    coupon: pctCoupon,
  });
  assert.equal(discountedTotals.discountInr, 3000);
  assert.equal(discountedTotals.taxInr, Math.round(27000 * 0.12));
  assert.equal(discountedTotals.shippingInr, 0);
});

test('canTransitionOrderStatus blocks invalid jumps and locks terminal states', () => {
  assert.equal(canTransitionOrderStatus('placed', 'confirmed'), true);
  assert.equal(canTransitionOrderStatus('placed', 'delivered'), false);
  assert.equal(canTransitionOrderStatus('confirmed', 'crafted'), true);
  assert.equal(canTransitionOrderStatus('delivered', 'cancelled'), false);
  assert.equal(canTransitionOrderStatus('delivered', 'refunded', false), false);
  assert.equal(canTransitionOrderStatus('delivered', 'refunded', true), true);
});

test('filterAndSortProducts searches, filters by category/origin/atelier/rating/stock, and sorts by effective price', () => {
  const sampleProducts: Product[] = [
    {
      id: 'p1',
      slug: 'banarasi-katan',
      sku: 'VRS-BNR-01',
      title: 'Banarasi Katan Silk Saree',
      subtitle: 'Pure Zari Kadwa',
      description: 'Handwoven in Varanasi',
      category: 'Fashion & Ethnic Wear',
      subcategory: 'Handloom Sarees',
      craftOrigin: 'Varanasi',
      atelierName: 'Kashi Loom House',
      sellerId: 's1',
      priceInr: 48500,
      discountPriceInr: 44000,
      stock: 4,
      lowStockThreshold: 2,
      imageUrl: '/img1.jpg',
      material: '100% Pure Mulberry Katan Silk',
      weightGrams: 720,
      dimensions: '5.5m × 1.15m',
      shippingInfo: 'Insured heritage courier',
      tags: ['handloom', 'bridal'],
      provenanceNote: 'GI Certified',
      careInstructions: 'Dry clean only',
      craftTimeDays: 45,
      variants: [],
      featured: true,
      approved: true,
      status: 'active',
      ratingAvg: 4.9,
      reviewCount: 12,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p2',
      slug: 'kannauj-attar',
      sku: 'VRS-KNJ-02',
      title: 'Kannauj Sandalwood Attar',
      subtitle: 'Deg-Bhapka Distilled',
      description: 'Distilled in copper stills',
      category: 'Natural Wellness & Organic',
      subcategory: 'Botanical Attars',
      craftOrigin: 'Kannauj',
      atelierName: 'Noorani Perfumers',
      sellerId: 's2',
      priceInr: 12500,
      stock: 0,
      lowStockThreshold: 3,
      imageUrl: '/img2.jpg',
      material: 'Aged Mysore Sandalwood Oil',
      weightGrams: 180,
      dimensions: '12 ml Crystal Flacon',
      shippingInfo: 'Sealed courier',
      tags: ['attar', 'organic'],
      provenanceNote: 'Heritage Distillate',
      careInstructions: 'Store cool',
      craftTimeDays: 30,
      variants: [],
      featured: false,
      approved: true,
      status: 'active',
      ratingAvg: 4.4,
      reviewCount: 5,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ];

  assert.equal(getEffectiveProductPrice(sampleProducts[0]), 44000);
  assert.equal(getEffectiveProductPrice(sampleProducts[1]), 12500);

  const byQuery = filterAndSortProducts(sampleProducts, { query: 'varanasi' });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].id, 'p1');

  const byAtelier = filterAndSortProducts(sampleProducts, { atelier: 'Noorani Perfumers' });
  assert.equal(byAtelier.length, 1);
  assert.equal(byAtelier[0].id, 'p2');

  const byMinRating = filterAndSortProducts(sampleProducts, { minRating: 4.5 });
  assert.equal(byMinRating.length, 1);
  assert.equal(byMinRating[0].id, 'p1');

  const inStockOnly = filterAndSortProducts(sampleProducts, { inStockOnly: true });
  assert.equal(inStockOnly.length, 1);
  assert.equal(inStockOnly[0].id, 'p1');

  const sortedAsc = filterAndSortProducts(sampleProducts, { sort: 'price_asc' });
  assert.equal(sortedAsc[0].id, 'p2');
});

test('formatInr and computeRatingSummary produce clean Indian currency and averages', () => {
  assert.match(formatInr(148500), /1,48,500/);
  assert.deepEqual(computeRatingSummary([5, 4, 5]), { avg: 4.7, count: 3 });
  assert.deepEqual(computeRatingSummary([]), { avg: 0, count: 0 });
});
