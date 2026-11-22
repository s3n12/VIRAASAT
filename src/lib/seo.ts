import type { Product } from '../types/marketplace';
import { getEffectiveProductPrice } from './commerce';

interface SeoMetaInput {
  title: string;
  description: string;
  path?: string;
  product?: Product | null;
  breadcrumbs?: { name: string; path: string }[];
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function upsertJsonLd(id: string, payload: Record<string, unknown> | null) {
  const existing = document.getElementById(id);
  if (!payload) {
    existing?.remove();
    return;
  }
  const script = existing || document.createElement('script');
  script.id = id;
  script.setAttribute('type', 'application/ld+json');
  script.textContent = JSON.stringify(payload);
  if (!existing) {
    document.head.appendChild(script);
  }
}

export function applySeoMetadata({
  title,
  description,
  path = '/',
  product,
  breadcrumbs,
}: SeoMetaInput) {
  const origin = window.location.origin;
  const canonicalUrl = `${origin}${path.startsWith('/') ? path : `/${path}`}`;

  document.title = title;
  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', canonicalUrl);
  upsertMeta('property', 'og:site_name', 'VIRAASAT');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertCanonical(canonicalUrl);

  upsertJsonLd('viraasat-org-jsonld', {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'VIRAASAT',
    url: origin,
    description:
      'Luxury Indian heritage lifestyle and artisan marketplace connecting patrons directly with GI-certified master craft houses.',
    sameAs: [],
  });

  if (product) {
    upsertJsonLd('viraasat-product-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      sku: product.sku,
      description: product.description,
      image: `${origin}${product.imageUrl}`,
      brand: {
        '@type': 'Brand',
        name: product.atelierName,
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: getEffectiveProductPrice(product),
        availability:
          product.stock > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        url: canonicalUrl,
      },
      ...(product.reviewCount > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: product.ratingAvg,
              reviewCount: product.reviewCount,
            },
          }
        : {}),
    });
  } else {
    upsertJsonLd('viraasat-product-jsonld', null);
  }

  if (breadcrumbs && breadcrumbs.length > 0) {
    upsertJsonLd('viraasat-breadcrumb-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: crumb.name,
        item: `${origin}${crumb.path}`,
      })),
    });
  } else {
    upsertJsonLd('viraasat-breadcrumb-jsonld', null);
  }
}
