import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { requireUser } from '@/lib/session.ts';
import { all } from '@/db/client.ts';
import { PasswordChanger, ProfileEditor } from '@/components/account/profile-editor.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // requireUser, not readUser: the layout check alone is not enough under streaming, and a
  // non-null assertion here would turn a signed-out visitor into a crash rather than a redirect.
  const user = await requireUser('/account/profile');
  const sessions = all<{ id: string; last_seen_at: string; user_agent: string | null }>(
    `SELECT id, last_seen_at, user_agent FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 8`,
    [user.id],
  );
  return (
    <div className="space-y-10">
      <section>
        <h1 className="display-section mb-5 text-[26px]">Profile</h1>
        <ProfileEditor initial={{ fullName: user.fullName, phone: user.phone ?? '', email: user.email }} />
      </section>

      <section className="border-t border-stone-200 pt-8">
        <h2 className="display-section mb-1 text-[22px]">Security</h2>
        <p className="mb-5 max-w-prose text-[13px] leading-relaxed text-ink-500">
          Sign-in uses a salted scrypt hash. The raw password is never stored, logged or sent anywhere.
        </p>
        <PasswordChanger />
      </section>

      <section className="border-t border-stone-200 pt-8">
        <h2 className="eyebrow mb-3">Active sessions</h2>
        <ul className="divide-y divide-stone-200 border-y border-stone-200 text-[13px]">
          {sessions.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="truncate text-ink-600">{s.user_agent?.slice(0, 70) || 'Unknown device'}</span>
              <span className="shrink-0 text-[12px] text-ink-400">
                {i === 0 ? 'this device · ' : ''}
                last seen {new Date(s.last_seen_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-400">
          Sessions expire automatically after 14 days. Changing your password signs out every other device.
        </p>
      </section>

      <section className="border-t border-stone-200 pt-8">
        <h2 className="eyebrow mb-2">Data &amp; account</h2>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-500">
          Deleting your account is not available in this build. Email us using the details on the{' '}
          <Link href="/contact" className="underline underline-offset-4">contact page</Link> and the request is
          handled manually — see our <Link href="/policies/privacy" className="underline underline-offset-4">privacy notice</Link>.
        </p>
      </section>
    </div>
  );
}
