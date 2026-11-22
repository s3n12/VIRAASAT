import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Heart, MapPin, Package, ShieldCheck, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatInr } from '../lib/commerce';
import type {
  NotificationItem,
  NotificationPreferences,
  Order,
  Product,
  ShippingAddress,
  UserProfile,
} from '../types/marketplace';
import { HeritageImage } from './HeritageImage';

interface CustomerDashboardProps {
  user: UserProfile;
  token: string;
  products: Product[];
  wishlistIds: string[];
  onToggleWishlist: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onOpenAuth: () => void;
  onUserUpdated: (user: UserProfile) => void;
}

export function CustomerDashboard({
  user,
  token,
  products,
  wishlistIds,
  onToggleWishlist,
  onSelectProduct,
  onOpenAuth,
  onUserUpdated,
}: CustomerDashboardProps) {
  const [tab, setTab] = useState<'orders' | 'addresses' | 'wishlist' | 'notifications' | 'security'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Return request state
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // Profile & notification prefs
  const [displayName, setDisplayName] = useState(user.displayName);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    user.notificationPreferences || {
      orderEmail: true,
      orderSms: true,
      securityAlerts: true,
      editorialNewsletter: true,
    }
  );

  // New Address state
  const [addrForm, setAddrForm] = useState<ShippingAddress>({
    label: 'Residence',
    fullName: user.displayName,
    addressLine: '',
    city: '',
    state: '',
    postalCode: '',
    phone: user.phone || '',
    isDefault: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordRes, ntfRes] = await Promise.all([
        apiRequest<{ orders: Order[] }>('/api/orders?scope=mine', { token }),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', { token }),
      ]);
      setOrders(ordRes.orders);
      setNotifications(ntfRes.notifications);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const markAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST', token });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleRequestReturn = async (orderId: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ order: Order }>(`/api/orders/${orderId}/return-request`, {
        method: 'POST',
        token,
        body: { reason: returnReason },
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.order : o)));
      setReturnOrderId(null);
      setReturnReason('');
      setNotice('Return & refund request submitted to the Curatorial Council.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit return request.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        token,
        body: { displayName, notificationPreferences: prefs },
      });
      onUserUpdated(res.user);
      setNotice('Profile and notification preferences saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.');
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/addresses', {
        method: 'POST',
        token,
        body: addrForm,
      });
      onUserUpdated(res.user);
      setAddrForm({
        label: 'Residence',
        fullName: user.displayName,
        addressLine: '',
        city: '',
        state: '',
        postalCode: '',
        phone: user.phone || '',
        isDefault: false,
      });
      setNotice('Saved vault delivery address added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add address.');
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      const res = await apiRequest<{ user: UserProfile }>(`/api/addresses/${id}`, {
        method: 'DELETE',
        token,
      });
      onUserUpdated(res.user);
      setNotice('Address removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete address.');
    }
  };

  const wishlistProducts = products.filter((p) => wishlistIds.includes(p.id));
  const unreadCount = notifications.filter((n) => !n.read).length;
  const addresses = user.savedAddresses || [];

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="p-3.5 text-xs bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 text-[#6B1D2A]">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 text-xs bg-[#A67C37]/10 border border-[#A67C37]/30 text-[#231B17]">
          {notice}
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 bg-white border border-[#DFD3C0]">
          <p className="text-xs text-[#6E5F54]">Acquisitions</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#231B17] mt-1">
            {orders.length}
          </p>
        </div>
        <div className="p-5 bg-white border border-[#DFD3C0]">
          <p className="text-xs text-[#6E5F54]">Saved Wishlist</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#231B17] mt-1">
            {wishlistProducts.length}
          </p>
        </div>
        <div className="p-5 bg-white border border-[#DFD3C0]">
          <p className="text-xs text-[#6E5F54]">Saved Addresses</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-[#231B17] mt-1">
            {addresses.length}
          </p>
        </div>
        <div className="p-5 bg-white border border-[#DFD3C0]">
          <p className="text-xs text-[#6E5F54]">Dual OTP Security</p>
          <p className="text-sm font-semibold text-[#6B1D2A] mt-2">
            {user.emailVerified && user.phoneVerified ? 'Email & Phone Verified' : 'Action Required'}
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#DFD3C0] pb-3">
        {[
          { id: 'orders', label: `Orders & Payments (${orders.length})`, icon: Package },
          { id: 'addresses', label: `Addresses (${addresses.length})`, icon: MapPin },
          { id: 'wishlist', label: `Wishlist (${wishlistProducts.length})`, icon: Heart },
          { id: 'notifications', label: `Notifications (${unreadCount})`, icon: Bell },
          { id: 'security', label: 'Profile & Security', icon: ShieldCheck },
        ].map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#6B1D2A] text-[#FAF7F2]'
                  : 'bg-[#F3ECE1] text-[#231B17] hover:bg-[#EBE1D1]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'orders' && (
        <div className="space-y-5">
          {loading ? (
            <div className="space-y-4">
              <div className="h-32 bg-[#F3ECE1] animate-pulse" />
              <div className="h-32 bg-[#F3ECE1] animate-pulse" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-10 bg-white border border-[#DFD3C0] text-center">
              <p className="font-display text-2xl text-[#231B17]">No orders yet</p>
              <p className="text-xs text-[#6E5F54] mt-1">
                Verified acquisitions and insured courier timelines will appear here.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <article key={order.id} className="bg-white border border-[#DFD3C0] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#DFD3C0]">
                  <div>
                    <p className="font-mono text-sm font-semibold text-[#231B17]">
                      {order.orderNumber}
                      {order.trackingNumber && (
                        <span className="ml-2 text-xs font-normal text-[#A67C37]">
                          AWB: {order.trackingNumber}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#6E5F54] mt-0.5">
                      Status: <strong className="text-[#6B1D2A] uppercase">{order.status}</strong> ·
                      Payment: <strong className="uppercase">{order.paymentStatus}</strong> ({order.paymentMethod.toUpperCase()})
                      {order.razorpayPaymentId && ` · Ref ${order.razorpayPaymentId}`}
                    </p>
                  </div>
                  <p className="font-mono text-lg font-semibold tabular-nums text-[#231B17]">
                    {formatInr(order.totalInr)}
                  </p>
                </div>

                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={`${order.id}-${item.productId}-${item.variantLabel}`}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <HeritageImage
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-12 h-12 object-cover bg-[#F3ECE1] shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-[#231B17] truncate">{item.title}</p>
                          <p className="text-xs text-[#6E5F54]">
                            {item.variantLabel} · Qty {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-xs text-[#231B17] shrink-0">
                        {formatInr(item.unitPriceInr * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-[#DFD3C0]/70 space-y-2">
                  <p className="text-xs font-medium text-[#231B17]">Fulfillment & Tracking Timeline</p>
                  <ol className="space-y-1.5 text-xs text-[#6E5F54]">
                    {order.timeline.map((step, idx) => (
                      <li key={idx} className="flex items-baseline justify-between gap-4">
                        <span>
                          <strong className="text-[#231B17] uppercase">{step.status}</strong> — {step.note}
                        </span>
                        <span className="font-mono text-[11px] shrink-0">
                          {new Date(step.timestamp).toLocaleDateString('en-IN')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Return / Refund Status or Action */}
                {order.returnRequest ? (
                  <div className="p-3 bg-[#F3ECE1] border border-[#DFD3C0] text-xs">
                    <p className="font-medium text-[#231B17]">
                      Return / Refund Status:{' '}
                      <span className="uppercase text-[#6B1D2A]">{order.returnRequest.status}</span>
                    </p>
                    <p className="text-[#6E5F54] mt-0.5">Reason: {order.returnRequest.reason}</p>
                  </div>
                ) : (
                  order.status !== 'cancelled' &&
                  order.status !== 'refunded' && (
                    <div className="pt-2">
                      {returnOrderId === order.id ? (
                        <div className="p-4 bg-[#FAF7F2] border border-[#DFD3C0] space-y-2.5">
                          <label htmlFor={`ret-${order.id}`} className="block text-xs font-medium text-[#231B17]">
                            Reason for Return / Refund Request
                          </label>
                          <textarea
                            id={`ret-${order.id}`}
                            rows={2}
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="Explain your return or refund request (minimum 10 characters)..."
                            className="w-full px-3 py-2 text-xs bg-white border border-[#DFD3C0]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleRequestReturn(order.id)}
                              className="px-4 py-1.5 text-xs bg-[#6B1D2A] text-[#FAF7F2]"
                            >
                              Submit Return Request
                            </button>
                            <button
                              type="button"
                              onClick={() => setReturnOrderId(null)}
                              className="px-4 py-1.5 text-xs border border-[#DFD3C0] text-[#6E5F54]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReturnOrderId(order.id)}
                          className="text-xs font-medium text-[#6B1D2A] hover:underline"
                        >
                          Request Return / Refund
                        </button>
                      )}
                    </div>
                  )
                )}
              </article>
            ))
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-4">
            <h2 className="font-display text-2xl text-[#231B17]">Saved Vault Addresses</h2>
            {addresses.length === 0 ? (
              <p className="text-sm text-[#6E5F54]">No saved addresses yet.</p>
            ) : (
              addresses.map((addr) => (
                <div
                  key={addr.id || addr.addressLine}
                  className="p-5 bg-white border border-[#DFD3C0] flex items-start justify-between gap-4"
                >
                  <div className="text-xs text-[#6E5F54] space-y-0.5">
                    <p className="font-semibold text-sm text-[#231B17]">
                      {addr.label || 'Residence'}{' '}
                      {addr.isDefault && <span className="text-[#A67C37] text-xs">(Default)</span>}
                    </p>
                    <p>{addr.fullName}</p>
                    <p>{addr.addressLine}</p>
                    <p>
                      {addr.city}, {addr.state} — <span className="font-mono">{addr.postalCode}</span>
                    </p>
                    <p className="font-mono">{addr.phone}</p>
                  </div>
                  {addr.id && (
                    <button
                      type="button"
                      aria-label={`Delete ${addr.label || 'address'}`}
                      onClick={() => handleDeleteAddress(addr.id!)}
                      className="p-2 text-[#6E5F54] hover:text-[#6B1D2A]"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleAddAddress}
            className="lg:col-span-6 bg-white border border-[#DFD3C0] p-6 space-y-4"
          >
            <h3 className="font-display text-2xl text-[#231B17]">Add New Delivery Address</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="addr-label" className="block text-xs font-medium text-[#231B17] mb-1">
                  Label
                </label>
                <input
                  id="addr-label"
                  required
                  value={addrForm.label || ''}
                  onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
                />
              </div>
              <div>
                <label htmlFor="addr-name" className="block text-xs font-medium text-[#231B17] mb-1">
                  Recipient Name
                </label>
                <input
                  id="addr-name"
                  required
                  value={addrForm.fullName}
                  onChange={(e) => setAddrForm({ ...addrForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="addr-line" className="block text-xs font-medium text-[#231B17] mb-1">
                Street Address
              </label>
              <input
                id="addr-line"
                required
                value={addrForm.addressLine}
                onChange={(e) => setAddrForm({ ...addrForm, addressLine: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input
                aria-label="City"
                required
                placeholder="City"
                value={addrForm.city}
                onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                className="px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
              />
              <input
                aria-label="State"
                required
                placeholder="State"
                value={addrForm.state}
                onChange={(e) => setAddrForm({ ...addrForm, state: e.target.value })}
                className="px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
              />
              <input
                aria-label="PIN Code"
                required
                maxLength={6}
                placeholder="6-digit PIN"
                value={addrForm.postalCode}
                onChange={(e) =>
                  setAddrForm({ ...addrForm, postalCode: e.target.value.replace(/\D/g, '') })
                }
                className="px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
              />
            </div>
            <input
              aria-label="Contact Phone"
              required
              placeholder="+919844000004"
              value={addrForm.phone}
              onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
            >
              Save Address
            </button>
          </form>
        </div>
      )}

      {tab === 'wishlist' && (
        <div>
          {wishlistProducts.length === 0 ? (
            <div className="p-10 bg-white border border-[#DFD3C0] text-center">
              <p className="font-display text-2xl text-[#231B17]">Your wishlist is empty</p>
              <p className="text-xs text-[#6E5F54] mt-1">
                Tap the heart icon on any heritage piece to curate your private archive.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {wishlistProducts.map((p) => (
                <div key={p.id} className="bg-white border border-[#DFD3C0] p-4 flex flex-col gap-3">
                  <HeritageImage
                    src={p.imageUrl}
                    alt={p.title}
                    className="aspect-[4/3] w-full object-cover bg-[#F3ECE1]"
                  />
                  <div>
                    <p className="text-xs text-[#6E5F54]">{p.craftOrigin}</p>
                    <h3 className="font-display text-xl text-[#231B17]">{p.title}</h3>
                    <p className="font-mono text-sm font-semibold tabular-nums mt-1">
                      {formatInr(p.priceInr)}
                    </p>
                  </div>
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onSelectProduct(p)}
                      className="flex-1 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2]"
                    >
                      View Piece
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(p.id)}
                      className="px-3 py-2 text-xs border border-[#DFD3C0] text-[#6E5F54] hover:text-[#6B1D2A]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-[#231B17]">Account Dispatches</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B1D2A] hover:underline"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                <span>Mark all as read</span>
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-[#6E5F54]">No notifications yet.</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 border border-[#DFD3C0] ${item.read ? 'bg-[#FAF7F2]' : 'bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[#231B17]">
                      {item.title}{' '}
                      {!item.read && <span className="text-[#6B1D2A] text-xs">(New)</span>}
                    </p>
                    <span className="text-[11px] font-mono text-[#6E5F54]">
                      {new Date(item.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs text-[#6E5F54] mt-1">{item.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-6 bg-white border border-[#DFD3C0] p-6 space-y-4"
          >
            <h2 className="font-display text-2xl text-[#231B17]">Profile & Notification Settings</h2>
            <div>
              <label htmlFor="prof-name" className="block text-xs font-medium text-[#231B17] mb-1">
                Patron Display Name
              </label>
              <input
                id="prof-name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-[#DFD3C0] text-xs text-[#231B17]">
              <p className="font-medium text-[#6E5F54]">Notification Channels</p>
              {(
                [
                  { key: 'orderEmail', label: 'Order & Shipping Updates via Email' },
                  { key: 'orderSms', label: 'Delivery & Dispatch SMS Alerts' },
                  { key: 'securityAlerts', label: 'Login & Dual-OTP Security Events' },
                  { key: 'editorialNewsletter', label: 'Private Atelier Releases & Journal' },
                ] as const
              ).map((item) => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs[item.key]}
                    onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })}
                    className="accent-[#6B1D2A]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
            >
              Save Profile Settings
            </button>
          </form>

          <div className="lg:col-span-6 bg-white border border-[#DFD3C0] p-6 space-y-4">
            <h2 className="font-display text-2xl text-[#231B17]">Identity & Dual OTP Status</h2>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[#6E5F54]">Email Channel</dt>
                <dd className="font-medium text-[#231B17] mt-0.5">
                  {user.email} — {user.emailVerified ? 'Verified' : 'Unverified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#6E5F54]">Mobile Channel</dt>
                <dd className="font-mono text-[#231B17] mt-0.5">
                  {user.phone || 'Not linked'} — {user.phoneVerified ? 'Verified' : 'Unverified'}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 bg-[#231B17] text-[#FAF7F2] text-xs font-medium hover:bg-[#6B1D2A]"
            >
              Change / Re-verify Email or Phone OTP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
