import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface RouteMatch {
  pathname: string;
  search: string;
  query: URLSearchParams;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouteMatch | null>(null);

export function AuraRouterProvider({ children }: { children: React.ReactNode }) {
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
  }));

  useEffect(() => {
    const onPopState = () => {
      setLocationState({
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const url = new URL(to, window.location.origin);
    if (options?.replace) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    } else {
      window.history.pushState({}, '', `${url.pathname}${url.search}`);
    }
    setLocationState({ pathname: url.pathname, search: url.search });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const value = useMemo<RouteMatch>(
    () => ({
      pathname: locationState.pathname,
      search: locationState.search,
      query: new URLSearchParams(locationState.search),
      navigate,
    }),
    [locationState, navigate]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useAuraRouter(): RouteMatch {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useAuraRouter must be used inside AuraRouterProvider');
  }
  return ctx;
}

export function AuraLink({
  to,
  children,
  className = '',
  onClick,
  ariaLabel,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const { navigate } = useAuraRouter();
  return (
    <a
      href={to}
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function updateDocumentSeo(title: string, description?: string) {
  document.title = title;
  if (description) {
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', description);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
  }
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
}
