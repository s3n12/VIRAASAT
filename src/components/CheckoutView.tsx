import { useEffect, useState } from 'react';
import { CheckCircle2, Lock, ShieldAlert, ShieldCheck, Tag } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { calculateCartTotals, formatInr } from '../lib/commerce';
import type {
  CartItem,
  Coupon,
  Order,
  PaymentMethod,
  ShippingAddress,
  ShippingMethod,
  UserProfile,
} from '../types/marketplace';
import { HeritageImage } from './HeritageImage';

interface CheckoutViewProps {
  items: CartItem[];
  user: UserProfile | null;
  token: string | null;
  onOpenAuth: () => void;
  onOrderCompleted: (order: Order) => void;
  onBackToCatalogue: () => void;
}

export function CheckoutView({
  items,
  user,
  token,
  onOpenAuth,
  onOrderCompleted,
  onBackToCatalogue,
}: CheckoutViewProps) {
  const [address, setAddress] = useState<ShippingAddress>({
    fullName: user?.shippingAddress?.fullName || user?.displayName || '',
    addressLine: user?.shippingAddress?.addressLine || '',
    city: user?.shippingAddress?.city || '',
    state: user?.shippingAddress?.state || '',
    postalCode: user?.shippingAddress?.postalCode || '',
    phone: user?.shippingAddress?.phone || user?.phone || '',
  });

  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [publicSettings, setPublicSettings] = useState({
    codEnabled: true,
    codMaxOrderInr: 50000,
    freeShippingThresholdInr: 25000,
  });
  const [idempotencyKey] = useState(() => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const [pendingOrder, setPendingOrder] = useState<{
    order: Order;
    razorpayOrderId: string;
    mode: string;
  } | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{
      codEnabled: boolean;
      codMaxOrderInr: number;
      freeShippingThresholdInr: number;
    }>('/api/settings/public')
      .then((res) => setPublicSettings(res))
      .catch(() => {});
  }, []);

  const totals = calculateCartTotals(items, {
    coupon: appliedCoupon,
    shippingMethod,
    freeShippingThresholdInr: publicSettings.freeShippingThresholdInr,
  });
  const dualVerified = Boolean(user?.emailVerified && user?.phoneVerified);
  const codAllowed =
    publicSettings.codEnabled && totals.totalInr <= publicSettings.codMaxOrderInr;

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setError(null);
    setCouponMessage(null);
    try {
      const res = await apiRequest<{ ok: boolean; coupon: Coupon; discountInr: number }>(
        '/api/coupons/validate',
        {
          method: 'POST',
          body: { code, subtotalInr: totals.subtotalInr },
        }
      );
      setAppliedCoupon(res.coupon);
      setCouponMessage(
        `Applied ${res.coupon.code}: saving ${formatInr(res.discountInr)} on this acquisition.`
      );
    } catch (err) {
      setAppliedCoupon(null);
      setCouponMessage(err instanceof Error ? err.message : 'Invalid privilege code.');
    }
  };

  if (confirmedOrder) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="bg-white border border-[#DFD3C0] p-8 sm:p-10 space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-7 h-7 text-[#6B1D2A] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs text-[#A67C37] tracking-widest uppercase">
                {confirmedOrder.paymentMethod === 'cod'
                  ? 'Dual-Verified COD · Order Confirmed'
                  : 'Razorpay Signature Verified · Order Confirmed'}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl text-[#231B17] mt-1">
                Order {confirmedOrder.orderNumber} Confirmed
              </h1>
              <p className="text-sm text-[#6E5F54] mt-1">
                {confirmedOrder.paymentMethod === 'cod'
                  ? 'Cash on Delivery confirmed after dual OTP verification.'
                  : `Payment reference ${confirmedOrder.razorpayPaymentId} verified via HMAC-SHA256.`}
              </p>
            </div>
          </div>

          <div className="border-t border-b border-[#DFD3C0] py-5 space-y-3">
            {confirmedOrder.items.map((item) => (
              <div key={`${item.productId}-${item.variantLabel}`} className="flex justify-between text-sm">
                <div>
                  <p className="font-medium text-[#231B17]">{item.title}</p>
                  <p className="text-xs text-[#6E5F54]">
                    {item.variantLabel} · Qty {item.quantity}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-[#231B17]">
                  {formatInr(item.unitPriceInr * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-[#6E5F54]">
            <div>
              <p className="font-semibold text-[#231B17] mb-1">Vault Delivery Destination</p>
              <p>{confirmedOrder.shippingAddress.fullName}</p>
              <p>{confirmedOrder.shippingAddress.addressLine}</p>
              <p>
                {confirmedOrder.shippingAddress.city}, {confirmedOrder.shippingAddress.state} —{' '}
                {confirmedOrder.shippingAddress.postalCode}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatInr(confirmedOrder.subtotalInr)}</span>
              </div>
              {confirmedOrder.discountInr > 0 && (
                <div className="flex justify-between text-[#6B1D2A]">
                  <span>Privilege ({confirmedOrder.couponCode})</span>
                  <span className="font-mono tabular-nums">-{formatInr(confirmedOrder.discountInr)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>GST (12%)</span>
                <span className="font-mono tabular-nums">{formatInr(confirmedOrder.taxInr)}</span>
              </div>
              <div className="flex justify-between">
                <span>Insured Courier ({confirmedOrder.shippingMethod})</span>
                <span className="font-mono tabular-nums">
                  {confirmedOrder.shippingInr === 0 ? 'Complimentary' : formatInr(confirmedOrder.shippingInr)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-sm text-[#231B17] pt-1 border-t border-[#DFD3C0]">
                <span>Total {confirmedOrder.paymentMethod === 'cod' ? 'Due on Delivery' : 'Paid'}</span>
                <span className="font-mono tabular-nums">{formatInr(confirmedOrder.totalInr)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onBackToCatalogue}
              className="px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
            >
              Continue Exploring Catalogue
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="font-display text-3xl text-[#231B17]">Your acquisition bag is empty</h1>
        <p className="text-sm text-[#6E5F54] mt-2">
          Add an heirloom piece before proceeding to verified checkout.
        </p>
        <button
          type="button"
          onClick={onBackToCatalogue}
          className="mt-6 px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium"
        >
          Browse Catalogue
        </button>
      </main>
    );
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !token || !dualVerified) {
      onOpenAuth();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiRequest<{
        order: Order;
        codConfirmed?: boolean;
        razorpay: { orderId: string; mode: string };
      }>('/api/payments/razorpay/create-order', {
        method: 'POST',
        token,
        idempotencyKey,
        body: {
          shippingAddress: address,
          shippingMethod,
          paymentMethod: paymentMethod === 'cod' && !codAllowed ? 'upi' : paymentMethod,
          couponCode: appliedCoupon?.code,
          items: items.map((i) => ({
            productId: i.productId,
            variantLabel: i.variantLabel,
            quantity: i.quantity,
          })),
        },
      });
      if (res.codConfirmed) {
        setConfirmedOrder(res.order);
        onOrderCompleted(res.order);
      } else {
        setPendingOrder({
          order: res.order,
          razorpayOrderId: res.razorpay.orderId,
          mode: res.razorpay.mode,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initiate checkout order.');
    } finally {
      setBusy(false);
    }
  };

  const handleAuthorizeAndVerifyPayment = async () => {
    if (!pendingOrder || !token) return;
    setError(null);
    setBusy(true);
    try {
      const authRes = await apiRequest<{
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      }>('/api/payments/razorpay/authorize-sandbox', {
        method: 'POST',
        token,
        body: {
          orderId: pendingOrder.order.id,
          paymentMethod: paymentMethod === 'cod' ? 'upi' : paymentMethod,
        },
      });

      const verifyRes = await apiRequest<{ ok: boolean; order: Order }>(
        '/api/payments/razorpay/verify',
        {
          method: 'POST',
          token,
          body: {
            orderId: pendingOrder.order.id,
            razorpayOrderId: authRes.razorpayOrderId,
            razorpayPaymentId: authRes.razorpayPaymentId,
            razorpaySignature: authRes.razorpaySignature,
          },
        }
      );

      setConfirmedOrder(verifyRes.order);
      setPendingOrder(null);
      onOrderCompleted(verifyRes.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Razorpay verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-12">
      <div className="pb-6 border-b border-[#DFD3C0] mb-8">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
          Insured Acquisition Checkout
        </p>
        <h1 className="font-display text-4xl text-[#231B17] mt-1">
          Verify Delivery & Complete Settlement
        </h1>
      </div>

      {!dualVerified ? (
        <div className="mb-8 p-5 bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#6B1D2A] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#231B17]">
                Dual Email & Phone OTP Verification Required
              </p>
              <p className="text-xs text-[#6E5F54] mt-0.5">
                {user
                  ? `Email: ${user.emailVerified ? 'Verified' : 'Unverified'} · Phone: ${user.phoneVerified ? 'Verified' : 'Unverified'}. Both channels must be verified before checkout.`
                  : 'Sign in and complete both email and mobile OTP verification to unlock insured checkout.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-5 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F] whitespace-nowrap shrink-0"
          >
            Complete Dual Verification
          </button>
        </div>
      ) : (
        <div className="mb-8 p-4 bg-[#F3ECE1] border border-[#DFD3C0] flex items-center gap-3 text-xs text-[#231B17]">
          <ShieldCheck className="w-4 h-4 text-[#A67C37] shrink-0" aria-hidden="true" />
          <span>
            Dual-verified patron session active for <strong>{user?.email}</strong> &{' '}
            <strong className="font-mono">{user?.phone}</strong>.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 p-3.5 text-xs bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 text-[#6B1D2A]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-7 space-y-6">
          {!pendingOrder ? (
            <form
              onSubmit={handleCreateOrder}
              className="bg-white border border-[#DFD3C0] p-7 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl text-[#231B17]">1. Vault Delivery Address</h2>
                {user?.savedAddresses && user.savedAddresses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {user.savedAddresses.map((saved) => (
                      <button
                        key={saved.id || saved.addressLine}
                        type="button"
                        onClick={() => setAddress(saved)}
                        className="px-2.5 py-1 text-[11px] bg-[#F3ECE1] border border-[#DFD3C0] text-[#231B17] hover:border-[#6B1D2A]"
                      >
                        Use {saved.label || saved.city}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ship-name" className="block text-xs font-medium text-[#6E5F54] mb-1">
                    Recipient Full Name
                  </label>
                  <input
                    id="ship-name"
                    required
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
                  />
                </div>
                <div>
                  <label htmlFor="ship-phone" className="block text-xs font-medium text-[#6E5F54] mb-1">
                    Verified Contact Phone
                  </label>
                  <input
                    id="ship-phone"
                    required
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    placeholder="+919844000004"
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ship-line" className="block text-xs font-medium text-[#6E5F54] mb-1">
                  Street Address & Residence
                </label>
                <input
                  id="ship-line"
                  required
                  value={address.addressLine}
                  onChange={(e) => setAddress({ ...address, addressLine: e.target.value })}
                  placeholder="402 Seaface Residency, Worli"
                  className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="ship-city" className="block text-xs font-medium text-[#6E5F54] mb-1">
                    City
                  </label>
                  <input
                    id="ship-city"
                    required
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
                  />
                </div>
                <div>
                  <label htmlFor="ship-state" className="block text-xs font-medium text-[#6E5F54] mb-1">
                    State
                  </label>
                  <input
                    id="ship-state"
                    required
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
                  />
                </div>
                <div>
                  <label htmlFor="ship-pin" className="block text-xs font-medium text-[#6E5F54] mb-1">
                    6-Digit PIN Code
                  </label>
                  <input
                    id="ship-pin"
                    required
                    maxLength={6}
                    value={address.postalCode}
                    onChange={(e) =>
                      setAddress({ ...address, postalCode: e.target.value.replace(/\D/g, '') })
                    }
                    placeholder="400018"
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] font-mono"
                  />
                </div>
              </div>

              {/* Shipping Option */}
              <div className="pt-4 border-t border-[#DFD3C0] space-y-2.5">
                <h3 className="font-display text-xl text-[#231B17]">2. Insured Delivery Speed</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setShippingMethod('standard')}
                    className={`p-3.5 text-left border transition-colors ${
                      shippingMethod === 'standard'
                        ? 'border-[#6B1D2A] bg-[#F3ECE1]/80 text-[#231B17]'
                        : 'border-[#DFD3C0] bg-[#FAF7F2] text-[#6E5F54]'
                    }`}
                  >
                    <p className="font-medium text-[#231B17]">Standard Insured Vault (3–5 Days)</p>
                    <p className="mt-0.5">
                      {totals.subtotalInr - totals.discountInr >= publicSettings.freeShippingThresholdInr
                        ? 'Complimentary'
                        : '₹650 Insured Transit'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShippingMethod('express')}
                    className={`p-3.5 text-left border transition-colors ${
                      shippingMethod === 'express'
                        ? 'border-[#6B1D2A] bg-[#F3ECE1]/80 text-[#231B17]'
                        : 'border-[#DFD3C0] bg-[#FAF7F2] text-[#6E5F54]'
                    }`}
                  >
                    <p className="font-medium text-[#231B17]">Express Air Vault (24–48 Hours)</p>
                    <p className="mt-0.5 font-mono">₹1,450 Priority Armoured Air</p>
                  </button>
                </div>
              </div>

              {/* Payment Method */}
              <div className="pt-4 border-t border-[#DFD3C0] space-y-2.5">
                <h3 className="font-display text-xl text-[#231B17]">3. Settlement Method</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(
                    [
                      { id: 'upi', label: 'Razorpay UPI' },
                      { id: 'card', label: 'Cards' },
                      { id: 'netbanking', label: 'NetBanking' },
                      { id: 'cod', label: 'Cash on Delivery' },
                    ] as const
                  ).map((m) => {
                    const disabled = m.id === 'cod' && !codAllowed;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setPaymentMethod(m.id)}
                        className={`py-2.5 px-2 text-xs font-medium border transition-colors disabled:opacity-40 ${
                          paymentMethod === m.id
                            ? 'border-[#6B1D2A] bg-[#F3ECE1] text-[#231B17]'
                            : 'border-[#DFD3C0] bg-white text-[#6E5F54]'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                {!codAllowed && publicSettings.codEnabled && (
                  <p className="text-[11px] text-[#6E5F54]">
                    Cash on Delivery is available for acquisitions up to {formatInr(publicSettings.codMaxOrderInr)}.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] disabled:opacity-50"
              >
                {busy
                  ? 'Creating Authoritative Server Order...'
                  : !dualVerified
                    ? 'Sign In & Verify Identity to Continue'
                    : paymentMethod === 'cod' && codAllowed
                      ? `Confirm Cash on Delivery (${formatInr(totals.totalInr)})`
                      : `Continue to Razorpay Settlement (${formatInr(totals.totalInr)})`}
              </button>
            </form>
          ) : (
            <div className="bg-white border border-[#DFD3C0] p-7 space-y-5">
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#DFD3C0]">
                <div>
                  <p className="text-xs text-[#A67C37] uppercase tracking-wider">
                    Razorpay Secure Settlement ({pendingOrder.mode})
                  </p>
                  <h2 className="font-display text-2xl text-[#231B17] mt-0.5">
                    Order {pendingOrder.order.orderNumber}
                  </h2>
                </div>
                <span className="font-mono text-xs text-[#6E5F54]">
                  {pendingOrder.razorpayOrderId}
                </span>
              </div>

              <div className="p-4 bg-[#F3ECE1]/60 border border-[#DFD3C0] text-xs text-[#6E5F54] flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-[#A67C37] shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Payment authorization returns a cryptographic HMAC-SHA256 signature verified on the VIRAASAT server using constant-time comparison before stock deduction and order confirmation.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleAuthorizeAndVerifyPayment}
                className="w-full py-3 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] disabled:opacity-50"
              >
                {busy
                  ? 'Verifying Razorpay Signature...'
                  : `Authorize & Verify ${formatInr(pendingOrder.order.totalInr)}`}
              </button>
            </div>
          )}
        </div>

        {/* Order Summary + Coupon Engine */}
        <aside className="lg:col-span-5 bg-[#F3ECE1]/60 border border-[#DFD3C0] p-6 space-y-5">
          <h2 className="font-display text-2xl text-[#231B17]">Order Summary</h2>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantLabel}`} className="flex gap-3">
                <HeritageImage
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-16 h-16 object-cover bg-white shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#231B17] truncate">{item.title}</p>
                  <p className="text-xs text-[#6E5F54] truncate">
                    {item.variantLabel} · Qty {item.quantity}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-[#231B17] mt-1">
                    {formatInr(item.unitPriceInr * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {!pendingOrder && (
            <div className="pt-4 border-t border-[#DFD3C0] space-y-2">
              <label htmlFor="coupon-code" className="flex items-center gap-1.5 text-xs font-medium text-[#231B17]">
                <Tag className="w-3.5 h-3.5 text-[#A67C37]" aria-hidden="true" />
                <span>Patron Privilege Code (Try VIRAASAT10)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="coupon-code"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="VIRAASAT10"
                  className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-white border border-[#DFD3C0]"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#6B1D2A]"
                >
                  Apply
                </button>
              </div>
              {couponMessage && (
                <p className="text-xs text-[#6B1D2A]">{couponMessage}</p>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-[#DFD3C0] space-y-2 text-sm">
            <div className="flex justify-between text-[#6E5F54]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums text-[#231B17]">
                {formatInr(totals.subtotalInr)}
              </span>
            </div>
            {totals.discountInr > 0 && (
              <div className="flex justify-between text-[#6B1D2A]">
                <span>Coupon ({appliedCoupon?.code})</span>
                <span className="font-mono tabular-nums">-{formatInr(totals.discountInr)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#6E5F54]">
              <span>GST (12%)</span>
              <span className="font-mono tabular-nums text-[#231B17]">
                {formatInr(totals.taxInr)}
              </span>
            </div>
            <div className="flex justify-between text-[#6E5F54]">
              <span>Insured Vault Courier</span>
              <span className="font-mono tabular-nums text-[#231B17]">
                {totals.shippingInr === 0 ? 'Complimentary' : formatInr(totals.shippingInr)}
              </span>
            </div>
            <div className="flex justify-between pt-3 border-t border-[#DFD3C0] text-base font-semibold text-[#231B17]">
              <span>Total Payable</span>
              <span className="font-mono tabular-nums">{formatInr(totals.totalInr)}</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
