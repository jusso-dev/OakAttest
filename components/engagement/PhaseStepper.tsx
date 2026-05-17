import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

// The five IRAP phases (§1). `maintenance` is a separate sixth state for
// post-certification engagements and renders distinctly.

export const PHASES = [
  { key: 'scoping', label: 'Scoping', segment: 'scope' },
  { key: 'evidence', label: 'Evidence', segment: 'evidence' },
  { key: 'fieldwork', label: 'Fieldwork', segment: 'fieldwork' },
  { key: 'findings', label: 'Findings', segment: 'findings' },
  { key: 'certification', label: 'Certification', segment: 'certification' },
] as const;

export type Phase = (typeof PHASES)[number]['key'] | 'maintenance';

export function PhaseStepper({
  engagementId,
  currentPhase,
}: {
  engagementId: string;
  currentPhase: Phase;
}) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);
  return (
    <ol className="flex w-full items-center gap-0 overflow-x-auto rounded-md border border-slate-200 bg-white p-1">
      {PHASES.map((p, i) => {
        const status =
          i < currentIndex ? 'complete' : i === currentIndex ? 'current' : 'upcoming';
        return (
          <li key={p.key} className="flex-1 min-w-[140px]">
            <Link
              href={`/engagements/${engagementId}/${p.segment}`}
              className={cn(
                'flex items-center gap-2 rounded px-3 py-2 text-sm transition-colors',
                status === 'current' && 'bg-teal-50 text-teal-900 font-medium',
                status === 'complete' && 'text-slate-700 hover:bg-slate-50',
                status === 'upcoming' && 'text-slate-400 hover:bg-slate-50',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                  status === 'current' && 'bg-teal-900 text-white',
                  status === 'complete' && 'bg-slate-700 text-white',
                  status === 'upcoming' && 'border border-slate-300 text-slate-400',
                )}
              >
                {status === 'complete' ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {p.label}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
