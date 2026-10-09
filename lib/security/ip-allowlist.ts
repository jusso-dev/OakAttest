export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split('/');
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base ?? '');
  if (ipInt == null || baseInt == null) return false;
  const prefix = prefixText == null || prefixText === '' ? 32 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** Empty allowlist means every address is allowed. */
export function ipAllowed(ip: string | null | undefined, cidrs: readonly string[]): boolean {
  if (cidrs.length === 0) return true;
  if (!ip) return false;
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}

export function clientIpFromHeaders(headerList: { get(name: string): string | null }): string | null {
  const forwarded = headerList.get('x-forwarded-for') ?? headerList.get('x-real-ip');
  if (!forwarded) return null;
  const first = forwarded.split(',')[0]?.trim() ?? '';
  return first || null;
}
