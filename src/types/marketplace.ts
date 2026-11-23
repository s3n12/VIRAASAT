export type UserRole = 'customer' | 'seller' | 'admin';

export type ProductCategory =
  | 'Fashion & Ethnic Wear'
  | 'Fine Jewellery'
  | 'Kashmiri Shawls'
  | 'Handicrafts & Brass'
  | 'Home Decor & Pottery'
  | 'Natural Wellness & Organic';

export type ProductStatus = 'active' | 'draft' | 'archived';

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'crafted'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'cod';

export type ShippingMethod = 'standard' | 'express';

export type OtpChannel = 'email' | 'phone';

export interface ShippingAddress {
  id?: string;
  label?: string;
  fullName: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  isDefault?: boolean;
}

export interface NotificationPreferences {
  orderEmail: boolean;
  orderSms: boolean;
  securityAlerts: boolean;
  editorialNewsletter: boolean;
}

export type AccountStatus = 'pending_verification' | 'active' | 'suspended';

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  displayName: string;
  role: UserRole;
  atelierName?: string;
  craftRegion?: string;
  sellerVerified: boolean;
  suspended?: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  accountStatus?: AccountStatus;
  shippingAddress?: ShippingAddress;
  savedAddresses?: ShippingAddress[];
  notificationPreferences?: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface SellerApplication {
  id: string;
  userId?: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessAddress: string;
  craftRegion: string;
  primaryCategory: ProductCategory;
  gstin?: string;
  panNumber: string;
  bankAccountLast4: string;
  ifscCode: string;
  identityDocType: 'Aadhaar / Artisan Card' | 'GI Craft Certificate' | 'Passport / PAN';
  identityDocRef: string;
  portfolioSummary: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  label: string;
  sku: string;
  priceDeltaInr: number;
  size?: string;
  color?: string;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  title: string;
  subtitle: string;
  description: string;
  category: ProductCategory;
  subcategory: string;
  craftOrigin: string;
  atelierName: string;
  sellerId: string;
  priceInr: number;
  discountPriceInr?: number;
  stock: number;
  lowStockThreshold: number;
  imageUrl: string;
  gallery?: string[];
  material: string;
  weightGrams: number;
  dimensions: string;
  shippingInfo: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  provenanceNote: string;
  careInstructions: string;
  craftTimeDays: number;
  variants: ProductVariant[];
  featured: boolean;
  approved: boolean;
  status: ProductStatus;
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  variantLabel: string;
  quantity: number;
  title: string;
  atelierName: string;
  craftOrigin: string;
  imageUrl: string;
  unitPriceInr: number;
  stock: number;
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderInr: number;
  maxDiscountInr?: number;
  active: boolean;
  redemptionCount: number;
  expiresAt: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  sellerId: string;
  title: string;
  variantLabel: string;
  quantity: number;
  unitPriceInr: number;
  imageUrl: string;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  note: string;
  timestamp: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'refunded';
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  subtotalInr: number;
  discountInr: number;
  couponCode?: string;
  taxInr: number;
  shippingInr: number;
  shippingMethod: ShippingMethod;
  totalInr: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  trackingNumber?: string;
  shippingAddress: ShippingAddress;
  returnRequest?: ReturnRequest;
  timeline: OrderTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: 'order' | 'security' | 'inventory' | 'atelier';
  read: boolean;
  createdAt: string;
}

export interface HeroSlide {
  id: string;
  kicker: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  categoryTarget?: ProductCategory | 'All';
  imageUrl: string;
  captionLabel: string;
  captionTitle: string;
}

export interface Testimonial {
  id: string;
  patronName: string;
  city: string;
  acquisition: string;
  quote: string;
}

export interface CmsContent {
  announcement: {
    enabled: boolean;
    text: string;
  };
  hero: {
    kicker: string;
    headline: string;
    subheadline: string;
    ctaLabel: string;
    imageUrl: string;
  };
  heroSlides: HeroSlide[];
  heritageStory: {
    heading: string;
    lead: string;
    body: string;
    atelierCount: string;
    craftClusters: string;
    authenticityGuarantee: string;
  };
  testimonials: Testimonial[];
  journalEntries: {
    id: string;
    title: string;
    region: string;
    readTime: string;
    excerpt: string;
    imageUrl: string;
  }[];
  updatedAt: string;
  updatedBy: string;
}

export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  createdAt: string;
}

export interface AdminSettings {
  commissionPercent: number;
  codEnabled: boolean;
  codMaxOrderInr: number;
  freeShippingThresholdInr: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  outcome: 'success' | 'denied' | 'failure';
  ipAddress: string;
  detail: string;
  createdAt: string;
}

export interface SellerAnalytics {
  totalRevenueInr: number;
  netPayoutInr: number;
  commissionPercent: number;
  commissionDeductedInr: number;
  totalOrders: number;
  activeListings: number;
  lowStockCount: number;
  avgOrderValueInr: number;
  categoryBreakdown: { category: string; revenueInr: number; units: number }[];
  fulfillmentCounts: Record<OrderStatus, number>;
}

export interface AdminAnalytics {
  grossMerchandiseValueInr: number;
  totalOrders: number;
  totalProducts: number;
  verifiedPatronsCount: number;
  activeArtisansCount: number;
  pendingSellerApprovalsCount: number;
  pendingPaymentsCount: number;
  pendingRefundsCount: number;
  dualVerifiedPercentage: number;
  lowStockAlertsCount: number;
  newsletterSubscribersCount: number;
  revenueByOrigin: { origin: string; revenueInr: number }[];
  recentOrderCount7d: number;
}
