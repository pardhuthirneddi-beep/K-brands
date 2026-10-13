import Link from 'next/link';
import { Spinner } from './spinner.tsx';

export function EmptyState({
  title,
  body,
  action,
  icon = '◇',
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-stone-300 bg-white/50 px-6 py-10 text-left">
      <span aria-hidden="true" className="text-[22px] leading-none text-stone-400">
        {icon}
      </span>
      <h3 className="font-display text-[22px] leading-tight">{title}</h3>
      {body ? <p className="max-w-prose text-[14px] leading-relaxed text-ink-500">{body}</p> : null}
      {action ? (
        <Link href={action.href} className="btn-outline mt-1">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton aspect-[3/4] w-full" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-400">
      <Spinner label={label} />
    </div>
  );
}

export function ErrorNote({
  message,
  retryHref,
}: {
  message: string;
  retryHref?: string;
}) {
  return (
    <div
      role="alert"
      className="border border-alert-error/30 bg-alert-error/5 px-4 py-3 text-[13px] leading-relaxed text-alert-error"
    >
      <p>{message}</p>
      {retryHref ? (
        <Link href={retryHref} className="mt-1 inline-block underline underline-offset-4">
          Try again
        </Link>
      ) : null}
    </div>
  );
}
