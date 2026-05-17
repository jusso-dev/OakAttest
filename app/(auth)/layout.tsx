export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">OakAttest</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">IRAP assessment platform</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
