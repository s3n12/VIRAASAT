import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { calculateCartTotals, formatInr } from '../lib/commerce';
import type { CartItem } from '../types/marketplace';
import { HeritageImage } from './HeritageImage';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: string, variantLabel: string, qty: number) => void;
  onProceedCheckout: () => void;
  onBrowseCatalogue: () => void;
}

export function CartDrawer({
  open,
  onClose,
  items,
  onUpdateQty,
  onProceedCheckout,
  onBrowseCatalogue,
}: CartDrawerProps) {
  if (!open) return null;

  const totals = calculateCartTotals(items);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#231B17]/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Bag"
    >
      <div className="w-full max-w-md bg-[#FAF7F2] h-full flex flex-col border-l border-[#DFD3C0] shadow-2xl">
        <div className="px-6 py-5 border-b border-[#DFD3C0] flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-[#231B17]">Acquisition Bag</h2>
            <p className="text-xs text-[#6E5F54] mt-0.5 tabular-nums">
              {items.reduce((s, i) => s + i.quantity, 0)} curated piece(s)
            </p>
          </div>
          <button
            type="button"
            aria-label="Close shopping bag"
            onClick={onClose}
            className="p-2 text-[#6E5F54] hover:text-[#231B17]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-8 h-8 text-[#A67C37] mb-3" aria-hidden="true" />
              <p className="font-display text-2xl text-[#231B17] mb-2">
                Your bag is currently empty
              </p>
              <p className="text-sm text-[#6E5F54] max-w-xs mb-6">
                Explore handloom silks, Jaipur polki jewellery, and Moradabad brassware crafted by master ateliers.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBrowseCatalogue();
                }}
                className="px-5 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] transition-colors"
              >
                Explore Catalogue
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.productId}-${item.variantLabel}`}
                className="flex gap-4 pb-5 border-b border-[#DFD3C0]"
              >
                <HeritageImage
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-20 h-20 object-cover shrink-0 bg-[#F3ECE1]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#6E5F54] truncate">
                    {item.craftOrigin} · {item.atelierName}
                  </p>
                  <h3 className="font-display text-lg text-[#231B17] leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#6E5F54] mt-0.5 truncate">
                    {item.variantLabel}
                  </p>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center border border-[#DFD3C0] bg-[#FAF7F2]">
                      <button
                        type="button"
                        aria-label={`Decrease quantity for ${item.title}`}
                        onClick={() =>
                          onUpdateQty(item.productId, item.variantLabel, item.quantity - 1)
                        }
                        className="p-1.5 text-[#231B17] hover:bg-[#F3ECE1]"
                      >
                        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <span className="px-3 text-xs font-mono tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity for ${item.title}`}
                        disabled={item.quantity >= item.stock}
                        onClick={() =>
                          onUpdateQty(item.productId, item.variantLabel, item.quantity + 1)
                        }
                        className="p-1.5 text-[#231B17] hover:bg-[#F3ECE1] disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium font-mono tabular-nums text-[#231B17]">
                        {formatInr(item.unitPriceInr * item.quantity)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.title} from bag`}
                        onClick={() => onUpdateQty(item.productId, item.variantLabel, 0)}
                        className="text-[#6E5F54] hover:text-[#6B1D2A] p-1"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-[#DFD3C0] bg-[#F3ECE1]/60 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#6E5F54]">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums text-[#231B17]">
                  {formatInr(totals.subtotalInr)}
                </span>
              </div>
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
              <div className="flex justify-between pt-2 border-t border-[#DFD3C0] text-base font-semibold text-[#231B17]">
                <span>Estimated Total</span>
                <span className="font-mono tabular-nums">{formatInr(totals.totalInr)}</span>
              </div>
            </div>

            {totals.freeShippingRemainingInr > 0 && (
              <p className="text-xs text-[#6E5F54]">
                Add {formatInr(totals.freeShippingRemainingInr)} more for complimentary insured vault courier.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onProceedCheckout();
              }}
              className="w-full py-3 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] transition-colors"
            >
              Proceed to Verified Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
