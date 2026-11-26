import React, { useEffect, useState } from 'react';
import { Check, LogOut, Save, Shield, Upload } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type {
  AuraCategory,
  AuraMood,
  AuraProfile,
  CategorySlug,
  MoodSlug,
} from '../../types/aura';
import { EditorialImage } from './EditorialPrimitives';

export function ProfileSettingsPage({
  section,
  user,
  categories,
  moods,
  onProfileUpdated,
  onSignOut,
}: {
  section: 'profile' | 'settings';
  user: AuraProfile | null;
  categories: AuraCategory[];
  moods: AuraMood[];
  onProfileUpdated: (profile: AuraProfile) => void;
  onSignOut: () => void;
}) {
  const { navigate } = useAuraRouter();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [favoriteCategories, setFavoriteCategories] = useState<CategorySlug[]>(
    user?.favoriteCategories || []
  );
  const [preferredMoods, setPreferredMoods] = useState<MoodSlug[]>(user?.preferredMoods || []);
  const [stats, setStats] = useState({ collectionsCount: 0, savedStoriesCount: 0, moodboardsCount: 0 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    updateDocumentSeo(
      section === 'settings' ? 'Account Settings — AURA' : 'Profile & Taste — AURA',
      'Manage your AURA editorial preferences, favorite categories, preferred moods, and account security.'
    );
  }, [section]);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setBio(user.bio);
    setAvatarUrl(user.avatarUrl);
    setFavoriteCategories(user.favoriteCategories);
    setPreferredMoods(user.preferredMoods);
    auraApi
      .getProfile()
      .then((res) => setStats(res.stats))
      .catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">Member Profile</p>
        <h1 className="font-serif text-4xl text-[#1C1917]">Sign in to personalize AURA</h1>
        <p className="text-sm text-[#574F46] leading-relaxed">
          Save your favorite moods, editorial departments, profile details, and collections across sessions.
        </p>
        <button
          type="button"
          onClick={() => navigate('/auth/sign-in')}
          className="px-6 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg"
        >
          Sign in
        </button>
      </div>
    );
  }

  function toggleCategory(slug: CategorySlug) {
    setFavoriteCategories((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]
    );
  }

  function toggleMood(slug: MoodSlug) {
    setPreferredMoods((prev) =>
      prev.includes(slug) ? prev.filter((m) => m !== slug) : [...prev, slug]
    );
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Avatar image must be 2MB or smaller.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
      });
      const res = await auraApi.uploadMedia({
        bucket: 'user-avatars',
        mimeType: file.type,
        dataBase64: dataUrl,
      });
      setAvatarUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await auraApi.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl,
        favoriteCategories,
        preferredMoods,
      });
      onProfileUpdated(res.profile);
      setNotice('Profile and taste preferences saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    if (!user?.email) return;
    setError(null);
    try {
      const res = await auraApi.resetPassword(user.email);
      setResetSent(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 sm:px-8 py-12 space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-8 border-b border-[#DDD5C7]">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[#7D7368]">Member Identity</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">{user.displayName}</h1>
          <p className="text-xs text-[#7D7368] tabular-nums">
            {stats.collectionsCount} collections · {stats.savedStoriesCount} saved stories · {stats.moodboardsCount} moodboards
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <AuraLink
            to="/profile"
            className={`px-3.5 py-2 text-xs rounded-lg ${
              section === 'profile' ? 'bg-[#1C1917] text-[#FAF7F2]' : 'border border-[#DDD5C7] text-[#574F46]'
            }`}
          >
            Profile & Taste
          </AuraLink>
          <AuraLink
            to="/settings"
            className={`px-3.5 py-2 text-xs rounded-lg ${
              section === 'settings' ? 'bg-[#1C1917] text-[#FAF7F2]' : 'border border-[#DDD5C7] text-[#574F46]'
            }`}
          >
            Account Settings
          </AuraLink>
          <button
            type="button"
            onClick={onSignOut}
            className="px-3.5 py-2 text-xs border border-[#DDD5C7] text-[#8B2E2E] rounded-lg hover:bg-[#8B2E2E]/10 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">{error}</p>}
      {notice && <p className="p-4 rounded-xl bg-[#2F5D46]/10 text-sm text-[#2F5D46]">{notice}</p>}

      {section === 'profile' ? (
        <form onSubmit={handleSaveProfile} className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 space-y-3">
              <div className="w-28 h-28 rounded-full overflow-hidden bg-[#EAE4DA] border border-[#DDD5C7]">
                <EditorialImage
                  src={avatarUrl}
                  alt={displayName}
                  fallbackTitle={displayName.slice(0, 2).toUpperCase()}
                  className="w-full h-full object-cover"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#DDD5C7] rounded-lg hover:bg-[#EAE4DA] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : 'Upload Avatar'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="md:col-span-8 space-y-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-medium text-[#574F46] mb-1">
                  Display Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DDD5C7] rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="prof-bio" className="block text-xs font-medium text-[#574F46] mb-1">
                  Editorial Bio
                </label>
                <textarea
                  id="prof-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share what inspires your spaces, travels, and craft..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DDD5C7] rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-[#DDD5C7] space-y-4">
            <h2 className="font-serif text-2xl text-[#1C1917]">Preferred Moods</h2>
            <p className="text-xs text-[#7D7368]">
              Stories aligned with your preferred moods are subtly elevated across Discover and Search.
            </p>
            <div className="flex flex-wrap gap-2">
              {moods.map((m) => {
                const selected = preferredMoods.includes(m.slug);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMood(m.slug)}
                    className={`px-3.5 py-2 text-xs rounded-lg transition-colors ${
                      selected
                        ? 'bg-[#1C1917] text-[#FAF7F2]'
                        : 'bg-[#F3EFE8] text-[#574F46] border border-[#DDD5C7]'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-8 border-t border-[#DDD5C7] space-y-4">
            <h2 className="font-serif text-2xl text-[#1C1917]">Favorite Departments</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const selected = favoriteCategories.includes(c.slug);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.slug)}
                    className={`px-3.5 py-2 text-xs rounded-lg transition-colors ${
                      selected
                        ? 'bg-[#1C1917] text-[#FAF7F2]'
                        : 'bg-[#F3EFE8] text-[#574F46] border border-[#DDD5C7]'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-8">
          <div className="p-6 rounded-2xl bg-white border border-[#DDD5C7] space-y-4">
            <h2 className="font-serif text-2xl text-[#1C1917] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#8C6A43]" />
              Verification & Identity Status
            </h2>
            <dl className="divide-y divide-[#EAE4DA] text-sm">
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-[#7D7368]">Email Address</dt>
                <dd className="text-[#1C1917] flex items-center gap-2">
                  <span>{user.email || '—'}</span>
                  {user.emailVerified && <Check className="w-4 h-4 text-[#2F5D46]" />}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-[#7D7368]">Indian Mobile (+91)</dt>
                <dd className="text-[#1C1917] flex items-center gap-2">
                  <span>{user.phone || 'Not linked yet'}</span>
                  {user.phoneVerified && <Check className="w-4 h-4 text-[#2F5D46]" />}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-[#7D7368]">Access Role</dt>
                <dd className="text-[#1C1917] capitalize">{user.role}</dd>
              </div>
            </dl>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#DDD5C7] space-y-3">
            <h2 className="font-serif text-2xl text-[#1C1917]">Password & Session Security</h2>
            <p className="text-sm text-[#574F46]">
              Send a Supabase password reset link to your verified email address, or sign out to revoke your current session token immediately.
            </p>
            {resetSent && <p className="text-xs text-[#2F5D46]">{resetSent}</p>}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handlePasswordReset}
                className="px-4 py-2 text-xs font-medium border border-[#DDD5C7] text-[#1C1917] rounded-lg hover:bg-[#EAE4DA]"
              >
                Send Password Reset Email
              </button>
              {user.role === 'admin' && (
                <AuraLink
                  to="/admin"
                  className="px-4 py-2 text-xs font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg"
                >
                  Open Admin Content Studio
                </AuraLink>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
