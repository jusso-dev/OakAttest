'use client';

import { useState } from 'react';
import { analyseEnterpriseEvidenceCsv, type EnterpriseEvidenceControlSuggestion } from '@/app/actions/enterprise-evidence';
import type { EnterpriseEvidenceSummary } from '@/lib/evidence/enterprise-csv';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const sourceLabels: Record<EnterpriseEvidenceSummary['source'], string> = {
  m365_secure_score: 'Microsoft 365 Secure Score',
  m365_entra_auth_methods: 'Microsoft Entra authentication methods',
  m365_compliance_manager: 'Microsoft Purview Compliance Manager',
  m365_defender: 'Microsoft Defender Vulnerability Management',
  google_workspace_security: 'Google Workspace security export',
  google_workspace_audit: 'Google Workspace audit export',
  generic_enterprise_csv: 'Generic enterprise CSV',
};

export function EnterpriseEvidenceCsvPanel({ engagementId }: { engagementId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [result, setResult] = useState<{
    summary: EnterpriseEvidenceSummary;
    suggestedControls: EnterpriseEvidenceControlSuggestion[];
  } | null>(null);

  async function analyse(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFilename(file.name);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        throw new Error('Upload a CSV export for analysis. Upload original Excel/PDF evidence through an evidence request.');
      }
      const content = await file.text();
      const analysed = await analyseEnterpriseEvidenceCsv({
        engagementId,
        filename: file.name,
        content,
      });
      setResult(analysed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyse vendor CSV</CardTitle>
        <CardDescription>
          Detect common Microsoft 365 and Google Workspace exports and suggest ISM/E8 mappings for assessor review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-950 hover:bg-[var(--oak-mist)]">
            {busy ? 'Analysing...' : 'Choose CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void analyse(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {filename && <span className="text-sm text-slate-600">{filename}</span>}
          {result && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(null);
                setFilename(null);
                setError(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        {result && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Detected source" value={sourceLabels[result.summary.source]} />
              <Metric label="Rows parsed" value={String(result.summary.rowCount)} />
              <Metric label="Suggested controls" value={String(result.suggestedControls.length)} />
            </div>

            {(result.summary.mappedStrategies.length > 0 ||
              result.summary.suggestedControlKeywords.length > 0) && (
              <div className="grid gap-3 md:grid-cols-2">
                <TagList title="Essential Eight signals" tags={result.summary.mappedStrategies} />
                <TagList title="ISM keyword signals" tags={result.summary.suggestedControlKeywords} />
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-slate-900">Suggested controls</h4>
              {result.suggestedControls.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  No matching in-scope controls were found. Upload the export as evidence and map it manually if it is still relevant.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-[var(--field-border)]">
                  {result.suggestedControls.slice(0, 12).map((control) => (
                    <li key={control.id} className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-700">{control.controlId}</span>
                        {control.matchedTerms.slice(0, 4).map((term) => (
                          <span
                            key={term}
                            className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-xs text-slate-700"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{control.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900">Sample parsed rows</h4>
              <ul className="mt-2 space-y-2">
                {result.summary.findings.slice(0, 5).map((finding, index) => (
                  <li key={`${finding.title}-${index}`} className="rounded-md border border-[var(--field-border)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{finding.title}</span>
                      <span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-xs text-slate-700">
                        {finding.severity}
                      </span>
                      {finding.status && <span className="text-xs text-slate-600">{finding.status}</span>}
                    </div>
                    {finding.summary && <p className="mt-1 text-xs text-slate-600">{finding.summary}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--field-border)] p-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TagList({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {tags.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No signals detected.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-xs text-slate-700">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
