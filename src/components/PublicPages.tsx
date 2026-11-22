import { useState } from 'react';
import { CheckCircle2, ChevronDown, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { ProductCategory } from '../types/marketplace';

const CATEGORIES: ProductCategory[] = [
  'Fashion & Ethnic Wear',
  'Fine Jewellery',
  'Kashmiri Shawls',
  'Handicrafts & Brass',
  'Home Decor & Pottery',
  'Natural Wellness & Organic',
];

export function AboutView({
  onExploreCatalogue,
  onBecomeSeller,
}: {
  onExploreCatalogue: () => void;
  onBecomeSeller: () => void;
}) {
  return (
    <main className="max-w-[1280px] mx-auto px-6 py-14 space-y-14">
      <section className="max-w-3xl space-y-4 pb-8 border-b border-[#DFD3C0]">
        <p className="text-xs text-[#A67C37] tracking-[0.16em] uppercase">Our Manifesto</p>
        <h1 className="font-display text-4xl sm:text-5xl text-[#231B17] leading-tight">
          Sustaining India’s Living Craft Houses Through Direct Patronage
        </h1>
        <p className="text-base text-[#6E5F54] leading-relaxed">
          VIRAASAT was founded to eliminate opaque intermediaries between India’s generational craft families and discerning collectors. Every textile, Kundan collar, quartz-glazed urn, brass vessel, and botanical attar is catalogued with its exact karkhana, artisan hours, and GI provenance.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <article className="p-7 bg-white border border-[#DFD3C0] space-y-3">
          <p className="font-mono text-xs text-[#A67C37]">01 · DIRECT EQUITY</p>
          <h2 className="font-display text-2xl text-[#231B17]">88% Directly to the Atelier</h2>
          <p className="text-sm text-[#6E5F54] leading-relaxed">
            Our transparent 12% platform curation fee funds insured logistics, gemological/handloom verification, and cryptographic settlement—leaving the overwhelming majority of value with the craft house.
          </p>
        </article>
        <article className="p-7 bg-white border border-[#DFD3C0] space-y-3">
          <p className="font-mono text-xs text-[#A67C37]">02 · PROVENANCE</p>
          <h2 className="font-display text-2xl text-[#231B17]">GI-Tagged Craft Clusters</h2>
          <p className="text-sm text-[#6E5F54] leading-relaxed">
            From Madanpura pit looms in Varanasi to Johari Bazaar in Jaipur, Srinagar’s Sozni needlework guilds, Moradabad’s brass foundries, and Kannauj’s wood-fired copper stills.
          </p>
        </article>
        <article className="p-7 bg-white border border-[#DFD3C0] space-y-3">
          <p className="font-mono text-xs text-[#A67C37]">03 · TRUST & SECURITY</p>
          <h2 className="font-display text-2xl text-[#231B17]">Dual-Verified Commerce</h2>
          <p className="text-sm text-[#6E5F54] leading-relaxed">
            High-value heritage acquisitions demand bank-grade assurance: both email and mobile phone OTP verification are enforced server-side before checkout, alongside HMAC-SHA256 verified Razorpay settlement.
          </p>
        </article>
      </section>

      <section className="p-8 bg-[#F3ECE1] border border-[#DFD3C0] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="font-display text-3xl text-[#231B17]">
            Explore the Archive or Partner Your Atelier
          </h2>
          <p className="text-sm text-[#6E5F54] mt-1">
            Discover numbered pieces or apply to join our vetted artisan collective.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            type="button"
            onClick={onExploreCatalogue}
            className="px-6 py-3 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F]"
          >
            Browse Catalogue
          </button>
          <button
            type="button"
            onClick={onBecomeSeller}
            className="px-6 py-3 border border-[#DFD3C0] bg-white text-[#231B17] text-xs font-medium hover:border-[#6B1D2A]"
          >
            Apply as an Artisan
          </button>
        </div>
      </section>
    </main>
  );
}

export function SellerRegistrationView() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '+91',
    businessName: '',
    businessAddress: '',
    craftRegion: 'Varanasi',
    primaryCategory: 'Fashion & Ethnic Wear' as ProductCategory,
    gstin: '',
    panNumber: '',
    bankAccountNumber: '',
    ifscCode: '',
    identityDocType: 'GI Craft Certificate' as
      | 'Aadhaar / Artisan Card'
      | 'GI Craft Certificate'
      | 'Passport / PAN',
    identityDocRef: '',
    portfolioSummary: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; application: { id: string } }>(
        '/api/sellers/apply',
        {
          method: 'POST',
          body: {
            ...form,
            panNumber: form.panNumber.trim().toUpperCase(),
            ifscCode: form.ifscCode.trim().toUpperCase(),
            gstin: form.gstin.trim() || undefined,
          },
        }
      );
      setSubmittedId(res.application.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit artisan application.');
    } finally {
      setBusy(false);
    }
  };

  if (submittedId) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white border border-[#DFD3C0] p-10 space-y-5">
          <CheckCircle2 className="w-8 h-8 text-[#6B1D2A]" aria-hidden="true" />
          <p className="text-xs text-[#A67C37] tracking-widest uppercase">
            Application Logged · Reference {submittedId}
          </p>
          <h1 className="font-display text-3xl text-[#231B17]">
            Atelier Onboarding Dossier Submitted
          </h1>
          <p className="text-sm text-[#6E5F54] leading-relaxed">
            Thank you, <strong>{form.fullName}</strong>. Your KYC credentials and craft portfolio for{' '}
            <strong>{form.businessName}</strong> are now queued for Super Admin approval. Once approved, your seller dashboard and product publishing privileges will unlock automatically.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="pb-6 border-b border-[#DFD3C0]">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Artisan Onboarding</p>
        <h1 className="font-display text-4xl text-[#231B17] mt-1">
          Register Your Craft House on VIRAASAT
        </h1>
        <p className="text-sm text-[#6E5F54] mt-1">
          Every artisan seller undergoes KYC verification and Super Admin approval before listing heirloom pieces.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3.5 text-xs bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 text-[#6B1D2A]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-[#DFD3C0] p-7 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sel-name" className="block text-xs font-medium text-[#231B17] mb-1">
              Master Artisan / Founder Full Name
            </label>
            <input
              id="sel-name"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-biz" className="block text-xs font-medium text-[#231B17] mb-1">
              Atelier / Business Name
            </label>
            <input
              id="sel-biz"
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              placeholder="e.g. Maheshwar Handloom Guild"
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-email" className="block text-xs font-medium text-[#231B17] mb-1">
              Official Email Address
            </label>
            <input
              id="sel-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-phone" className="block text-xs font-medium text-[#231B17] mb-1">
              Mobile Number (with +91)
            </label>
            <input
              id="sel-phone"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3.5 py-2 text-sm font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-region" className="block text-xs font-medium text-[#231B17] mb-1">
              Craft Cluster / City
            </label>
            <input
              id="sel-region"
              required
              value={form.craftRegion}
              onChange={(e) => setForm({ ...form, craftRegion: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-cat" className="block text-xs font-medium text-[#231B17] mb-1">
              Primary Craft Category
            </label>
            <select
              id="sel-cat"
              value={form.primaryCategory}
              onChange={(e) =>
                setForm({ ...form, primaryCategory: e.target.value as ProductCategory })
              }
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="sel-addr" className="block text-xs font-medium text-[#231B17] mb-1">
            Registered Workshop / Business Address
          </label>
          <input
            id="sel-addr"
            required
            value={form.businessAddress}
            onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
            className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
          />
        </div>

        <div className="pt-4 border-t border-[#DFD3C0] grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sel-pan" className="block text-xs font-medium text-[#231B17] mb-1">
              PAN Number (Required for Indian Payouts)
            </label>
            <input
              id="sel-pan"
              required
              maxLength={10}
              placeholder="AABCV1234M"
              value={form.panNumber}
              onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })}
              className="w-full px-3.5 py-2 text-sm font-mono uppercase bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-gst" className="block text-xs font-medium text-[#231B17] mb-1">
              GSTIN (Optional for Exempt Handloom Artisans)
            </label>
            <input
              id="sel-gst"
              maxLength={15}
              placeholder="24AABCV1234M1Z5"
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              className="w-full px-3.5 py-2 text-sm font-mono uppercase bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-bank" className="block text-xs font-medium text-[#231B17] mb-1">
              Settlement Bank Account Number (only last 4 digits stored)
            </label>
            <input
              id="sel-bank"
              required
              value={form.bankAccountNumber}
              onChange={(e) =>
                setForm({ ...form, bankAccountNumber: e.target.value.replace(/\D/g, '') })
              }
              placeholder="918273645501"
              className="w-full px-3.5 py-2 text-sm font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-ifsc" className="block text-xs font-medium text-[#231B17] mb-1">
              Bank IFSC Code
            </label>
            <input
              id="sel-ifsc"
              required
              maxLength={11}
              placeholder="SBIN0000334"
              value={form.ifscCode}
              onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
              className="w-full px-3.5 py-2 text-sm font-mono uppercase bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="sel-doctype" className="block text-xs font-medium text-[#231B17] mb-1">
              Identity / Craft Verification Document
            </label>
            <select
              id="sel-doctype"
              value={form.identityDocType}
              onChange={(e) =>
                setForm({
                  ...form,
                  identityDocType: e.target.value as typeof form.identityDocType,
                })
              }
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            >
              <option value="GI Craft Certificate">GI Craft Certificate</option>
              <option value="Aadhaar / Artisan Card">Aadhaar / Artisan Pahchan Card</option>
              <option value="Passport / PAN">Passport / PAN Verification</option>
            </select>
          </div>
          <div>
            <label htmlFor="sel-docref" className="block text-xs font-medium text-[#231B17] mb-1">
              Certificate / Document Reference ID
            </label>
            <input
              id="sel-docref"
              required
              placeholder="GI-VNS-2026-441"
              value={form.identityDocRef}
              onChange={(e) => setForm({ ...form, identityDocRef: e.target.value })}
              className="w-full px-3.5 py-2 text-sm font-mono bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sel-port" className="block text-xs font-medium text-[#231B17] mb-1">
            Craft Lineage & Workshop Summary
          </label>
          <textarea
            id="sel-port"
            required
            minLength={20}
            rows={4}
            value={form.portfolioSummary}
            onChange={(e) => setForm({ ...form, portfolioSummary: e.target.value })}
            placeholder="Tell our Curatorial Council about your craft lineage, materials, and artisan team..."
            className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
          />
        </div>

        <div className="p-3.5 bg-[#F3ECE1]/70 border border-[#DFD3C0] text-xs text-[#6E5F54] flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#A67C37] shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            For your security, full bank account numbers are tokenized immediately and only the last four digits are retained in your onboarding dossier.
          </p>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="px-7 py-3 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F] disabled:opacity-50"
        >
          {busy ? 'Submitting Onboarding Dossier...' : 'Submit Artisan Application'}
        </button>
      </form>
    </main>
  );
}

export function ContactView() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/contact', {
        method: 'POST',
        body: { name, email, subject, message },
      });
      setNotice(res.message);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send inquiry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
      <div className="lg:col-span-5 space-y-5">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Curatorial Concierge</p>
        <h1 className="font-display text-4xl text-[#231B17]">Contact VIRAASAT</h1>
        <p className="text-sm text-[#6E5F54] leading-relaxed">
          For bespoke commissions, bridal trousseau curation, museum acquisitions, or insured shipping inquiries, write to our New Delhi & Varanasi concierge desk.
        </p>
        <div className="pt-4 border-t border-[#DFD3C0] space-y-2 text-xs text-[#6E5F54]">
          <p className="font-semibold text-[#231B17]">Curatorial Salon</p>
          <p>14 Prithviraj Road, New Delhi 110011</p>
          <p>concierge@viraasat.in · +91 11 4088 9200</p>
          <p>Monday – Saturday, 10:00 AM – 7:00 PM IST</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 bg-white border border-[#DFD3C0] p-7 space-y-4"
      >
        {error && (
          <div role="alert" className="p-3 text-xs bg-[#6B1D2A]/10 text-[#6B1D2A]">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 text-xs bg-[#A67C37]/10 border border-[#A67C37]/30 text-[#231B17]">
            {notice}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="c-name" className="block text-xs font-medium text-[#231B17] mb-1">
              Full Name
            </label>
            <input
              id="c-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
          <div>
            <label htmlFor="c-email" className="block text-xs font-medium text-[#231B17] mb-1">
              Email Address
            </label>
            <input
              id="c-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
            />
          </div>
        </div>
        <div>
          <label htmlFor="c-sub" className="block text-xs font-medium text-[#231B17] mb-1">
            Subject
          </label>
          <input
            id="c-sub"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Private Bridal Consultation or Order Support"
            className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
          />
        </div>
        <div>
          <label htmlFor="c-msg" className="block text-xs font-medium text-[#231B17] mb-1">
            Message
          </label>
          <textarea
            id="c-msg"
            required
            minLength={10}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0]"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-xs font-medium hover:bg-[#52141F] disabled:opacity-50"
        >
          {busy ? 'Sending...' : 'Send Concierge Inquiry'}
        </button>
      </form>
    </main>
  );
}

const FAQ_ITEMS = [
  {
    q: 'Why does VIRAASAT require both Email OTP and Phone OTP verification?',
    a: 'Because heirloom silks, 22K Polki jewellery, and numbered craft editions require insured vault delivery and strict fraud prevention, both your email address and mobile number must be verified via 6-digit OTP before checkout or sensitive account changes.',
  },
  {
    q: 'How are artisan authenticity and GI tags verified?',
    a: 'Every atelier is vetted by our Curatorial Council prior to onboarding. Pieces ship with signed karkhana provenance cards, BIS hallmarks for 22K gold jewellery, and Craft Development Institute or Handloom Mark certifications where applicable.',
  },
  {
    q: 'Which payment methods are accepted?',
    a: 'We accept UPI, Credit/Debit Cards, and NetBanking through HMAC-SHA256 verified Razorpay checkout, as well as Cash on Delivery (COD) for eligible orders up to ₹50,000 when enabled.',
  },
  {
    q: 'How do returns and refunds work?',
    a: 'Unworn, sealed heritage acquisitions may be requested for return directly from your Patron Dashboard within 7 days of delivery. Approved refunds are processed back to your original payment method and logged in our audit trail.',
  },
];

export function FaqView() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div className="pb-6 border-b border-[#DFD3C0]">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">Patron Guidance</p>
        <h1 className="font-display text-4xl text-[#231B17] mt-1">Frequently Asked Questions</h1>
      </div>
      <div className="divide-y divide-[#DFD3C0] border-y border-[#DFD3C0]">
        {FAQ_ITEMS.map((item, idx) => {
          const open = openIdx === idx;
          return (
            <div key={item.q} className="py-5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenIdx(open ? null : idx)}
                className="w-full flex items-center justify-between gap-4 text-left"
              >
                <span className="font-display text-xl text-[#231B17]">{item.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#6E5F54] shrink-0 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
              {open && (
                <p className="text-sm text-[#6E5F54] mt-3 leading-relaxed">{item.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

const POLICY_COPY = {
  privacy: {
    kicker: 'Governance & Data Protection',
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Data Minimization & PII Isolation',
        body: 'VIRAASAT collects only the personal information required to authenticate patrons via dual Email and Phone OTP, deliver insured orders, and comply with Indian GST invoicing. We never store raw payment card details.',
      },
      {
        heading: 'Cryptographic Verification & Session Hygiene',
        body: 'One-time passcodes are stored exclusively as HMAC-SHA256 digests with a strict 5-minute TTL and 5-attempt lock. Authentication sessions are signed server-side and immediately revocable upon logout.',
      },
    ],
  },
  terms: {
    kicker: 'Marketplace Agreement',
    title: 'Terms & Conditions',
    sections: [
      {
        heading: 'Direct Artisan Commerce',
        body: 'All heritage pieces listed on VIRAASAT are handmade in small batches by approved Indian ateliers. Subtle variations in handloom weave, glaze, or hand-chased patina are hallmarks of authentic craftsmanship.',
      },
      {
        heading: 'Server-Verified Pricing & Settlement',
        body: 'Final totals including applicable GST, privilege coupons, and insured courier charges are computed authoritatively on the server. Orders are confirmed only after cryptographic payment signature verification.',
      },
    ],
  },
  returns: {
    kicker: 'Patron Assurance',
    title: 'Return & Refund Policy',
    sections: [
      {
        heading: '7-Day Inspection Window',
        body: 'You may initiate a return request from your Patron Dashboard within 7 calendar days of delivery provided the original provenance seal, GI tag, and archival packaging remain intact.',
      },
      {
        heading: 'Refund Settlement Timeline',
        body: 'Once our curatorial team inspects the returned heirloom, refunds are issued to your original Razorpay settlement instrument within 5–7 business days.',
      },
    ],
  },
  shipping: {
    kicker: 'Insured Vault Logistics',
    title: 'Shipping Policy',
    sections: [
      {
        heading: 'Complimentary Insured Courier',
        body: 'Orders above ₹25,000 receive complimentary insured vault delivery across India via BlueDart Vault or Sequel Secure. Orders below ₹25,000 carry a flat ₹650 insured shipping fee, or optional ₹1,450 Express Air Vault shipping.',
      },
      {
        heading: 'Dispatch & Tracking',
        body: 'In-stock archive pieces dispatch within 48 hours from the originating craft cluster with end-to-end AWB tracking visible inside your Patron Dashboard.',
      },
    ],
  },
};

export function PolicyView({ type }: { type: keyof typeof POLICY_COPY }) {
  const doc = POLICY_COPY[type];
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div className="pb-6 border-b border-[#DFD3C0]">
        <p className="text-xs text-[#A67C37] tracking-[0.14em] uppercase">{doc.kicker}</p>
        <h1 className="font-display text-4xl text-[#231B17] mt-1">{doc.title}</h1>
        <p className="text-xs text-[#6E5F54] mt-1">Effective November 2026 · VIRAASAT Heritage Crafts</p>
      </div>
      <div className="space-y-6">
        {doc.sections.map((s) => (
          <section key={s.heading} className="bg-white border border-[#DFD3C0] p-6 space-y-2">
            <h2 className="font-display text-2xl text-[#231B17]">{s.heading}</h2>
            <p className="text-sm text-[#6E5F54] leading-relaxed">{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
