'use client';

import Link from 'next/link';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The message is intentionally not rendered: an unexpected server error may
    // contain internal paths or data. Only the safe digest is surfaced.
    console.error('[app] unhandled render error', error.digest);
  }, [error]);

  return (
    <div className="container grid min-h-[55vh] place-items-center py-16">
      <div className="max-w-md text-center">
        <span aria-hidden="true" className="text-[30px] text-stone-400">
          ◇
        </span>
        <h1 className="display-section mt-4 text-[28px]">This page hit a problem</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-500">
          Nothing was changed on your account or in your bag. Try again — if it keeps happening, let us know and
          include the reference below.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[12px] text-ink-400">
            Reference <code className="rounded-xs bg-stone-100 px-1.5 py-0.5">{error.digest}</code>
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn-solid">
            Try again
          </button>
          <Link href="/" className="btn-outline">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
