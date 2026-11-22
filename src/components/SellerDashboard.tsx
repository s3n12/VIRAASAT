import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { ALLOWED_ORDER_TRANSITIONS, formatInr } from '../lib/commerce';
import type {
  Order,
  OrderStatus,
  Product,
  ProductCategory,
  SellerAnalytics,
  UserProfile,
} from '../types/marketplace';

interface SellerDashboardProps {
  user: UserProfile;
  token: string;
  products: Product[];
  onRefreshProducts: () => Promise<void>;
}

const IMAGE_PRESETS = [
  { label: 'Banarasi Silk Saree', url: '/src/assets/images/product_banarasi_saree_1795263352424.jpg' },
  { label: 'Jaipur Polki Kundan', url: '/src/assets/images/product_jaipur_kundan_1795263347602.jpg' },
  { label: 'Kashmiri Pashmina Shawl', url: '/src/assets/images/product_kashmir_pashmina_1795263349876.jpg' },
  { label: 'Moradabad Brass Urli', url: '/src/assets/images/product_moradabad_brass_1795263348862.jpg' },
  { label: 'Jaipur Blue Pottery Urn', url: '/src/assets/images/product_jaipur_pottery_1795280637136.jpg' },
  { label: 'Kannauj Sandalwood Attar', url: '/src/assets/images/product_kannauj_attar_1795263351180.jpg' },
  { label: 'Kashmiri Saffron Wellness Set', url: '/src/assets/images/product_organic_wellness_1795280641213.jpg' },
];

const CATEGORIES: ProductCategory[] = [
  'Fashion & Ethnic Wear',
  'Fine Jewellery',
  'Kashmiri Shawls',
  'Handicrafts & Brass',
  'Home Decor & Pottery',
  'Natural Wellness & Organic',
];

