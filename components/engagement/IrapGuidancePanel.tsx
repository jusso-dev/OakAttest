import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const READINESS_ITEMS = [
  'Assessment timeline, milestones, system access, and required personnel confirmed.',
  'Assessment boundary, system assets, environments, data flows, and inherited services documented.',
  'Evidence pack prepared: SSP, risk documents, architecture, incident response, SOPs, continuity, configuration, monitoring, vulnerability scans, patching, and backup tests.',
  'Evidence quality reviewed: prefer first-hand technical configuration, logs, tests, screenshots, and demonstrations over generic policy templates.',
  'Sampling approach, assessment objects, control methods, and limitations documented in the control matrix.',
];

const CAF_STAGES = [
  'Plan and prepare',
  'Define the assessment boundary',
  'Assess the controls',
  'Produce the IRAP assessment report',
];

export function IrapGuidancePanel() {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>IRAP assessment readiness</CardTitle>
        <CardDescription>
          Working checklist aligned to ASD CAF and consumer preparation guidance.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4">
          <p className="text-xs font-medium uppercase text-slate-600">CAF stages</p>
          <ol className="mt-3 space-y-2 text-sm text-slate-800">
            {CAF_STAGES.map((stage, index) => (
              <li key={stage} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--oak-shield)] text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{stage}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-2">
          {READINESS_ITEMS.map((item) => (
            <div
              key={item}
              className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-800"
            >
              {item}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
