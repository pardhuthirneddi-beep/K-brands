'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Facets = {
  sizes: { size: string; n: number }[];
  colors: { color: string; hex: string | null; n: number }[];
  garments: { garment: string; n: number }[];
  priceMinCents: number;
  priceMaxCents: number;
};

export function FilterBar({ facets, baseHref }: { facets: Facets; baseHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = {
    sizes: params.get('sizes')?.split(',').filter(Boolean) ?? [],
    colors: params.get('colors')?.split(',').filter(Boolean) ?? [],
    garments: params.get('garments')?.split(',').filter(Boolean) ?? [],
    max: params.get('max') ?? '',
    instock: params.get('instock') === '1',
    sort: params.get('sort') ?? 'featured',
  };

  const push = useCallback(
    (next: Partial<typeof selected>) => {
      const merged = { ...selected, ...next };
      const q = new URLSearchParams();
      if (merged.sizes.length) q.set('sizes', merged.sizes.join(','));
      if (merged.colors.length) q.set('colors', merged.colors.join(','));
      if (merged.garments.length) q.set('garments', merged.garments.join(','));
      if (merged.max) q.set('max', merged.max);
      if (merged.instock) q.set('instock', '1');
      if (merged.sort && merged.sort !== 'featured') q.set('sort', merged.sort);
      router.push(`${pathname}${q.toString() ? `?${q.toString()}` : ''}`);
    },
    [router, pathname, selected],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (key: 'sizes' | 'colors' | 'garments', value: string) => {
    const list = selected[key];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    push({ [key]: next } as Partial<typeof selected>);
  };

  const activeCount =
    selected.sizes.length + selected.colors.length + selected.garments.length + (selected.max ? 1 : 0) + (selected.instock ? 1 : 0);

  return (
    <div ref={panelRef} className="relative flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="filter-panel"
          className="btn-quiet py-2 text-[11.5px]"
        >
          {open ? 'Hide filters' : 'Filters'}
          {activeCount > 0 ? (
            <span className="ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[11.5px] text-ivory-100">
              {activeCount}
            </span>
          ) : null}
        </button>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => router.push(baseHref)}
            className="text-[12px] tracking-label text-ink-400 underline-offset-4 hover:text-ink hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="text-[12px] tracking-label text-ink-400">
          Sort
        </label>
        <select
          id="sort"
          value={selected.sort}
          onChange={(e) => push({ sort: e.target.value })}
          className="field w-auto cursor-pointer py-1.5 text-[12.5px]"
        >
          <option value="featured">Featured</option>
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name_asc">Alphabetical</option>
          <option value="discount">Biggest saving</option>
        </select>
      </div>

      {open ? (
        <div id="filter-panel" className="w-full animate-fade-in border border-stone-200 bg-white p-5 shadow-card">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FacetGroup title="Size">
              {facets.sizes.length === 0 ? <p className="text-[12.5px] text-ink-400">No sizes available.</p> : null}
              <div className="flex flex-wrap gap-1.5">
                {facets.sizes.map((f) => (
                  <Chip key={f.size} active={selected.sizes.includes(f.size)} onClick={() => toggle('sizes', f.size)}>
                    {f.size} <span className="opacity-50">{f.n}</span>
                  </Chip>
                ))}
              </div>
            </FacetGroup>
            <FacetGroup title="Colour">
              <div className="flex flex-col gap-1.5">
                {facets.colors.map((f) => (
                  <label key={f.color} className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={selected.colors.includes(f.color.toLowerCase())}
                      onChange={() => toggle('colors', f.color.toLowerCase())}
                      className="h-3.5 w-3.5 accent-[#1b1a17]"
                    />
                    <span
                      aria-hidden="true"
                      className="inline-block h-3.5 w-3.5 rounded-full border border-stone-300"
                      style={{ background: f.hex ?? '#dedad3' }}
                    />
                    {f.color}
                    <span className="text-ink-400">{f.n}</span>
                  </label>
                ))}
                {facets.colors.length === 0 ? <p className="text-[12.5px] text-ink-400">No colours yet.</p> : null}
              </div>
            </FacetGroup>
            <FacetGroup title="Garment">
              <div className="flex flex-col gap-1.5">
                {facets.garments.map((f) => (
                  <label key={f.garment} className="flex cursor-pointer items-center gap-2 text-[13px] capitalize">
                    <input
                      type="checkbox"
                      checked={selected.garments.includes(f.garment)}
                      onChange={() => toggle('garments', f.garment)}
                      className="h-3.5 w-3.5 accent-[#1b1a17]"
                    />
                    {f.garment.replace(/-/g, ' ')}
                    <span className="text-ink-400">{f.n}</span>
                  </label>
                ))}
                {facets.garments.length === 0 ? <p className="text-[12.5px] text-ink-400">No garments yet.</p> : null}
              </div>
            </FacetGroup>
            <FacetGroup title="Price & availability">
              <div className="flex flex-col gap-3">
                <label className="text-[13px]">
                  <span className="mb-1 block text-[12px] tracking-label text-ink-400">Up to</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    defaultValue={selected.max ? Math.round(Number(selected.max) / 100) : ''}
                    placeholder={String(Math.round(facets.priceMaxCents / 100))}
                    onBlur={(e) => {
                      const major = Number(e.target.value);
                      push({ max: Number.isFinite(major) && major > 0 ? String(Math.round(major * 100)) : '' });
                    }}
                    className="field py-1.5 text-[13px]"
                  />
                  <span className="mt-1 block text-[11.5px] text-ink-400">Enter amount in rupees, then leave the field.</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={selected.instock}
                    onChange={(e) => push({ instock: e.target.checked })}
                    className="h-3.5 w-3.5 accent-[#1b1a17]"
                  />
                  In stock only
                </label>
              </div>
            </FacetGroup>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xs border px-2.5 py-1 text-[12.5px] transition ${
        active ? 'border-ink bg-ink text-ivory-100' : 'border-stone-300 bg-white hover:border-ink-300'
      }`}
    >
      {children}
    </button>
  );
}
