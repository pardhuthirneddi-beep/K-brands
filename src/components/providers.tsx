'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Toast = { id: number; message: string; tone: 'ok' | 'error' | 'info' };

type CartApi = {
  count: number;
  setCount: (n: number) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  csrf: string | null;
  busy: boolean;
};

const Ctx = createContext<CartApi | null>(null);

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart must be used inside AppProviders');
  return ctx;
}

/** POST/PATCH/DELETE helper shared by every client component (CSRF header included). */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const csrf = typeof window !== 'undefined' ? document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? null : null;
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function AppProviders({
  children,
  initialCartCount,
  csrf,
}: {
  children: React.ReactNode;
  initialCartCount: number;
  cartKey: string | null;
  csrf: string | null;
}) {
  const [count, setCount] = useState(initialCartCount);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = (await res.json()) as { itemCount: number };
      setCount(data.itemCount ?? 0);
    } catch {
      /* offline / server error: keep the optimistic count */
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const value = useMemo<CartApi>(
    () => ({
      count,
      setCount,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      refresh,
      toast,
      toasts,
      dismiss,
      csrf,
      busy,
    }),
    [count, drawerOpen, refresh, toast, toasts, dismiss, csrf, busy],
  );

  // Expose a tiny event bus so deep components can trigger toasts/refresh without prop drilling.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number; drawer?: boolean; route?: boolean }>).detail ?? {};
      if (typeof detail.count === 'number') setCount(detail.count);
      if (typeof detail.drawer === 'boolean') setDrawerOpen(detail.drawer);
      if (detail.route) router.refresh();
    };
    window.addEventListener('kb:cart', handler);
    return () => window.removeEventListener('kb:cart', handler);
  }, [router]);

  useEffect(() => {
    const t = (message: string, tone: Toast['tone'] = 'info') => toast(message, tone);
    (window as unknown as { __kbToast?: typeof t }).__kbToast = t;
  }, [toast]);

  useEffect(() => {
    setBusy(false);
  }, []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} dismiss={dismiss} />
    </Ctx.Provider>
  );
}

function ToastRegion({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 px-4 pb-5 sm:items-end sm:px-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto w-full max-w-sm rounded-xs border px-4 py-3 text-left text-[13px] shadow-lift backdrop-blur transition ${
            t.tone === 'error'
              ? 'border-alert-error/40 bg-white/95 text-alert-error'
              : t.tone === 'ok'
                ? 'border-alert-ok/35 bg-white/95 text-alert-ok'
                : 'border-ink/15 bg-ink/95 text-ivory-100'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function emitCart(detail: { count?: number; drawer?: boolean; route?: boolean }) {
  window.dispatchEvent(new CustomEvent('kb:cart', { detail }));
}
