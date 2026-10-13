import { NextResponse } from 'next/server';
import { get } from '@/db/client.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const row = get<{ n: number }>('SELECT COUNT(*) AS n FROM products');
  return NextResponse.json({ ok: true, products: row?.n ?? null, ts: new Date().toISOString() });
}
