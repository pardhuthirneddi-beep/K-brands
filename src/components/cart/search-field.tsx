'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export function SearchField() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      role="search"
      action="/search"
      method="get"
      onSubmit={(e) => {
        if (!value.trim()) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(value.trim())}`);
      }}
      className="hidden items-center rounded-xs border border-transparent bg-white/60 transition focus-within:border-stone-300 md:flex"
    >
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search"
        autoComplete="off"
        maxLength={60}
        className="w-28 bg-transparent px-3 py-1.5 text-[13px] outline-none transition-[width] placeholder:text-stone-500 focus:w-48 lg:w-36"
      />
      <button
        type="submit"
        className="grid h-10 w-10 place-items-center text-ink-500 transition hover:text-ink lg:h-9 lg:w-9"
        aria-label="Submit search"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <circle cx="6.2" cy="6.2" r="4.4" />
          <path d="m9.6 9.6 3 3" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
