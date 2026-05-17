import { describe, it, expect } from 'vitest';
import { parseScan, detectScanFormat } from '@/lib/scans/parse';

describe('vulnerability scan parsers', () => {
  it('detects Nessus XML by content', () => {
    expect(detectScanFormat('export.nessus', '<NessusClientData_v2>')).toBe('nessus');
  });

  it('parses Nessus ReportItem severity 4 as critical', () => {
    const xml = `<NessusClientData_v2><Report>
<ReportHost name="10.0.0.1">
<ReportItem pluginID="123" pluginName="OpenSSL Vulnerability" severity="4">
<description>A critical OpenSSL flaw.</description>
<solution>Upgrade to 3.0.13.</solution>
<cvss3_base_score>9.8</cvss3_base_score>
</ReportItem>
</ReportHost></Report></NessusClientData_v2>`;
    const findings = parseScan('export.nessus', xml);
    expect(findings).toEqual([
      expect.objectContaining({
        pluginId: '123',
        title: 'OpenSSL Vulnerability',
        severity: 'critical',
        cvssScore: 9.8,
        source: 'nessus',
      }),
    ]);
  });

  it('parses Qualys CSV', () => {
    const csv = `IP,DNS,Vulnerability,QID,Severity,CVSS3 Score,Threat,Solution
10.0.0.5,web.example,Outdated TLS,123456,4,7.5,Weak ciphers,Upgrade TLS config`;
    const findings = parseScan('qualys.csv', csv);
    expect(findings[0]).toMatchObject({
      host: '10.0.0.5',
      pluginId: '123456',
      title: 'Outdated TLS',
      severity: 'critical',
      cvssScore: 7.5,
      source: 'qualys',
    });
  });

  it('parses generic CSV with header case-insensitively', () => {
    const csv = `host,title,severity,cvss,description
api.example,Open admin port,HIGH,8.1,SSH exposed`;
    const findings = parseScan('scan.csv', csv);
    expect(findings[0]).toMatchObject({
      host: 'api.example',
      title: 'Open admin port',
      severity: 'high',
      cvssScore: 8.1,
      source: 'generic',
    });
  });
});
