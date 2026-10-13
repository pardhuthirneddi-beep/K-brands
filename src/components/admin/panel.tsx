import clsx from 'clsx';

export function Panel({
  title,
  action,
  children,
  className,
  note,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  note?: string;
}) {
  return (
    <section className={clsx('border border-stone-200 bg-white shadow-card', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
        <h2 className="font-display text-[15px] leading-tight">{title}</h2>
        {action}
      </header>
      {note ? <p className="border-b border-stone-200 bg-ivory-200/40 px-4 py-2 text-[12px] leading-relaxed text-ink-500">{note}</p> : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'ok' | 'warn' | 'error' }) {
  const toneClass = tone === 'ok' ? 'text-alert-ok' : tone === 'warn' ? 'text-alert-warn' : tone === 'error' ? 'text-alert-error' : 'text-ink';
  return (
    <div className="border border-stone-200 bg-white p-4 shadow-card">
      <p className="eyebrow">{label}</p>
      <p className={clsx('mt-1 font-display text-[27px] leading-none tabular-nums', toneClass)}>{value}</p>
      {hint ? <p className="mt-1.5 text-[11.5px] leading-snug text-ink-600">{hint}</p> : null}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-stone-300">
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap py-2 pr-4 text-[10.5px] font-medium uppercase tracking-widest text-ink-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">{children}</tbody>
      </table>
    </div>
  );
}
