import { BrandLogo } from '@/components/BrandLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4 py-12 text-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo className="justify-center" imageClassName="h-11" priority />
          <h1 className="mt-2 text-xl font-semibold text-slate-950">IRAP assessment platform</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
