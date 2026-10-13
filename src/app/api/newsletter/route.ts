import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { get, run } from '@/db/client.ts';
import { AppError } from '@/lib/errors.ts';
import { recordAudit } from '@/domain/audit.ts';
import * as env from '@/lib/env.ts';
import { getSetting } from '@/domain/settings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Newsletter sign-up — a real table and a real write, so the storefront can say
 * "you are on the list" instead of faking a success message.
 *
 * What this endpoint does NOT do: promise a send. Mail delivery depends on the
 * configured notification provider; when none is wired up the subscriber is stored and
 * the response says so plainly. Consent is mandatory and the exact wording shown at the
 * time of signing up is stored alongside the address, which is what a future
 * CAS/UIPA-era compliance review will ask for.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const CONSENT_STATEMENT = 'Store my email to receive K-brands launch and product news. No third-party sharing.';

export async function POST(req: Request) {
  const body = await readJson(req);
  const ip = ipHashFrom(req);
  return handler(req, {
    method: 'POST',
    csrf: false,
    rate: { rule: 'contact', scope: () => `newsletter:${ip}` },
    run: async () => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
      if (!EMAIL.test(email)) throw new AppError('validation_error', 'Enter a valid email address.', 400);
      if (body.consent !== true) {
        throw new AppError('validation_error', 'Please tick the consent box before subscribing.', 400);
      }
      // Honeypot: pretend success, store nothing.
      if (typeof body.website === 'string' && body.website.trim().length > 0) {
        return NextResponse.json({ ok: true, state: 'subscribed' });
      }

      const ts = new Date().toISOString();
      const existing = get<{ id: number; status: string }>(
        'SELECT id, status FROM newsletter_subscribers WHERE email = ?',
        [email],
      );
      let state: 'subscribed' | 'resubscribed' | 'already';
      if (existing) {
        if (existing.status === 'subscribed') {
          state = 'already';
        } else {
          run('UPDATE newsletter_subscribers SET status = ?, consent_text = ?, consent_at = ?, updated_at = ? WHERE id = ?', [
            'subscribed',
            CONSENT_STATEMENT,
            ts,
            ts,
            existing.id,
          ]);
          state = 'resubscribed';
        }
      } else {
        run(
          `INSERT INTO newsletter_subscribers (email, status, source, consent_text, consent_at, ip_hash, created_at, updated_at)
           VALUES (?, 'subscribed', ?, ?, ?, ?, ?, ?)`,
          [email, String(body.source ?? 'homepage').slice(0, 40), CONSENT_STATEMENT, ts, ip, ts, ts],
        );
        state = 'subscribed';
      }
      recordAudit({
        action: 'newsletter.subscribe',
        targetType: 'newsletter',
        targetId: null,
        summary: `${state}: ${email}`.slice(0, 200),
        metadata: { state },
        ip,
      });

      // Tell the shopper what will actually happen next. Never claim a send we cannot make.
      const canSend = env.emailMode !== 'none';
      return NextResponse.json({
        ok: true,
        state,
        email,
        message:
          state === 'already'
            ? 'That address is already on the list.'
            : 'You are on the list — we will write to this address when the store opens.',
        deliveryNote: canSend
          ? 'Notification provider detected; the welcome message will go out with the next queue run.'
          : 'No email provider is configured for this deployment, so nothing has been sent yet — the address is recorded only.',
      });
    },
  });
}
