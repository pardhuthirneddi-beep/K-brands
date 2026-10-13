export default function Loading() {
  return (
    <div className="container py-14" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className="skeleton h-8 w-48" />
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-3">
            <div className="skeleton aspect-[3/4] w-full" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
