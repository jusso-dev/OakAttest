import { describe, it, expect } from 'vitest';
import { parseManifest } from '@/lib/cve/manifest';

describe('manifest parsers', () => {
  it('reads npm package-lock.json packages map', () => {
    const json = JSON.stringify({
      name: 'app',
      lockfileVersion: 3,
      packages: {
        '': { name: 'app', version: '1.0.0' },
        'node_modules/lodash': { version: '4.17.21' },
        'node_modules/react': { version: '19.0.0' },
      },
    });
    const pins = parseManifest('package-lock.json', json);
    expect(pins).toEqual(
      expect.arrayContaining([
        { ecosystem: 'npm', name: 'lodash', version: '4.17.21' },
        { ecosystem: 'npm', name: 'react', version: '19.0.0' },
      ]),
    );
  });

  it('reads python requirements.txt', () => {
    const txt = 'Django==4.2.10\nrequests==2.31.0 # comments\nnumpy>=1.20  # not pinned';
    const pins = parseManifest('requirements.txt', txt);
    expect(pins).toEqual([
      { ecosystem: 'PyPI', name: 'Django', version: '4.2.10' },
      { ecosystem: 'PyPI', name: 'requests', version: '2.31.0' },
    ]);
  });

  it('reads Dockerfile FROM lines', () => {
    const docker = 'FROM node:20-alpine AS build\nFROM nginx:1.27.0';
    const pins = parseManifest('Dockerfile', docker);
    expect(pins).toEqual([
      { ecosystem: 'OCI', name: 'node', version: '20-alpine' },
      { ecosystem: 'OCI', name: 'nginx', version: '1.27.0' },
    ]);
  });

  it('reads Gemfile.lock SPECS section', () => {
    const lock = `
GEM
  remote: https://rubygems.org/
  specs:
    rails (7.1.0)
    nokogiri (1.16.0)

PLATFORMS
  ruby

DEPENDENCIES
  rails
`;
    const pins = parseManifest('Gemfile.lock', lock);
    expect(pins).toEqual([
      { ecosystem: 'RubyGems', name: 'rails', version: '7.1.0' },
      { ecosystem: 'RubyGems', name: 'nokogiri', version: '1.16.0' },
    ]);
  });

  it('reads CycloneDX SBOM', () => {
    const sbom = JSON.stringify({
      bomFormat: 'CycloneDX',
      components: [
        { name: 'lodash', version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21' },
        { name: 'requests', version: '2.31.0', purl: 'pkg:pypi/requests@2.31.0' },
      ],
    });
    const pins = parseManifest('app.cyclonedx.json', sbom);
    expect(pins).toEqual([
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21' },
      { ecosystem: 'PyPI', name: 'requests', version: '2.31.0' },
    ]);
  });
});
