import { describe, expect, it } from 'vitest';
import { parseEnterpriseEvidenceCsv } from '@/lib/evidence/enterprise-csv';

describe('enterprise evidence CSV parsing', () => {
  it('detects Microsoft 365 Secure Score exports and maps MFA/admin controls', () => {
    const csv = [
      'Control,Control category,Score,Max score,Implementation status,User impact',
      '"Require MFA for administrative roles",Identity,4,8,To address,Moderate',
      '"Disable legacy authentication protocols",Apps,0,6,Not implemented,Low',
    ].join('\n');

    const summary = parseEnterpriseEvidenceCsv('m365-secure-score.csv', csv);

    expect(summary.source).toBe('m365_secure_score');
    expect(summary.rowCount).toBe(2);
    expect(summary.mappedStrategies).toContain('multi_factor_authentication');
    expect(summary.mappedStrategies).toContain('restrict_admin_privileges');
    expect(summary.suggestedControlKeywords).toContain('conditional access');
  });

  it('detects Entra authentication methods registration exports', () => {
    const csv = [
      'User Principal Name,MFA registered,MFA capable,Default MFA method,Methods registered',
      'alice@example.com,False,False,,',
      'bob@example.com,True,True,Microsoft Authenticator,appNotification',
    ].join('\n');

    const summary = parseEnterpriseEvidenceCsv('Authentication methods - User registration details.csv', csv);

    expect(summary.source).toBe('m365_entra_auth_methods');
    expect(summary.mappedStrategies).toEqual(['multi_factor_authentication']);
    expect(summary.findings[0].severity).toBe('high');
  });

  it('detects Google Workspace user security exports with 2-step verification columns', () => {
    const csv = [
      'Email,2-step verification enrollment,2-step verification enforcement,Admin,Suspended',
      'owner@example.com,Enrolled,Enforced,Super admin,False',
      'user@example.com,Not enrolled,Not enforced,False,False',
    ].join('\n');

    const summary = parseEnterpriseEvidenceCsv('google-workspace-users.csv', csv);

    expect(summary.source).toBe('google_workspace_security');
    expect(summary.mappedStrategies).toContain('multi_factor_authentication');
    expect(summary.mappedStrategies).toContain('restrict_admin_privileges');
  });
});
