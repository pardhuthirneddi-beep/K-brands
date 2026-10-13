import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { contactSchema, parseWith } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { recordAudit } from '@/domain/audit.ts';
import { enqueueNotification } from '@/domain/notifications.ts';
import { getSetting } from '@/domain/settings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contact form. Stored as an audit record (there is no CRM) and queued for the
 * configured support address. Contact details are owner-provided: if they are not
 * configured we say so rather than inventing an address or phone number.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const ip = ipHashFrom(req);
  return handler(req, {
    method: 'POST',
    csrf: false,
    rate: { rule: 'contact', scope: () => `contact:${ip}` },
    run: async () => {
      const parsed = parseWith(contactSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const v = parsed.value;
      const honeypot = typeof body.website === 'string' && body.website.trim().length > 0;
      if (honeypot) return NextResponse.json({ ok: true, message: 'Thank you — your message has been received.' });
      const supportEmail = getSetting<string | null>('store.support_email', null);
      recordAudit({
        action: 'contact.message',
        targetType: 'contact',
        targetId: null,
        summary: `${v.topic}: message from ${v.email}`.slice(0, 200),
        metadata: { topic: v.topic, orderRef: v.orderRef ?? null, name: v.name },
        ip,
      });
      if (supportEmail) {
        enqueueNotification({
          template: 'contact_received',
          recipient: supportEmail,
          subject: `[Contact] ${v.topic}${v.orderRef ? ` · ${v.orderRef}` : ''}`,
          bodyText: `From: ${v.name} <${v.email}>\n${v.orderRef ? `Regarding order: ${v.orderRef}\n` : ''}\n${v.message}`,
          dedupeKey: `contact:${ip}:${Date.now()}`,
          relatedType: 'contact',
        });
      }
      return NextResponse.json({
        ok: true,
        message: supportEmail
          ? 'Thank you — your message has been recorded and will reach our support team.'
          : 'Thank you — your message has been recorded. Note that our published contact details are not configured yet, so please expect a delay in reply.',
      });
    },
  });
}
