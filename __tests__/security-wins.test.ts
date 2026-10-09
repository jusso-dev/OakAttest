import { describe, expect, it } from 'vitest';
import { invitationEmailMatches } from '@/lib/auth/invitation-email';
import { pendingEvidenceSha } from '@/lib/evidence/pending-sha';
import { decideCanCreateUser, type Entitlements } from '@/lib/licensing';
import { neutraliseCsvCell, toCsv } from '@/lib/security/csv';
import { clientIpFromHeaders, ipAllowed, ipMatchesCidr } from '@/lib/security/ip-allowlist';

function ent(userCount: number, maxUsers: number | null): Entitlements {
  return {
    planCode: 'PROFESSIONAL',
    planName: 'Professional',
    unlimited: false,
    features: new Set(),
    limits: { maxUsers, maxFrameworks: 3, maxEntities: 3, maxStorageGb: 50 },
    usage: { userCount, entityCount: 0, frameworkCount: 0, storageBytes: 0 },
  };
}

describe('invitation email binding', () => {
  it('matches case and surrounding space', () => {
    expect(invitationEmailMatches(' Ada@Example.com ', 'ada@example.com')).toBe(true);
  });
  it('rejects a different mailbox', () => {
    expect(invitationEmailMatches('ada@example.com', 'bob@example.com')).toBe(false);
  });
  it('rejects a missing address', () => {
    expect(invitationEmailMatches('ada@example.com', null)).toBe(false);
  });
});

describe('pending evidence sha', () => {
  it('is unique per evidence item so two filenames do not collide on pending', () => {
    expect(pendingEvidenceSha('item-a')).toBe('pending:item-a');
    expect(pendingEvidenceSha('item-a')).not.toBe(pendingEvidenceSha('item-b'));
    expect(pendingEvidenceSha('item-a')).not.toBe('pending');
  });
});

describe('seat check for an existing member', () => {
  it('blocks a new user at the cap', () => {
    expect(decideCanCreateUser(ent(2, 2))).toBe(false);
  });
  it('does not consume a seat for someone already counted', () => {
    expect(decideCanCreateUser(ent(2, 2), { existingMember: true })).toBe(true);
  });
});

describe('csv formula neutralisation', () => {
  it('prefixes formula triggers', () => {
    expect(neutraliseCsvCell('=cmd|calc')).toBe("'=cmd|calc");
    expect(neutraliseCsvCell('+1')).toBe("'+1");
    expect(neutraliseCsvCell('-1')).toBe("'-1");
    expect(neutraliseCsvCell('@sum')).toBe("'@sum");
    expect(neutraliseCsvCell('\t=1')).toBe("'\t=1");
  });
  it('quotes commas and embedded quotes', () => {
    expect(toCsv(['name'], [{ name: 'a, "b"' }])).toBe('name\n"a, ""b"""');
  });
});

describe('ipv4 allowlist', () => {
  it('allows every address when the list is empty', () => {
    expect(ipAllowed('203.0.113.8', [])).toBe(true);
    expect(ipAllowed(null, [])).toBe(true);
  });
  it('denies a missing address when the list is set', () => {
    expect(ipAllowed(null, ['10.0.0.0/8'])).toBe(false);
    expect(ipAllowed(undefined, ['10.0.0.0/8'])).toBe(false);
  });
  it('matches a CIDR and rejects an outsider', () => {
    expect(ipMatchesCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipAllowed('192.0.2.10', ['10.0.0.0/8'])).toBe(false);
    expect(ipAllowed('10.9.9.9', ['10.0.0.0/8'])).toBe(true);
  });
  it('reads the first forwarded address', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.5');
  });
});
