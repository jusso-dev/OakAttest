import { describe, expect, it } from 'vitest';
import { resolveOscalProfile } from '@/lib/frameworks/profile';

const catalogue = ['ac-1', 'ac-2', 'ac-2.1', 'au-1', 'ia-2'].map((controlId) => ({ controlId }));

describe('OSCAL framework profile resolution', () => {
  it('resolves explicit controls and child controls in catalogue order', () => {
    const result = resolveOscalProfile({ profile: {
      metadata: { title: 'Moderate baseline', version: '1.2.0', 'last-modified': '2026-01-02T00:00:00Z' },
      imports: [{ 'include-controls': [{ 'with-ids': ['ac-2'], 'with-child-controls': 'yes' }, { 'with-ids': ['ia-2'] }] }],
    } }, catalogue);
    expect(result.controlIds).toEqual(['ac-2', 'ac-2.1', 'ia-2']);
    expect(result.title).toBe('Moderate baseline');
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.modifications).toBeNull();
  });

  it('retains OSCAL modification directives and warns that prose is unchanged', () => {
    const modify = { 'set-parameters': [{ 'param-id': 'ac-1_prm_1', values: ['annually'] }] };
    const source = JSON.stringify({ profile: {
      metadata: { title: 'Parameterised baseline' },
      imports: [{ 'include-controls': [{ 'with-ids': ['ac-1'] }] }],
      modify,
    } });
    const result = resolveOscalProfile(JSON.parse(source), catalogue, source);
    expect(result.modifications).toEqual(modify);
    expect(result.warnings).toContainEqual(expect.stringContaining('retained as pack metadata'));
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('supports OSCAL glob matching without treating patterns as regular expressions', () => {
    const result = resolveOscalProfile({ profile: {
      metadata: { title: 'AC baseline' },
      imports: [{ 'include-controls': [{ matching: [{ pattern: 'ac-*' }] }] }],
    } }, catalogue);
    expect(result.controlIds).toEqual(['ac-1', 'ac-2', 'ac-2.1']);
    expect(() => resolveOscalProfile({ profile: {
      imports: [{ 'include-controls': [{ matching: [{ pattern: '^ac-' }] }] }],
    } }, catalogue)).toThrow('zero controls');
  });

  it('supports include-all, exclusions, and missing-ID warnings', () => {
    const result = resolveOscalProfile({ profile: {
      metadata: { title: 'Tailored baseline' },
      imports: [{
        'include-all': {},
        'include-controls': [{ 'with-ids': ['missing-1'] }],
        'exclude-controls': [{ 'with-ids': ['ac-1'] }],
      }],
    } }, catalogue);
    expect(result.controlIds).not.toContain('ac-1');
    expect(result.controlIds).toContain('au-1');
    expect(result.warnings[0]).toContain('missing-1');
  });

  it('rejects malformed, selector-free, and empty profiles', () => {
    expect(() => resolveOscalProfile({}, catalogue)).toThrow('profile object');
    expect(() => resolveOscalProfile({ profile: { imports: [{}] } }, catalogue)).toThrow('no supported');
    expect(() => resolveOscalProfile({ profile: { imports: [{ 'include-controls': [{ 'with-ids': ['missing'] }] }] } }, catalogue)).toThrow('zero controls');
  });
});
