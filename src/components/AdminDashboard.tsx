import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { formatInr } from '../lib/commerce';
import type {
  AdminAnalytics,
  AdminSettings,
  AuditLog,
  CmsContent,
  ContactInquiry,
  Coupon,
  NewsletterSubscriber,
  Order,
  Product,
  SellerApplication,
  UserProfile,
  UserRole,
} from '../types/marketplace';

interface AdminDashboardProps {
  token: string;
  cms: CmsContent;
  products: Product[];
  onCmsUpdated: (cms: CmsContent) => void;
  onRefreshProducts: () => Promise<void>;
}

export function AdminDashboard({
  token,
  cms,
  products,
  onCmsUpdated,
  onRefreshProducts,
}: AdminDashboardProps) {
  const [subtab, setSubtab] = useState<
    'overview' | 'sellers' | 'users' | 'products' | 'orders' | 'coupons' | 'cms' | 'settings' | 'audit'
  >('overview');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilter, setAuditFilter] = useState<'all' | 'success' | 'denied' | 'failure'>('all');

  const [heroHeadline, setHeroHeadline] = useState(cms.hero.headline);
  const [heroSubheadline, setHeroSubheadline] = useState(cms.hero.subheadline);
  const [announcementText, setAnnouncementText] = useState(cms.announcement.text);
  const [announcementEnabled, setAnnouncementEnabled] = useState(cms.announcement.enabled);
  const [storyHeading, setStoryHeading] = useState(cms.heritageStory.heading);

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    description: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 10,
    minOrderInr: 15000,
    maxDiscountInr: 10000,
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAdminData = async () => {
    try {
      const [anaRes, usrRes, appRes, ordRes, cpnRes, setRes, inqRes, logRes] = await Promise.all([
        apiRequest<{ analytics: AdminAnalytics }>('/api/analytics/admin', { token }),
        apiRequest<{ users: UserProfile[] }>('/api/admin/users', { token }),
        apiRequest<{ applications: SellerApplication[] }>('/api/admin/seller-applications', { token }),
        apiRequest<{ orders: Order[] }>('/api/orders?scope=all', { token }),
        apiRequest<{ coupons: Coupon[] }>('/api/admin/coupons', { token }),
        apiRequest<{ settings: AdminSettings }>('/api/admin/settings', { token }),
        apiRequest<{ inquiries: ContactInquiry[]; subscribers: NewsletterSubscriber[] }>(
          '/api/admin/inquiries',
          { token }
        ),
        apiRequest<{ auditLogs: AuditLog[] }>(`/api/admin/audit-logs?outcome=${auditFilter}`, {
          token,
        }),
      ]);
      setAnalytics(anaRes.analytics);
      setUsers(usrRes.users);
      setApplications(appRes.applications);
      setOrders(ordRes.orders);
      setCoupons(cpnRes.coupons);
      setSettings(setRes.settings);
      setInquiries(inqRes.inquiries);
      setSubscribers(inqRes.subscribers);
      setAuditLogs(logRes.auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin console.');
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, [token, auditFilter]);

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        token,
        body: { role },
      });
      await loadAdminData();
      setNotice('User role updated and recorded in audit log.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed.');
    }
  };

  const handleToggleSuspend = async (userId: string, suspended: boolean) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        token,
        body: { suspended },
      });
      await loadAdminData();
      setNotice(`Account ${suspended ? 'suspended' : 'reactivated'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account status update failed.');
    }
  };

  const handleReviewSeller = async (id: string, status: 'approved' | 'rejected') => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/seller-applications/${id}`, {
        method: 'PATCH',
        token,
        body: { status },
      });
      await loadAdminData();
      setNotice(`Artisan onboarding application ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application review failed.');
    }
  };

  const handleModerateProduct = async (
    id: string,
    patch: { approved?: boolean; featured?: boolean; status?: 'active' | 'archived' }
  ) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/products/${id}/moderate`, {
        method: 'PATCH',
        token,
        body: patch,
      });
      await onRefreshProducts();
      await loadAdminData();
      setNotice('Product moderation updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation failed.');
    }
  };

  const handleInitiateRefund = async (orderId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        token,
        body: { note: 'Refund approved and processed by Super Admin.' },
      });
      await loadAdminData();
      setNotice('Refund processed and logged in security audit trail.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed.');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/admin/coupons', {
        method: 'POST',
        token,
        body: newCoupon,
      });
      setNewCoupon({
        code: '',
        description: '',
        type: 'percentage',
        value: 10,
        minOrderInr: 15000,
        maxDiscountInr: 10000,
      });
      await loadAdminData();
      setNotice('New privilege coupon published.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create coupon.');
    }
  };

  const handleToggleCoupon = async (code: string, active: boolean) => {
    await apiRequest(`/api/admin/coupons/${code}`, {
      method: 'PATCH',
      token,
      body: { active },
    });
    await loadAdminData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PATCH',
        token,
        body: {
          commissionPercent: settings.commissionPercent,
          codEnabled: settings.codEnabled,
          codMaxOrderInr: settings.codMaxOrderInr,
          freeShippingThresholdInr: settings.freeShippingThresholdInr,
        },
      });
      await loadAdminData();
      setNotice('Platform commerce & commission settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings update failed.');
    }
  };

  const handleSaveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ cms: CmsContent }>('/api/cms', {
        method: 'PATCH',
        token,
        body: {
          announcement: { enabled: announcementEnabled, text: announcementText },
          hero: {
            kicker: cms.hero.kicker,
            headline: heroHeadline,
            subheadline: heroSubheadline,
            ctaLabel: cms.hero.ctaLabel,
          },
          heritageStory: { ...cms.heritageStory, heading: storyHeading },
        },
      });
      onCmsUpdated(res.cms);
      await loadAdminData();
      setNotice('Editorial CMS published live to storefront.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CMS update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestWebhook = async (tamper: boolean) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ verified: boolean; message: string }>(
        '/api/admin/webhooks/verify-test',
        { method: 'POST', token, body: { tamper } }
      );
      setNotice(res.message);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Webhook test failed.');
    }
  };

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

      {/* Super Admin Sub-tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#DFD3C0] pb-3">
        {[
          { id: 'overview', label: 'Analytics Overview' },
          { id: 'sellers', label: `Seller KYC (${applications.filter((a) => a.status === 'pending').length})` },
          { id: 'users', label: `Users & RBAC (${users.length})` },
          { id: 'products', label: `Products (${products.length})` },
          { id: 'orders', label: `Orders & Refunds (${orders.length})` },
          { id: 'coupons', label: `Coupons (${coupons.length})` },
          { id: 'cms', label: 'Storefront CMS' },
          { id: 'settings', label: 'Settings & Inbox' },
          { id: 'audit', label: `Audit Logs (${auditLogs.length})` },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubtab(item.id as typeof subtab)}
            className={`px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              subtab === item.id
                ? 'bg-[#6B1D2A] text-[#FAF7F2]'
                : 'bg-[#F3ECE1] text-[#231B17] hover:bg-[#EBE1D1]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {subtab === 'overview' && analytics && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Gross Merchandise Value</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#231B17] mt-1">
                {formatInr(analytics.grossMerchandiseValueInr)}
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Total Orders</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#231B17] mt-1">
                {analytics.totalOrders}
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Pending Seller KYC</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#6B1D2A] mt-1">
                {analytics.pendingSellerApprovalsCount}
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Dual-Verified Accounts</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#231B17] mt-1">
                {analytics.dualVerifiedPercentage}%
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Active Products</p>
              <p className="font-mono text-xl font-semibold tabular-nums text-[#231B17] mt-1">
                {analytics.totalProducts}
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Refund Requests</p>
              <p className="font-mono text-xl font-semibold tabular-nums text-[#6B1D2A] mt-1">
                {analytics.pendingRefundsCount}
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Low Stock Alerts</p>
              <p className="font-mono text-xl font-semibold tabular-nums text-[#231B17] mt-1">
                {analytics.lowStockAlertsCount}
              </p>
            </div>
            <div className="p-5 bg-white border border-[#DFD3C0]">
              <p className="text-xs text-[#6E5F54]">Newsletter Patrons</p>
              <p className="font-mono text-xl font-semibold tabular-nums text-[#231B17] mt-1">
                {analytics.newsletterSubscribersCount}
              </p>
            </div>
          </div>

          <section className="bg-white border border-[#DFD3C0] p-6 space-y-4">
            <h2 className="font-display text-2xl text-[#231B17]">Revenue by Craft Origin Cluster</h2>
            <div className="space-y-3">
              {analytics.revenueByOrigin.map((row) => {
                const maxRev = Math.max(...analytics.revenueByOrigin.map((r) => r.revenueInr), 1);
                const pct = Math.max(8, Math.round((row.revenueInr / maxRev) * 100));
                return (
                  <div key={row.origin} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#231B17]">{row.origin}</span>
                      <span className="font-mono tabular-nums text-[#6E5F54]">
                        {formatInr(row.revenueInr)}
                      </span>
                    </div>
                    <div className="h-2 bg-[#F3ECE1] overflow-hidden">
                      <div className="h-full bg-[#6B1D2A]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {subtab === 'sellers' && (
        <section className="bg-white border border-[#DFD3C0] p-6 space-y-4">
          <h2 className="font-display text-2xl text-[#231B17]">Artisan Seller KYC Approvals</h2>
          {applications.length === 0 ? (
            <p className="text-xs text-[#6E5F54]">No seller applications submitted yet.</p>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="p-5 border border-[#DFD3C0] bg-[#FAF7F2] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 text-xs text-[#6E5F54]">
                    <p className="font-display text-xl text-[#231B17]">
                      {app.businessName} · <span className="text-sm font-sans">{app.craftRegion}</span>
                    </p>
                    <p>
                      Applicant: <strong>{app.fullName}</strong> ({app.email} · {app.phone})
                    </p>
                    <p className="font-mono">
                      PAN: {app.panNumber} {app.gstin ? `· GSTIN: ${app.gstin}` : ''} · Bank: ****{app.bankAccountLast4} ({app.ifscCode})
                    </p>
                    <p>
                      Verification Doc: <strong>{app.identityDocType}</strong> ({app.identityDocRef})
                    </p>
                    <p className="pt-1 text-[#231B17]">{app.portfolioSummary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {app.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReviewSeller(app.id, 'approved')}
                          className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F]"
                        >
                          Approve Atelier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewSeller(app.id, 'rejected')}
                          className="px-4 py-2 text-xs border border-[#DFD3C0] bg-white text-[#6E5F54]"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="px-3 py-1 text-xs font-medium uppercase bg-white border border-[#DFD3C0] text-[#6B1D2A]">
                        {app.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {subtab === 'users' && (
        <section className="bg-white border border-[#DFD3C0] p-6 overflow-x-auto">
          <h2 className="font-display text-2xl text-[#231B17] mb-4">
            Member Directory, Suspension & RBAC Controls
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DFD3C0] text-[#6E5F54]">
                <th className="py-2.5 pr-4 font-medium">Member</th>
                <th className="py-2.5 pr-4 font-medium">Verified</th>
                <th className="py-2.5 pr-4 font-medium">Role</th>
                <th className="py-2.5 pr-4 font-medium">Account</th>
                <th className="py-2.5 font-medium text-right">Governance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFD3C0]/60">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-[#231B17]">{u.displayName}</p>
                    <p className="text-[11px] text-[#6E5F54]">
                      {u.email} · <span className="font-mono">{u.phone || '—'}</span>
                    </p>
                  </td>
                  <td className="py-3 pr-4 text-[#6E5F54]">
                    Email: {u.emailVerified ? 'Yes' : 'No'} · Phone: {u.phoneVerified ? 'Yes' : 'No'}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className="px-2 py-1 bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17]"
                    >
                      <option value="customer">Customer</option>
                      <option value="seller">Artisan Seller</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4 uppercase text-[#6B1D2A]">
                    {u.suspended ? 'Suspended' : 'Active'}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleSuspend(u.id, !u.suspended)}
                      className="px-3 py-1 border border-[#DFD3C0] bg-[#FAF7F2] hover:border-[#6B1D2A] text-[#231B17]"
                    >
                      {u.suspended ? 'Activate' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {subtab === 'products' && (
        <section className="bg-white border border-[#DFD3C0] p-6 overflow-x-auto">
          <h2 className="font-display text-2xl text-[#231B17] mb-4">
            Catalogue Moderation & Featured Curation
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DFD3C0] text-[#6E5F54]">
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 pr-4 font-medium">Atelier</th>
                <th className="py-2 pr-4 font-medium">Stock</th>
                <th className="py-2 pr-4 font-medium">Featured</th>
                <th className="py-2 font-medium text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFD3C0]/60">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-[#231B17]">{p.title}</p>
                    <p className="text-[11px] text-[#6E5F54]">{p.category} · {formatInr(p.priceInr)}</p>
                  </td>
                  <td className="py-3 pr-4 text-[#6E5F54]">{p.atelierName}</td>
                  <td className="py-3 pr-4 font-mono">{p.stock}</td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => handleModerateProduct(p.id, { featured: !p.featured })}
                      className={`px-2.5 py-1 border ${
                        p.featured
                          ? 'bg-[#A67C37] text-white border-[#A67C37]'
                          : 'bg-[#FAF7F2] text-[#6E5F54] border-[#DFD3C0]'
                      }`}
                    >
                      {p.featured ? 'Featured' : 'Standard'}
                    </button>
                  </td>
                  <td className="py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleModerateProduct(p.id, { approved: !p.approved })}
                      className="px-2.5 py-1 border border-[#DFD3C0] bg-[#FAF7F2] text-[#231B17]"
                    >
                      {p.approved ? 'Revoke Approval' : 'Approve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {subtab === 'orders' && (
        <div className="space-y-6">
          <section className="bg-[#F3ECE1]/60 border border-[#DFD3C0] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-[#231B17]">
                Razorpay Webhook HMAC Signature Verifier
              </h2>
              <p className="text-xs text-[#6E5F54] mt-1">
                Exercise real server-side raw-body HMAC-SHA256 verification and confirm tampered payloads are rejected.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleTestWebhook(false)}
                className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F]"
              >
                Verify Signed Webhook
              </button>
              <button
                type="button"
                onClick={() => handleTestWebhook(true)}
                className="px-4 py-2 text-xs font-medium bg-white border border-[#DFD3C0] text-[#231B17] hover:border-[#6B1D2A]"
              >
                Test Tampered Signature
              </button>
            </div>
          </section>

          <section className="bg-white border border-[#DFD3C0] p-6 overflow-x-auto">
            <h3 className="font-display text-2xl text-[#231B17] mb-4">All Marketplace Orders & Refunds</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DFD3C0] text-[#6E5F54]">
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Patron</th>
                  <th className="py-2 pr-4 font-medium">Payment</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th>
                  <th className="py-2 font-medium text-right">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFD3C0]/60">
                {orders.map((ord) => (
                  <tr key={ord.id}>
                    <td className="py-3 pr-4 font-mono text-[#231B17]">
                      {ord.orderNumber}
                      {ord.returnRequest && (
                        <p className="text-[10px] text-[#6B1D2A]">Return: {ord.returnRequest.status}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[#6E5F54]">{ord.customerEmail}</td>
                    <td className="py-3 pr-4 uppercase text-[#231B17]">
                      {ord.paymentStatus} ({ord.paymentMethod})
                    </td>
                    <td className="py-3 pr-4 uppercase text-[#6B1D2A]">{ord.status}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      {formatInr(ord.totalInr)}
                    </td>
                    <td className="py-3 text-right">
                      {ord.status !== 'refunded' ? (
                        <button
                          type="button"
                          onClick={() => handleInitiateRefund(ord.id)}
                          className="px-3 py-1 text-xs border border-[#6B1D2A] text-[#6B1D2A] hover:bg-[#6B1D2A] hover:text-white"
                        >
                          Issue Refund
                        </button>
                      ) : (
                        <span className="text-[#6E5F54]">Refunded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {subtab === 'coupons' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white border border-[#DFD3C0] p-6 space-y-4">
            <h2 className="font-display text-2xl text-[#231B17]">Active Privilege Coupons</h2>
            <div className="space-y-3">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className="p-4 border border-[#DFD3C0] bg-[#FAF7F2] flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-[#231B17]">
                      {c.code}{' '}
                      <span className="text-xs font-normal text-[#A67C37]">
                        ({c.type === 'percentage' ? `${c.value}%` : formatInr(c.value)} · Min {formatInr(c.minOrderInr)})
                      </span>
                    </p>
                    <p className="text-xs text-[#6E5F54]">{c.description}</p>
                    <p className="text-[11px] text-[#6E5F54] mt-0.5">
                      Redemptions: {c.redemptionCount}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleCoupon(c.code, !c.active)}
                    className={`px-3 py-1.5 text-xs border ${
                      c.active
                        ? 'bg-[#6B1D2A] text-white border-[#6B1D2A]'
                        : 'bg-white text-[#6E5F54] border-[#DFD3C0]'
                    }`}
                  >
                    {c.active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleCreateCoupon}
            className="lg:col-span-5 bg-white border border-[#DFD3C0] p-6 space-y-4"
          >
            <h3 className="font-display text-2xl text-[#231B17]">Create Privilege Code</h3>
            <input
              aria-label="Coupon code"
              required
              placeholder="DIWALI15"
              value={newCoupon.code}
              onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-xs font-mono uppercase bg-[#FAF7F2] border border-[#DFD3C0]"
            />
            <input
              aria-label="Coupon description"
              required
              placeholder="Festive 15% Patron Privilege"
              value={newCoupon.description}
              onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                aria-label="Discount type"
                value={newCoupon.type}
                onChange={(e) =>
                  setNewCoupon({ ...newCoupon, type: e.target.value as 'percentage' | 'fixed' })
                }
                className="px-3 py-2 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed INR (₹)</option>
              </select>
              <input
                aria-label="Discount value"
                type="number"
                required
                min={1}
                value={newCoupon.value}
                onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })}
                className="px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                aria-label="Minimum order INR"
                type="number"
                min={0}
                value={newCoupon.minOrderInr}
                onChange={(e) =>
                  setNewCoupon({ ...newCoupon, minOrderInr: Number(e.target.value) })
                }
                placeholder="Min Order ₹"
                className="px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
              />
              <input
                aria-label="Max discount INR"
                type="number"
                min={100}
                value={newCoupon.maxDiscountInr}
                onChange={(e) =>
                  setNewCoupon({ ...newCoupon, maxDiscountInr: Number(e.target.value) })
                }
                placeholder="Max Discount ₹"
                className="px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
            >
              Publish Coupon
            </button>
          </form>
        </div>
      )}

      {subtab === 'cms' && (
        <form
          onSubmit={handleSaveCms}
          className="bg-white border border-[#DFD3C0] p-6 max-w-2xl space-y-5"
        >
          <div>
            <h2 className="font-display text-2xl text-[#231B17]">Editorial Storefront CMS</h2>
            <p className="text-xs text-[#6E5F54] mt-0.5">
              Changes publish immediately to the VIRAASAT homepage and are logged in the audit trail.
            </p>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-xs text-[#231B17]">
              <input
                type="checkbox"
                checked={announcementEnabled}
                onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                className="accent-[#6B1D2A]"
              />
              <span>Show top announcement ribbon</span>
            </label>
            <label htmlFor="cms-announcement" className="block text-xs font-medium text-[#6E5F54]">
              Announcement Text
            </label>
            <input
              id="cms-announcement"
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>

          <div>
            <label htmlFor="cms-hero-headline" className="block text-xs font-medium text-[#6E5F54] mb-1">
              Hero Display Headline
            </label>
            <input
              id="cms-hero-headline"
              required
              value={heroHeadline}
              onChange={(e) => setHeroHeadline(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>

          <div>
            <label htmlFor="cms-hero-sub" className="block text-xs font-medium text-[#6E5F54] mb-1">
              Hero Editorial Subheadline
            </label>
            <textarea
              id="cms-hero-sub"
              rows={3}
              required
              value={heroSubheadline}
              onChange={(e) => setHeroSubheadline(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>

          <div>
            <label htmlFor="cms-story-heading" className="block text-xs font-medium text-[#6E5F54] mb-1">
              Provenance Story Heading
            </label>
            <input
              id="cms-story-heading"
              required
              value={storyHeading}
              onChange={(e) => setStoryHeading(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F] disabled:opacity-50"
          >
            {busy ? 'Publishing...' : 'Publish CMS Changes'}
          </button>
        </form>
      )}

      {subtab === 'settings' && settings && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-6 bg-white border border-[#DFD3C0] p-6 space-y-4"
          >
            <h2 className="font-display text-2xl text-[#231B17]">Marketplace Commission & Checkout</h2>
            <div>
              <label htmlFor="set-comm" className="block text-xs font-medium text-[#231B17] mb-1">
                Artisan Platform Commission (%)
              </label>
              <input
                id="set-comm"
                type="number"
                min={0}
                max={40}
                value={settings.commissionPercent}
                onChange={(e) =>
                  setSettings({ ...settings, commissionPercent: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#231B17]">
              <input
                type="checkbox"
                checked={settings.codEnabled}
                onChange={(e) => setSettings({ ...settings, codEnabled: e.target.checked })}
                className="accent-[#6B1D2A]"
              />
              <span>Enable Cash on Delivery (COD) for dual-verified orders</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="set-cod-max" className="block text-xs font-medium text-[#231B17] mb-1">
                  COD Order Limit (₹)
                </label>
                <input
                  id="set-cod-max"
                  type="number"
                  value={settings.codMaxOrderInr}
                  onChange={(e) =>
                    setSettings({ ...settings, codMaxOrderInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
                />
              </div>
              <div>
                <label htmlFor="set-ship" className="block text-xs font-medium text-[#231B17] mb-1">
                  Free Shipping Threshold (₹)
                </label>
                <input
                  id="set-ship"
                  type="number"
                  value={settings.freeShippingThresholdInr}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      freeShippingThresholdInr: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
            >
              Save Platform Settings
            </button>
          </form>

          <div className="lg:col-span-6 space-y-5">
            <div className="bg-white border border-[#DFD3C0] p-6 space-y-3">
              <h3 className="font-display text-2xl text-[#231B17]">
                Concierge Inquiries ({inquiries.length})
              </h3>
              {inquiries.length === 0 ? (
                <p className="text-xs text-[#6E5F54]">No contact inquiries yet.</p>
              ) : (
                inquiries.map((inq) => (
                  <div key={inq.id} className="p-3 bg-[#FAF7F2] border border-[#DFD3C0] text-xs">
                    <p className="font-medium text-[#231B17]">
                      {inq.subject} — {inq.name} ({inq.email})
                    </p>
                    <p className="text-[#6E5F54] mt-1">{inq.message}</p>
                  </div>
                ))
              )}
            </div>
            <div className="bg-white border border-[#DFD3C0] p-6 space-y-2">
              <h3 className="font-display text-2xl text-[#231B17]">
                Newsletter Patrons ({subscribers.length})
              </h3>
              <p className="text-xs text-[#6E5F54] font-mono">
                {subscribers.map((s) => s.email).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {subtab === 'audit' && (
        <section className="bg-white border border-[#DFD3C0] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-[#231B17]">Immutable Security Audit Trail</h2>
              <p className="text-xs text-[#6E5F54]">
                Tracks OTP challenges, dual-verification blocks, KYC approvals, refunds, Razorpay signatures, and CMS edits.
              </p>
            </div>
            <select
              aria-label="Filter audit logs by outcome"
              value={auditFilter}
              onChange={(e) =>
                setAuditFilter(e.target.value as 'all' | 'success' | 'denied' | 'failure')
              }
              className="px-3 py-1.5 text-xs bg-[#FAF7F2] border border-[#DFD3C0]"
            >
              <option value="all">All Outcomes</option>
              <option value="success">Success</option>
              <option value="denied">Denied / Blocked</option>
              <option value="failure">Failure</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DFD3C0] text-[#6E5F54]">
                  <th className="py-2 pr-4 font-medium">Timestamp</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Actor</th>
                  <th className="py-2 pr-4 font-medium">Outcome</th>
                  <th className="py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFD3C0]/60">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4 font-mono text-[11px] text-[#6E5F54] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleTimeString('en-IN')}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[#231B17] whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 pr-4 text-[#6E5F54]">{log.actorEmail}</td>
                    <td
                      className={`py-2.5 pr-4 uppercase font-medium ${
                        log.outcome === 'success' ? 'text-[#231B17]' : 'text-[#6B1D2A]'
                      }`}
                    >
                      {log.outcome}
                    </td>
                    <td className="py-2.5 text-[#6E5F54]">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
