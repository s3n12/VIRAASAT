import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { CmsContent, ProductCategory, UserProfile } from '../types/marketplace';

export type AppView =
  | 'home'
  | 'catalogue'
  | 'product'
  | 'ateliers'
  | 'journal'
  | 'about'
  | 'seller-register'
  | 'contact'
  | 'faq'
  | 'privacy'
  | 'terms'
  | 'returns'
  | 'shipping'
  | 'checkout'
  | 'dashboard';

interface HeaderProps {
  activeView: AppView;
  onNavigate: (view: AppView, category?: ProductCategory | 'All') => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  user: UserProfile | null;
  announcement: CmsContent['announcement'];
}

export function Header({
  activeView,
  onNavigate,
  cartCount,
  onOpenCart,
  onOpenAuth,
  user,
  announcement,
}: HeaderProps) {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { label: string; view: AppView | 'cart' }[] = [
    { label: 'Home', view: 'home' },
    { label: 'Shop', view: 'catalogue' },
    { label: 'Ateliers', view: 'ateliers' },
    { label: 'Stories', view: 'journal' },
    { label: cartCount > 0 ? `Bag (${cartCount})` : 'Bag', view: 'cart' },
  ];

  const handleLinkClick = (target: AppView | 'cart', category?: ProductCategory | 'All') => {
    setMobileMenuOpen(false);
    if (target === 'cart') {
      onOpenCart();
    } else {
      onNavigate(target, category);
    }
  };

  return (
    <div className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#DFD3C0]">
      {announcement.enabled && !bannerDismissed && (
        <div className="bg-[#6B1D2A] text-[#FAF7F2] text-xs px-4 py-2 flex items-center justify-between gap-4">
          <div className="w-5 shrink-0 hidden sm:block" aria-hidden="true" />
          <p className="text-center truncate font-normal tracking-wide">
            {announcement.text}
          </p>
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={() => setBannerDismissed(true)}
            className="text-[#FAF7F2]/80 hover:text-[#FAF7F2] p-0.5 shrink-0"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <header className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('home');
          }}
          className="font-display text-2xl font-semibold tracking-[0.18em] text-[#231B17] whitespace-nowrap shrink-0"
        >
          VIRAASAT
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#6E5F54]"
        >
          {navItems.map((item) => {
            const isActive = item.view !== 'cart' && activeView === item.view;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleLinkClick(item.view, item.view === 'catalogue' ? 'All' : undefined)}
                className={`whitespace-nowrap shrink-0 py-1 border-b transition-colors ${
                  isActive
                    ? 'text-[#6B1D2A] border-[#6B1D2A]'
                    : 'border-transparent hover:text-[#231B17] hover:border-[#A67C37]/50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] transition-colors whitespace-nowrap shrink-0"
            >
              {user.role === 'admin'
                ? 'Admin Console'
                : user.role === 'seller'
                  ? 'Atelier Studio'
                  : 'My Account'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 text-[#231B17] hover:text-[#6B1D2A]"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-[#DFD3C0] bg-[#FAF7F2] px-6 py-4 flex flex-col gap-2.5"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleLinkClick(item.view, item.view === 'catalogue' ? 'All' : undefined)}
              className="text-left py-2 text-sm font-medium text-[#231B17] hover:text-[#6B1D2A] border-b border-[#DFD3C0]/50"
            >
              {item.label}
            </button>
          ))}
          <div className="pt-2 grid grid-cols-2 gap-2 text-xs text-[#6E5F54]">
            <button type="button" onClick={() => handleLinkClick('about')} className="text-left py-1 hover:text-[#6B1D2A]">
              About Us
            </button>
            <button type="button" onClick={() => handleLinkClick('seller-register')} className="text-left py-1 hover:text-[#6B1D2A]">
              Become an Artisan
            </button>
            <button type="button" onClick={() => handleLinkClick('faq')} className="text-left py-1 hover:text-[#6B1D2A]">
              FAQ
            </button>
            <button type="button" onClick={() => handleLinkClick('contact')} className="text-left py-1 hover:text-[#6B1D2A]">
              Contact Concierge
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
