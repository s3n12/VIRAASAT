import React, { Component, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AuraLink, useAuraRouter } from '../../lib/router';
import type { AuraProfile } from '../../types/aura';

export function EditorialImage({
  src,
  alt,
  className = '',
  priority = false,
  fallbackTitle,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
  fallbackTitle?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-[#EAE4DA] text-[#574F46] p-6 text-center ${className}`}
      >
        <span className="font-serif text-lg italic tracking-wide">{fallbackTitle || 'AURA'}</span>
        <span className="mt-1 text-xs text-[#7D7368]">Editorial Archive</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={className}
    />
  );
}

export class AuraErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'An unexpected rendering issue occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6 py-20 bg-[#FAF7F2]">
          <div className="max-w-md text-center space-y-4">
            <h2 className="font-serif text-3xl text-[#1C1917]">Something paused unexpectedly</h2>
            <p className="text-sm text-[#574F46] leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="px-5 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap"
            >
              Return to Discover
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function StoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="space-y-4 animate-pulse">
          <div className="aspect-[4/3] w-full rounded-xl bg-[#EAE4DA]" />
          <div className="h-3 w-32 rounded bg-[#EAE4DA]" />
          <div className="h-7 w-4/5 rounded bg-[#EAE4DA]" />
          <div className="h-4 w-full rounded bg-[#EAE4DA]" />
        </div>
      ))}
    </div>
  );
}

export function StoryReaderSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-8 animate-pulse" aria-busy="true">
      <div className="h-4 w-48 rounded bg-[#EAE4DA]" />
      <div className="h-14 w-3/4 rounded bg-[#EAE4DA]" />
      <div className="aspect-[16/9] w-full rounded-2xl bg-[#EAE4DA]" />
      <div className="space-y-3 max-w-2xl">
        <div className="h-4 w-full rounded bg-[#EAE4DA]" />
        <div className="h-4 w-11/12 rounded bg-[#EAE4DA]" />
        <div className="h-4 w-4/5 rounded bg-[#EAE4DA]" />
      </div>
    </div>
  );
}

export function EditorialEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-20 px-6 text-center max-w-lg mx-auto">
      <h3 className="font-serif text-3xl text-[#1C1917]">{title}</h3>
      <p className="mt-3 text-sm text-[#574F46] leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 px-5 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Strict 3-zone Top Bar Contract:
 * [Single wordmark] — [5 concise single-line nav links] — [1 primary action]
 */
export function TopNav({
  user,
  transparent = false,
}: {
  user: AuraProfile | null;
  transparent?: boolean;
}) {
  const { pathname, navigate } = useAuraRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: 'Discover', to: '/discover', match: (p: string) => p === '/' || p === '/discover' },
    { label: 'Categories', to: '/category/home-and-living', match: (p: string) => p.startsWith('/category') },
    { label: 'Universe', to: '/collections', match: (p: string) => p.startsWith('/collections') },
    { label: 'AI Studio', to: '/ai-studio', match: (p: string) => p === '/ai-studio' },
    { label: 'Moodboards', to: '/moodboards', match: (p: string) => p.startsWith('/moodboards') },
  ];

  const headerClass = transparent
    ? 'fixed top-0 inset-x-0 z-40 bg-[#FAF7F2]/85 backdrop-blur-md border-b border-[#DDD5C7]/70'
    : 'sticky top-0 z-40 bg-[#FAF7F2]/92 backdrop-blur-md border-b border-[#DDD5C7]';

  return (
    <header className={headerClass}>
      <div className="max-w-[1380px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single wordmark */}
        <AuraLink
          to="/"
          className="font-serif text-2xl tracking-[0.22em] font-medium text-[#1C1917] whitespace-nowrap shrink-0"
        >
          AURA
        </AuraLink>

        {/* Zone 2: 5 concise single-line text links */}
        <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-sm text-[#574F46]">
          {navLinks.map((item) => {
            const active = item.match(pathname);
            return (
              <AuraLink
                key={item.to}
                to={item.to}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b ${
                  active
                    ? 'text-[#1C1917] border-[#1C1917] font-medium'
                    : 'border-transparent hover:text-[#1C1917] hover:border-[#7D7368]'
                }`}
              >
                {item.label}
              </AuraLink>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action (desktop) + mobile menu trigger */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap shrink-0 max-w-[160px] truncate"
            >
              {user.displayName}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/auth/sign-in')}
              className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] transition-colors whitespace-nowrap shrink-0"
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 text-[#1C1917] rounded-lg hover:bg-[#EAE4DA] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#DDD5C7] bg-[#FAF7F2] px-6 py-5 space-y-3">
          {navLinks.map((item) => (
            <AuraLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-base font-medium text-[#1C1917] border-b border-[#EAE4DA]"
            >
              {item.label}
            </AuraLink>
          ))}
          <AuraLink
            to="/search"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-base text-[#574F46] border-b border-[#EAE4DA]"
          >
            Search Archive
          </AuraLink>
          <AuraLink
            to="/zen"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-base text-[#574F46] border-b border-[#EAE4DA]"
          >
            Zen Mode
          </AuraLink>
          {user && (
            <AuraLink
              to="/settings"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-base text-[#574F46] border-b border-[#EAE4DA]"
            >
              Settings
            </AuraLink>
          )}
          {user?.role === 'admin' && (
            <AuraLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-base text-[#8C6A43] font-medium"
            >
              Admin Content Studio
            </AuraLink>
          )}
        </div>
      )}
    </header>
  );
}

export function AuraFooter({ user }: { user: AuraProfile | null }) {
  return (
    <footer className="border-t border-[#DDD5C7] bg-[#F3EFE8] mt-24">
      <div className="max-w-[1380px] mx-auto px-6 sm:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2 space-y-3">
          <p className="font-serif text-2xl tracking-[0.22em] text-[#1C1917]">AURA</p>
          <p className="text-sm text-[#574F46] max-w-sm leading-relaxed">
            Discover your world. One vibe at a time. A quiet digital magazine and personal curation studio.
          </p>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-medium text-[#1C1917]">Explore</p>
          <div className="flex flex-col gap-2 text-[#574F46]">
            <AuraLink to="/discover" className="hover:text-[#1C1917] transition-colors">Discover</AuraLink>
            <AuraLink to="/search" className="hover:text-[#1C1917] transition-colors">Search Stories</AuraLink>
            <AuraLink to="/ai-studio" className="hover:text-[#1C1917] transition-colors">AI Aura Assistant</AuraLink>
            <AuraLink to="/zen" className="hover:text-[#1C1917] transition-colors">Zen Mode</AuraLink>
          </div>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-medium text-[#1C1917]">Universe</p>
          <div className="flex flex-col gap-2 text-[#574F46]">
            <AuraLink to="/collections" className="hover:text-[#1C1917] transition-colors">Personal Collections</AuraLink>
            <AuraLink to="/moodboards" className="hover:text-[#1C1917] transition-colors">Moodboard Studio</AuraLink>
            <AuraLink to={user ? '/profile' : '/auth/sign-in'} className="hover:text-[#1C1917] transition-colors">
              {user ? 'Profile & Preferences' : 'Sign In / Create Account'}
            </AuraLink>
            <AuraLink to="/admin" className="hover:text-[#1C1917] transition-colors">Editorial Studio</AuraLink>
          </div>
        </div>
      </div>

      <div className="border-t border-[#DDD5C7] py-5 px-6 sm:px-8 max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7D7368]">
        <span>© {new Date().getFullYear()} AURA Editorial Studio</span>
        <span>Curated photography · Mood discovery · Powered by Supabase & Gemini</span>
      </div>
    </footer>
  );
}
