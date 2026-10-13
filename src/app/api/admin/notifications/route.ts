import { NextResponse } from 'next/server';
import { guardAdmin, handler } from '@/lib/api.ts';
import { emailTransportReady, flushNotifications, notificationStats, recentNotifications } from '@/domain/notifications.ts';
import { recordAudit } from '@/domain/audit.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  return NextResponse.json({
    items: recentNotifications(60),
    stats: notificationStats(),
    transportReady: emailTransportReady(),
    transportNote: emailTransportReady()
      ? 'A provider key is present; sending still requires the transport module (docs/integrations.md).'
      : 'No email transport is configured. Messages are queued only — nothing has been delivered.',
  });
}

export async function POST(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  return handler(req, {
    method: 'POST',
    admin: true,
    run: async () => {
      const res = flushNotifications();
      recordAudit({
        action: 'notifications.flush',
        targetType: 'notification',
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `Flush requested: ${String(res.attempted)} attempted, ${String(res.sent)} sent, ${String(res.deferred)} deferred`,
      });
      return NextResponse.json({ ok: true, ...res });
    },
  });
}