export function SellerDashboard({
  user,
  token,
  products,
  onRefreshProducts,
}: SellerDashboardProps) {
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newProduct, setNewProduct] = useState({
    title: '',
    subtitle: '',
    description: '',
    category: 'Fashion & Ethnic Wear' as ProductCategory,
    subcategory: 'Handloom Edition',
    craftOrigin: user.craftRegion || 'Varanasi',
    priceInr: 42000,
    stock: 5,
    lowStockThreshold: 2,
    imageUrl: IMAGE_PRESETS[0].url,
    material: 'Pure Handloom Silk & Tested Zari',
    weightGrams: 650,
    dimensions: 'Standard Atelier Size',
    provenanceNote: 'GI-Certified Handloom Archive Edition',
    careInstructions: 'Dry clean only. Store in unbleached muslin.',
    craftTimeDays: 30,
  });

  const myProducts =
    user.role === 'admin'
      ? products
      : products.filter((p) => p.sellerId === user.id);

  const loadSellerData = async () => {
    try {
      const [anaRes, ordRes] = await Promise.all([
        apiRequest<{ analytics: SellerAnalytics }>('/api/analytics/seller', { token }),
        apiRequest<{ orders: Order[] }>('/api/orders?scope=seller', { token }),
      ]);
      setAnalytics(anaRes.analytics);
      setOrders(ordRes.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load atelier metrics.');
    }
  };

  useEffect(() => {
    void loadSellerData();
  }, [token]);

  useEffect(() => {
    const sMap: Record<string, number> = {};
    const pMap: Record<string, number> = {};
    for (const p of myProducts) {
      sMap[p.id] = p.stock;
      pMap[p.id] = p.priceInr;
    }
    setStockDrafts(sMap);
    setPriceDrafts(pMap);
  }, [products]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiRequest('/api/products', {
        method: 'POST',
        token,
        body: newProduct,
      });
      setNewProduct({ ...newProduct, title: '', subtitle: '', description: '' });
      await onRefreshProducts();
      await loadSellerData();
      setNotice('New heirloom listing published to the VIRAASAT catalogue.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create product.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveInventory = async (productId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/seller/inventory/${productId}`, {
        method: 'PATCH',
        token,
        body: {
          stock: Number(stockDrafts[productId] ?? 0),
          priceInr: Number(priceDrafts[productId] ?? 1000),
        },
      });
      await onRefreshProducts();
      await loadSellerData();
      setNotice('Vault stock and price updated and logged.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stock.');
    }
  };

  const handleArchiveProduct = async (productId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/products/${productId}`, { method: 'DELETE', token });
      await onRefreshProducts();
      await loadSellerData();
      setNotice('Listing archived from storefront.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive listing.');
    }
  };

  const handleAdvanceOrder = async (orderId: string, nextStatus: OrderStatus) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        token,
        body: {
          status: nextStatus,
          trackingNumber: trackingDrafts[orderId]?.trim() || undefined,
        },
      });
      await loadSellerData();
      setNotice(`Order status updated to ${nextStatus.toUpperCase()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance order.');
    }
  };

  return (
    <div className="space-y-10">
      {!user.sellerVerified && user.role === 'seller' && (
        <div className="p-4 bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 text-xs text-[#6B1D2A]">
          Your artisan atelier verification is pending Super Admin approval. Publishing privileges unlock upon KYC approval.
        </div>
      )}
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

      {/* Seller KPI & Payout Row */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-5 bg-white border border-[#DFD3C0]">
            <p className="text-xs text-[#6E5F54]">Gross Sales</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[#231B17] mt-1">
              {formatInr(analytics.totalRevenueInr)}
            </p>
          </div>
          <div className="p-5 bg-white border border-[#DFD3C0]">
            <p className="text-xs text-[#6E5F54]">Net Atelier Payout</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[#6B1D2A] mt-1">
              {formatInr(analytics.netPayoutInr)}
            </p>
            <p className="text-[11px] text-[#6E5F54] mt-0.5">
              After {analytics.commissionPercent}% curation fee
            </p>
          </div>
          <div className="p-5 bg-white border border-[#DFD3C0]">
            <p className="text-xs text-[#6E5F54]">Verified Orders</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[#231B17] mt-1">
              {analytics.totalOrders}
            </p>
          </div>
          <div className="p-5 bg-white border border-[#DFD3C0]">
            <p className="text-xs text-[#6E5F54]">Active Listings</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[#231B17] mt-1">
              {analytics.activeListings}
            </p>
          </div>
          <div className="p-5 bg-white border border-[#DFD3C0]">
            <p className="text-xs text-[#6E5F54]">Low Stock Alerts</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[#6B1D2A] mt-1">
              {analytics.lowStockCount}
            </p>
          </div>
        </div>
      )}

      {/* Inventory & Pricing Management */}
      <section className="bg-white border border-[#DFD3C0] p-6 space-y-4">
        <div>
          <h2 className="font-display text-2xl text-[#231B17]">Inventory & Vault Stock</h2>
          <p className="text-xs text-[#6E5F54]">
            Update available vault units, pricing, or archive editions from your atelier catalogue.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DFD3C0] text-[#6E5F54]">
                <th className="py-2.5 pr-4 font-medium">Piece</th>
                <th className="py-2.5 pr-4 font-medium">Status</th>
                <th className="py-2.5 pr-4 font-medium">Price (₹)</th>
                <th className="py-2.5 pr-4 font-medium">Vault Stock</th>
                <th className="py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFD3C0]/60">
              {myProducts.map((p) => {
                const low = p.stock <= p.lowStockThreshold;
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-[#231B17]">{p.title}</p>
                      <p className="text-[11px] text-[#6E5F54]">
                        {p.sku} · {p.craftOrigin} {low ? '· Low Stock' : ''}
                      </p>
                    </td>
                    <td className="py-3 pr-4 uppercase text-[#6E5F54]">{p.status}</td>
                    <td className="py-3 pr-4">
                      <input
                        aria-label={`Price for ${p.title}`}
                        type="number"
                        min={500}
                        value={priceDrafts[p.id] ?? p.priceInr}
                        onChange={(e) =>
                          setPriceDrafts({ ...priceDrafts, [p.id]: Number(e.target.value) })
                        }
                        className="w-24 px-2 py-1 font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        aria-label={`Stock for ${p.title}`}
                        type="number"
                        min={0}
                        max={10000}
                        value={stockDrafts[p.id] ?? p.stock}
                        onChange={(e) =>
                          setStockDrafts({
                            ...stockDrafts,
                            [p.id]: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-20 px-2 py-1 font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
                      />
                    </td>
                    <td className="py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSaveInventory(p.id)}
                        className="px-3 py-1.5 bg-[#231B17] text-[#FAF7F2] hover:bg-[#6B1D2A]"
                      >
                        Save
                      </button>
                      {p.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={() => handleArchiveProduct(p.id)}
                          className="px-3 py-1.5 border border-[#DFD3C0] text-[#6E5F54] hover:text-[#6B1D2A]"
                        >
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Order Fulfillment Queue with AWB Tracking */}
      <section className="bg-white border border-[#DFD3C0] p-6 space-y-4">
        <h2 className="font-display text-2xl text-[#231B17]">Order Fulfillment & Dispatch Queue</h2>
        {orders.length === 0 ? (
          <p className="text-xs text-[#6E5F54]">No orders assigned to your atelier yet.</p>
        ) : (
          <div className="space-y-4">
            {orders.map((ord) => {
              const nextStates = ALLOWED_ORDER_TRANSITIONS[ord.status].filter(
                (s) => s !== 'cancelled'
              );
              return (
                <div
                  key={ord.id}
                  className="p-4 border border-[#DFD3C0] bg-[#FAF7F2] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#231B17]">
                      {ord.orderNumber} · {ord.customerName}
                    </p>
                    <p className="text-xs text-[#6E5F54] mt-0.5">
                      {ord.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}
                    </p>
                    <p className="text-xs text-[#6B1D2A] mt-1">
                      Status: <strong className="uppercase">{ord.status}</strong> ·{' '}
                      <span className="font-mono tabular-nums">{formatInr(ord.totalInr)}</span>
                      {ord.trackingNumber && ` · AWB ${ord.trackingNumber}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {nextStates.includes('dispatched') && (
                      <input
                        aria-label={`Tracking number for ${ord.orderNumber}`}
                        placeholder="AWB Tracking #"
                        value={trackingDrafts[ord.id] || ''}
                        onChange={(e) =>
                          setTrackingDrafts({ ...trackingDrafts, [ord.id]: e.target.value })
                        }
                        className="px-2.5 py-1.5 text-xs font-mono bg-white border border-[#DFD3C0] w-36"
                      />
                    )}
                    {nextStates.length === 0 ? (
                      <span className="text-xs text-[#6E5F54]">Terminal State</span>
                    ) : (
                      nextStates.map((next) => (
                        <button
                          key={next}
                          type="button"
                          onClick={() => handleAdvanceOrder(ord.id, next)}
                          className="px-3.5 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] whitespace-nowrap"
                        >
                          Mark {next.charAt(0).toUpperCase() + next.slice(1)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Publish New Heirloom Listing */}
      <form
        onSubmit={handleCreateProduct}
        className="bg-[#F3ECE1]/60 border border-[#DFD3C0] p-6 space-y-4"
      >
        <h2 className="font-display text-2xl text-[#231B17]">Publish New Atelier Edition</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prod-title" className="block text-xs font-medium text-[#231B17] mb-1">
              Product Title
            </label>
            <input
              id="prod-title"
              required
              minLength={3}
              value={newProduct.title}
              onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })}
              placeholder="e.g. Chanderi Zari Tissue Organza Saree"
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="prod-subtitle" className="block text-xs font-medium text-[#231B17] mb-1">
              Material / Technique Subtitle
            </label>
            <input
              id="prod-subtitle"
              required
              value={newProduct.subtitle}
              onChange={(e) => setNewProduct({ ...newProduct, subtitle: e.target.value })}
              placeholder="e.g. Handwoven Pure Silk & Silver Zari"
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="prod-cat" className="block text-xs font-medium text-[#231B17] mb-1">
              Category
            </label>
            <select
              id="prod-cat"
              value={newProduct.category}
              onChange={(e) =>
                setNewProduct({ ...newProduct, category: e.target.value as ProductCategory })
              }
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="prod-origin" className="block text-xs font-medium text-[#231B17] mb-1">
              Craft Origin Cluster
            </label>
            <input
              id="prod-origin"
              required
              value={newProduct.craftOrigin}
              onChange={(e) => setNewProduct({ ...newProduct, craftOrigin: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="prod-price" className="block text-xs font-medium text-[#231B17] mb-1">
              Price (INR ₹)
            </label>
            <input
              id="prod-price"
              type="number"
              required
              min={500}
              value={newProduct.priceInr}
              onChange={(e) => setNewProduct({ ...newProduct, priceInr: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#DFD3C0]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prod-stock" className="block text-xs font-medium text-[#231B17] mb-1">
                Initial Stock
              </label>
              <input
                id="prod-stock"
                type="number"
                required
                min={0}
                value={newProduct.stock}
                onChange={(e) => setNewProduct({ ...newProduct, stock: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#DFD3C0]"
              />
            </div>
            <div>
              <label htmlFor="prod-image" className="block text-xs font-medium text-[#231B17] mb-1">
                Studio Photograph
              </label>
              <select
                id="prod-image"
                value={newProduct.imageUrl}
                onChange={(e) => setNewProduct({ ...newProduct, imageUrl: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
              >
                {IMAGE_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.url}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="prod-desc" className="block text-xs font-medium text-[#231B17] mb-1">
            Craftsmanship Description
          </label>
          <textarea
            id="prod-desc"
            required
            minLength={15}
            rows={3}
            value={newProduct.description}
            onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
            placeholder="Describe loom lineage, materials, and artisan hours..."
            className="w-full px-3 py-2 text-sm bg-white border border-[#DFD3C0]"
          />
        </div>

        <button
          type="submit"
          disabled={busy || (!user.sellerVerified && user.role === 'seller')}
          className="px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F] disabled:opacity-50"
        >
          {busy ? 'Publishing...' : 'Publish Heritage Edition'}
        </button>
      </form>
    </div>
  );
}
