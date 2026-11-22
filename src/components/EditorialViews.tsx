import type { CmsContent, Product } from '../types/marketplace';
import { HeritageImage } from './HeritageImage';

export function AteliersView({
  products,
  onSelectProduct,
}: {
  products: Product[];
  onSelectProduct: (product: Product) => void;
}) {
  const ateliers = [
    {
      name: 'Kashi Karkhana Looms',
      region: 'Madanpura, Varanasi · Est. 1894',
      master: 'Ustad Mehmood Ansari (5th Generation Weaver)',
      specialty: 'Kadwa Katan Silk, Sozni Cashmere Commissions, Copper-Still Attars',
      story:
        'Operating thirty-two heritage wooden pit looms, Kashi Karkhana preserves real zari weaving and botanical dyeing while sharing direct patronage royalties with master loom families.',
    },
    {
      name: 'Johari Haveli Jewels',
      region: 'Johari Bazaar, Jaipur · Est. 1912',
      master: 'Raghavendra Singh Johari',
      specialty: 'Syndicate Polki Kundan, Reverse Champlevé Meenakari, Sand-Cast Brassware',
      story:
        'Each bridal collar passes through four distinct guild hands—ghadhai goldsmith, chiteria engraver, meenakar enameller, and jadai foil setter—taking up to sixty days.',
    },
  ];

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-12 space-y-12">
      <div className="pb-8 border-b border-[#DFD3C0] max-w-2xl">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
          Partner Craft Houses
        </p>
        <h1 className="font-display text-4xl font-semibold text-[#231B17] mt-1">
          Master Ateliers of VIRAASAT
        </h1>
        <p className="text-sm text-[#6E5F54] mt-2 leading-relaxed">
          Every seller on VIRAASAT undergoes dual verification, craft cluster validation, and direct studio inspection prior to listing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {ateliers.map((atelier) => {
          const pieces = products.filter(
            (p) => p.atelierName === atelier.name && p.status === 'active'
          );
          return (
            <section
              key={atelier.name}
              className="p-8 bg-[#F3ECE1]/60 border border-[#DFD3C0] flex flex-col justify-between gap-6"
            >
              <div>
                <p className="text-xs text-[#A67C37]">{atelier.region}</p>
                <h2 className="font-display text-3xl text-[#231B17] mt-1">
                  {atelier.name}
                </h2>
                <p className="text-xs font-medium text-[#6B1D2A] mt-1">
                  {atelier.master}
                </p>
                <p className="text-sm text-[#6E5F54] mt-4 leading-relaxed">
                  {atelier.story}
                </p>
                <p className="text-xs text-[#231B17] mt-4 pt-4 border-t border-[#DFD3C0]">
                  <strong>Craft Disciplines:</strong> {atelier.specialty}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[#6E5F54]">
                  Current Archive Editions ({pieces.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {pieces.map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      onClick={() => onSelectProduct(piece)}
                      className="px-3 py-1.5 text-xs bg-white border border-[#DFD3C0] text-[#231B17] hover:border-[#6B1D2A] transition-colors"
                    >
                      {piece.title}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

export function JournalView({ cms }: { cms: CmsContent }) {
  return (
    <main className="max-w-[1280px] mx-auto px-6 py-12 space-y-10">
      <div className="pb-8 border-b border-[#DFD3C0] max-w-2xl">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">
          Editorial Monograph
        </p>
        <h1 className="font-display text-4xl font-semibold text-[#231B17] mt-1">
          The VIRAASAT Journal
        </h1>
        <p className="text-sm text-[#6E5F54] mt-2">
          Field dispatches from India’s living craft clusters, documenting loom lineages, metallurgy, and natural fragrance distillation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {cms.journalEntries.map((entry) => (
          <article
            key={entry.id}
            className="bg-white border border-[#DFD3C0] flex flex-col"
          >
            <div className="aspect-[4/3] overflow-hidden bg-[#F3ECE1]">
              <HeritageImage
                src={entry.imageUrl}
                alt={entry.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <div className="text-xs text-[#6E5F54] flex items-center gap-2">
                <span>{entry.region}</span>
                <span aria-hidden="true">·</span>
                <span>{entry.readTime}</span>
              </div>
              <h2 className="font-display text-2xl text-[#231B17] mt-2 leading-snug">
                {entry.title}
              </h2>
              <p className="text-sm text-[#6E5F54] mt-3 leading-relaxed">
                {entry.excerpt}
              </p>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
