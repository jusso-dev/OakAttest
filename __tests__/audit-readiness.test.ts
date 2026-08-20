import { describe, expect, it } from 'vitest';
import {
  auditTypesForFramework,
  buildAuditReadinessGates,
  readinessPercent,
  requirementsForAuditType,
} from '@/lib/audit-readiness';

describe('audit readiness', () => {
  it('offers only audit types matching the engagement framework', () => {
    expect(auditTypesForFramework('iso-27001')).toEqual(['iso_27001_stage_1']);
    expect(auditTypesForFramework('soc2')).toEqual(['soc_2_type_1', 'soc_2_type_2']);
    expect(auditTypesForFramework('ism')).toEqual([]);
  });

  it('seeds unique framework-specific requirements', () => {
    const iso = requirementsForAuditType('iso_27001_stage_1');
    const typeOne = requirementsForAuditType('soc_2_type_1');
    const typeTwo = requirementsForAuditType('soc_2_type_2');

    expect(new Set(iso.map((item) => item.key)).size).toBe(iso.length);
    expect(new Set(typeTwo.map((item) => item.key)).size).toBe(typeTwo.length);
    expect(typeTwo.length).toBeGreaterThan(typeOne.length);
    expect(typeTwo.map((item) => item.key)).toContain('observation-period');
    expect(iso.map((item) => item.key)).toEqual(
      expect.arrayContaining(['scope', 'risk-treatment', 'internal-audit', 'management-review']),
    );
  });

  it('requires all live gates before showing audit-ready', () => {
    const gates = buildAuditReadinessGates({
      engagementId: 'eng-1',
      auditType: 'soc_2_type_2',
      scopeStatement: 'Production service, people, processes, systems, vendors, and locations.',
      targetAuditAt: '2026-11-30',
      periodStart: '2026-01-01',
      periodEnd: '2026-09-30',
      requirementStatuses: ['ready', 'not_applicable'],
      controlCount: 42,
      acceptedEvidenceCount: 18,
      coverageBlockerKeys: [],
    });

    expect(gates.every((gate) => gate.ready)).toBe(true);
  });

  it('blocks invalid Type II periods and incomplete evidence', () => {
    const gates = buildAuditReadinessGates({
      engagementId: 'eng-1',
      auditType: 'soc_2_type_2',
      scopeStatement: 'Production service and supporting organisational systems.',
      targetAuditAt: '2026-11-30',
      periodStart: '2026-09-30',
      periodEnd: '2026-01-01',
      requirementStatuses: ['ready', 'blocked'],
      controlCount: 42,
      acceptedEvidenceCount: 4,
      coverageBlockerKeys: ['pending-evidence'],
    });

    expect(gates.find((gate) => gate.key === 'period')?.ready).toBe(false);
    expect(gates.find((gate) => gate.key === 'evidence')?.ready).toBe(false);
    expect(gates.find((gate) => gate.key === 'checklist')?.ready).toBe(false);
  });

  it('counts not-applicable checklist rows as resolved', () => {
    expect(readinessPercent(['ready', 'not_applicable', 'in_progress', 'blocked'])).toBe(50);
    expect(readinessPercent([])).toBe(0);
  });
});
