export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-8 py-24 font-sans">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
        OakAttest
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        IRAP assessment platform
      </h1>
      <p className="max-w-prose text-base leading-7 text-slate-600">
        OakAttest is being built for ASD-registered IRAP assessor firms and the
        client organisations they assess. Milestone 1 is in flight; the schema
        proposal is in <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">db/schema</code>{' '}
        and the architecture is documented in{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">docs/ARCHITECTURE.md</code>.
      </p>
    </main>
  );
}
