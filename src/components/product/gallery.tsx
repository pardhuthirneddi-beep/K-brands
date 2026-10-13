'use client';

import { useEffect, useState } from 'react';

export function Gallery({
  images,
  title,
}: {
  images: { url: string; alt: string; kind: string }[];
  title: string;
}) {
  const list = images.length > 0 ? images : [{ url: '/media/sample/placeholder/0.svg', alt: `${title} — sample artwork`, kind: 'placeholder' }];
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);

  // The purchase panel announces the chosen colourway; jump to the frame made for it.
  // A colourway with no photography of its own resolves to its colour-matched demo plate,
  // which is labelled as such under the image — never to another colour's photograph.
  useEffect(() => {
    const onColour = (e: Event) => {
      const colour = (e as CustomEvent<{ colour: string | null }>).detail?.colour;
      if (!colour) return;
      const needle = `t=${encodeURIComponent(colour)}`;
      const idx = list.findIndex(
        (img) => img.url.includes(needle) || new RegExp(`\\bin ${colour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`).test(img.alt),
      );
      if (idx >= 0) {
        setActive(idx);
        setZoom(false);
      }
    };
    window.addEventListener('kb:gallery-colour', onColour);
    return () => window.removeEventListener('kb:gallery-colour', onColour);
  }, [list]);
  const current = list[Math.min(active, list.length - 1)]!;
  return (
    <div className="lg:sticky lg:top-24">
      <button
        type="button"
        onClick={() => setZoom((z) => !z)}
        aria-label={zoom ? 'Zoom out' : 'Zoom in on the image'}
        aria-pressed={zoom}
        className="product-frame block w-full overflow-hidden border border-line"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt}
          width={900}
          height={1200}
          className={`mx-auto block h-auto w-full object-cover transition-transform duration-500 ease-editorial ${
            zoom ? 'scale-[1.6] cursor-zoom-out' : 'cursor-zoom-in'
          }`}
          fetchPriority={active === 0 ? 'high' : 'auto'}
        />
      </button>
      {list.length > 1 ? (
        <div className="mt-3 flex gap-2.5 overflow-x-auto scroll-x" role="tablist" aria-label="Product images">
          {list.map((img, i) => (
            <button
              key={`${img.url}-${String(i)}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Show image ${String(i + 1)} of ${list.length}`}
              onClick={() => setActive(i)}
              className={`product-frame relative h-[104px] w-[78px] shrink-0 overflow-hidden border transition ${
                i === active ? 'border-ink' : 'border-line hover:border-stone-400'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-2.5 text-[12px] text-ink-400">
        {current.kind === 'generated' || current.kind === 'placeholder'
          ? 'Demo illustration of this colourway · not product photography'
          : 'Demo photography · labelled, not verified product imagery'}
        {list.length > 1 ? <span className="ml-2 text-stone-400">Frame {String(active + 1)} of {String(list.length)} · click to enlarge</span> : null}
      </p>
    </div>
  );
}
