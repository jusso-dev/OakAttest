import { describe, it, expect } from 'vitest';
import {
  parseOscalCatalogue,
  iterateControls,
  extractMinClassification,
  extractStatementAndGuidance,
  extractEssentialEight,
} from '@/lib/ism/oscal';

const sample = {
  catalog: {
    metadata: { title: 'Test', version: '2025.03', 'last-modified': '2025-03-01' },
    groups: [
      {
        id: 'g1',
        title: 'Identification',
        controls: [
          {
            id: 'ISM-0001',
            title: 'MFA',
            props: [
              { name: 'classification', value: 'PROTECTED' },
              { name: 'essential-eight', value: 'multi-factor-authentication:ml2' },
            ],
            parts: [
              { name: 'statement', prose: 'Use MFA for privileged users.' },
              { name: 'guidance', prose: 'Prefer phishing-resistant factors.' },
            ],
          },
        ],
      },
      {
        id: 'g2',
        title: 'Patching',
        controls: [
          {
            id: 'ISM-1690',
            title: 'Patch OS',
            props: [{ name: 'classification', value: 'OFFICIAL' }],
            parts: [{ name: 'statement', prose: 'Patch operating systems promptly.' }],
          },
        ],
      },
    ],
  },
};

describe('OSCAL parser', () => {
  it('parses a minimal catalogue', () => {
    const cat = parseOscalCatalogue(sample);
    expect(cat.catalog.metadata.version).toBe('2025.03');
  });

  it('iterates every control across groups', () => {
    const cat = parseOscalCatalogue(sample);
    const ids = iterateControls(cat).map((x) => x.control.id);
    expect(ids).toEqual(['ISM-0001', 'ISM-1690']);
  });

  it('extracts min classification from props', () => {
    const cat = parseOscalCatalogue(sample);
    const controls = iterateControls(cat);
    expect(extractMinClassification(controls[0].control)).toBe('PROTECTED');
    expect(extractMinClassification(controls[1].control)).toBe('OFFICIAL');
  });

  it('extracts statement and guidance from parts', () => {
    const cat = parseOscalCatalogue(sample);
    const [{ control }] = iterateControls(cat);
    const { description, guidance } = extractStatementAndGuidance(control);
    expect(description).toMatch(/MFA/);
    expect(guidance).toMatch(/phishing/);
  });

  it('extracts Essential Eight mapping when present', () => {
    const cat = parseOscalCatalogue(sample);
    const [{ control }] = iterateControls(cat);
    expect(extractEssentialEight(control)).toEqual([
      { strategy: 'multi-factor-authentication', maturityLevel: 2 },
    ]);
  });

  it('defaults to OFFICIAL when no classification prop is found', () => {
    const cat = parseOscalCatalogue({
      catalog: {
        metadata: { version: '2025.03' },
        controls: [
          {
            id: 'ISM-UNKNOWN',
            title: 'Untagged',
            parts: [{ name: 'statement', prose: 'No prop.' }],
          },
        ],
      },
    });
    const [{ control }] = iterateControls(cat);
    expect(extractMinClassification(control)).toBe('OFFICIAL');
  });
});
