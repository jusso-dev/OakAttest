const TENANT_ROLES = [
  {
    role: 'tenant_owner',
    label: 'Tenant owner',
    access: 'Full organisation administration, billing-ready settings, branding, IP allowlist, ISM imports, audit log, and engagement creation.',
  },
  {
    role: 'assessor_admin',
    label: 'Assessor admin',
    access: 'Organisation operations, member invites, ISM imports, audit log, and engagement creation. Cannot change owner-only controls.',
  },
];

const ENGAGEMENT_ROLES = [
  {
    role: 'lead_assessor',
    label: 'Lead assessor',
    access: 'Owns the assessment workflow, invites engagement members, edits scope, decides applicability, requests and reviews evidence, creates findings, generates certification, and can delete generated SSP exports.',
  },
  {
    role: 'assessor',
    label: 'Assessor',
    access: 'Works assessment content: scope, applicability, evidence review, fieldwork, and findings. Cannot sign certification or manage engagement membership.',
  },
  {
    role: 'client_admin',
    label: 'Client admin',
    access: 'Client-side engagement administrator. Can invite other client users, upload evidence, write implementation statements, view findings, and delete generated SSP exports for their engagement.',
  },
  {
    role: 'client_contributor',
    label: 'Client contributor',
    access: 'Provides evidence and implementation statements for the specific engagement they were invited to.',
  },
  {
    role: 'read_only_observer',
    label: 'Read-only observer',
    access: 'Can view the assigned engagement and its assessment material without changing evidence, scope, findings, or exports.',
  },
];

export function RoleAccessGuide() {
  return (
    <div className="space-y-5 text-sm">
      <RoleSection
        title="Tenant roles"
        description="Tenant roles apply across the assessor organisation."
        roles={TENANT_ROLES}
      />
      <RoleSection
        title="Engagement roles"
        description="Engagement roles only apply to the specific engagement the user is added to."
        roles={ENGAGEMENT_ROLES}
      />
    </div>
  );
}

function RoleSection({
  title,
  description,
  roles,
}: {
  title: string;
  description: string;
  roles: Array<{ role: string; label: string; access: string }>;
}) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
      <div className="divide-y divide-slate-100 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)]">
        {roles.map((role) => (
          <div key={role.role} className="grid gap-1 px-3 py-2 sm:grid-cols-[180px_1fr]">
            <div>
              <p className="font-medium text-slate-950">{role.label}</p>
              <p className="font-mono text-xs text-slate-600">{role.role}</p>
            </div>
            <p className="text-slate-700">{role.access}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
