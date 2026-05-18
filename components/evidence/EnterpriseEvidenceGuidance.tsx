import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const sources = [
  {
    title: 'Microsoft 365 Secure Score',
    value:
      'Ask the client to export Secure Score recommended actions or use Microsoft Graph secureScore data. Request the tenant name, export timestamp, current score, max score, licensed products, excluded actions, and any compensating notes.',
    maps:
      'Useful for MFA, admin privilege restriction, endpoint hardening, email protection, audit logging, information protection, and patch/vulnerability evidence.',
  },
  {
    title: 'Microsoft Entra authentication methods',
    value:
      'Ask for the User registration details export from Entra authentication methods, or an equivalent Graph export. It should include UPN, MFA registered/capable state, default MFA method, methods registered, admin status where available, and export date.',
    maps:
      'Useful for Essential Eight multi-factor authentication, privileged access, user access management, and conditional access sampling.',
  },
  {
    title: 'Microsoft Purview Compliance Manager',
    value:
      'Ask for the assessment or improvement action workbook export. The original workbook is preferred; CSV converted from the action sheet can be analysed here if the original is also uploaded.',
    maps:
      'Useful as supporting evidence for governance, data protection, DLP, retention, policy ownership, test status, and Microsoft-managed control context.',
  },
  {
    title: 'Microsoft Defender Vulnerability Management',
    value:
      'Ask for security recommendations, exposed devices, software inventory, or vulnerability assessment exports with report period, device scope, filters, and remediation status.',
    maps:
      'Useful for patching applications, patching operating systems, vulnerability management, endpoint hardening, and remediation validation.',
  },
  {
    title: 'Google Workspace Security Center',
    value:
      'Ask for Security health, audit and investigation, user, admin, token, and login exports where licensed. Include the Google customer ID, organisational units in scope, filters, report period, and export timestamp.',
    maps:
      'Useful for 2-step verification, admin activity, login monitoring, phishing/email controls, data sharing controls, and audit logging.',
  },
];

export function EnterpriseEvidenceGuidance({ isAssessor }: { isAssessor: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enterprise platform evidence</CardTitle>
        <CardDescription>
          Use common Microsoft 365, Google Workspace, and security platform exports as structured
          evidence inputs for ISM mapping.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4 text-sm text-slate-700">
          {isAssessor ? (
            <p>
              Advise the client to upload the original export through an evidence request, then use
              the CSV analyser below to suggest related ISM controls. A vendor score or passed
              status is supporting evidence only; the assessor still confirms scope, sample
              coverage, implementation, and limitations.
            </p>
          ) : (
            <p>
              Upload the original export requested by the assessor. Do not edit the vendor export;
              if you transform it to CSV, upload both the original and transformed copy.
            </p>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {sources.map((source) => (
            <div key={source.title} className="rounded-md border border-[var(--field-border)] p-4">
              <h4 className="text-sm font-semibold text-slate-900">{source.title}</h4>
              <p className="mt-2 text-sm text-slate-700">{source.value}</p>
              <p className="mt-2 text-xs text-slate-600">{source.maps}</p>
            </div>
          ))}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900">Minimum collection instructions</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Upload the original vendor export to Evidence and link it to the requested controls.</li>
            <li>Record who exported it, when it was exported, the tenant/customer ID, and the report period.</li>
            <li>Document all filters, organisational units, groups, devices, or workloads excluded from the export.</li>
            <li>Where the platform report shows a pass or score, add assessor notes on scope and independent validation performed.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
