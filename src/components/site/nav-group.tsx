'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * A category that has subcategories. Opens on hover and on keyboard focus, closes on
 * Escape / blur / outside click, and keeps its links in the tab order only while it is
 * open — the thing a CSS-only hover menu gets wrong.
 */
export function NavGroup({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: { href: string; label: string; count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const panelId = `nav-${label.toLowerCase().replace(/[^a-z]/g, '')}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <li
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Link
        href={href}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 py-2 text-[13px] text-ink-600 transition hover:text-ink"
      >
        {label}
        <svg
          width="8"
          height="6"
          viewBox="0 0 8 6"
          fill="none"
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </Link>
      {open ? (
        <div id={panelId} className="absolute left-1/2 top-full z-drawer w-56 -translate-x-1/2 border border-line bg-white py-2 shadow-lift">
          {children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="flex items-baseline justify-between gap-3 px-4 py-2 text-[13px] text-ink-600 transition hover:bg-stone-100 hover:text-ink"
            >
              {c.label}
              <span className="text-[11.5px] text-ink-600">{c.count}</span>
            </Link>
          ))}
          <Link
            href={href}
            className="mt-1 block border-t border-line px-4 pt-2.5 pb-1 text-[12px] text-ink-600 transition hover:text-ink"
          >
            View all {label.toLowerCase()}
          </Link>
        </div>
      ) : null}
    </li>
  );
}
