const PACKAGE_ITEMS = [
  {
    title: 'IRAP assessment report',
    body: 'Assessor-produced report covering scope, methods, strengths, weaknesses, implementation outcomes, limitations, and residual risks.',
  },
  {
    title: 'Control matrix',
    body: 'Per-control outcomes, evidence gathered, assessment objects, methods, coverage, and documented limitations.',
  },
  {
    title: 'IRAP assessor attestation',
    body: 'Statement from the IRAP assessor about assessment scope, independence, report version, signature, and date.',
  },
  {
    title: 'ASD or provider material',
    body: 'Any ASD, agency, or cloud-provider artefacts supplied to support the client authorisation decision, such as provider assessment letters, cloud assessment reports, and inherited control matrices.',
  },
  {
    title: 'Plan of action and milestones',
    body: 'Open findings, residual risks, agreed treatments, owners, target dates, and accepted risk decisions.',
  },
];

export function AuthorisationPackagePanel() {
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">Authorisation package checklist</h3>
        <p className="mt-1 text-sm text-slate-700">
          The final certification step should assemble the assessor attestation and client
          authorisation artefacts. IRAP assessment does not mean ASD certifies or endorses the
          system.
        </p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {PACKAGE_ITEMS.map((item) => (
          <div
            key={item.title}
            className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3"
          >
            <p className="text-sm font-medium text-slate-950">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-700">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
