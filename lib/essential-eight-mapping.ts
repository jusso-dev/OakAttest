import {
  buildEssentialEightCriterion,
  type EssentialEightCriterion,
  type EssentialEightCriterionResult,
} from '@/lib/essential-eight-criteria';

type EssentialEightMapping = Array<{ strategy: string; maturityLevel?: number | null }> | null;

export type MappedControlInput = {
  frameworkControlId: string;
  controlId: string;
  description: string;
  revision?: string;
  status?: string | null;
  applicable?: string | null;
  mapping: EssentialEightMapping;
};

export type MappedControlEvidenceInput = {
  frameworkControlId: string;
  id: string;
  filename: string;
  reviewStatus: string;
  sha256: string;
};

export type MappedControlFindingInput = {
  frameworkControlId: string;
  code: string;
  title: string;
  type: string;
  severity: string;
  status: string;
};

export type EssentialEightMappedControl = {
  frameworkControlId: string;
  controlId: string;
  description: string;
  status: string | null;
  applicable: string | null;
  maturityLevel: number | null;
  criterion: EssentialEightCriterion;
  workpaper: EssentialEightCriterionResult | null;
  evidence: Array<{
    id: string;
    filename: string;
    reviewStatus: string;
    sha256: string;
  }>;
  findings: Array<{
    code: string;
    title: string;
    type: string;
    severity: string;
    status: string;
  }>;
};

export function groupEssentialEightMappedControls(opts: {
  controls: MappedControlInput[];
  evidence: MappedControlEvidenceInput[];
  findings: MappedControlFindingInput[];
  workpapers?: EssentialEightCriterionResult[];
  guideVersion?: string;
}): Map<string, EssentialEightMappedControl[]> {
  const evidenceByControl = groupBy(opts.evidence, (item) => item.frameworkControlId);
  const findingsByControl = groupBy(opts.findings, (item) => item.frameworkControlId);
  const grouped = new Map<string, EssentialEightMappedControl[]>();
  const workpaperByCriterion = new Map(
    (opts.workpapers ?? []).map((workpaper) => [workpaper.criterionId, workpaper]),
  );

  for (const control of opts.controls) {
    for (const mapping of control.mapping ?? []) {
      const criterion = buildEssentialEightCriterion({
        strategy: mapping.strategy as EssentialEightCriterion['strategy'],
        frameworkControlId: control.frameworkControlId,
        controlId: control.controlId,
        description: control.description,
        sourceRevision: control.revision ?? 'unknown',
        maturityLevel: mapping.maturityLevel,
        guideVersion: opts.guideVersion,
      });
      const existing = grouped.get(mapping.strategy) ?? [];
      existing.push({
        frameworkControlId: control.frameworkControlId,
        controlId: control.controlId,
        description: control.description,
        status: control.status ?? null,
        applicable: control.applicable ?? null,
        maturityLevel: mapping.maturityLevel ?? null,
        criterion,
        workpaper: workpaperByCriterion.get(criterion.criterionId) ?? null,
        evidence: (evidenceByControl.get(control.frameworkControlId) ?? []).map((item) => ({
          id: item.id,
          filename: item.filename,
          reviewStatus: item.reviewStatus,
          sha256: item.sha256,
        })),
        findings: (findingsByControl.get(control.frameworkControlId) ?? []).map((item) => ({
          code: item.code,
          title: item.title,
          type: item.type,
          severity: item.severity,
          status: item.status,
        })),
      });
      grouped.set(mapping.strategy, existing);
    }
  }

  return grouped;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}
