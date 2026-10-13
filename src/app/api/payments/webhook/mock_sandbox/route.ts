import { NextResponse } from 'next/server';
import { ingestWebhook } from '@/adapters/payment.ts';
import { consume } from '@/lib/rate-limit.ts';
import { ipHashFrom } from '@/lib/api.ts';
import { ensureDb } from '@/lib/bootstrap.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Test-gateway webhook receiver.
 *
 * Signature: `x-kbrands-mock-signature: hex(hmac_sha256(rawBody, KBRANDS_APP_SECRET))`.
 * A real provider adapter implements the same shape with its own signature
 * scheme — see docs/integrations.md. Unverified payloads are stored for review
 * and never applied to an order.
 */
export async function POST(req: Request) {
  ensureDb();
  const ip = ipHashFrom(req);
  const limit = consume('webhook', ip);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }
  const raw = await req.text();
  if (raw.length > 32_000) return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  let provider = 'mock_sandbox';
  try {
    provider = decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? 'mock_sandbox');
  } catch {
    /* fall back to default provider name */
  }
  const result = ingestWebhook({ provider, rawBody: raw, headers, ip });
  return NextResponse.json(
    { received: true, status: result.status, detail: result.detail },
    { status: result.status === 'failed' ? 422 : 200 },
  );
}
