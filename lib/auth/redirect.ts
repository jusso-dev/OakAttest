export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith('/') || next.startsWith('//')) return '/';

  try {
    const url = new URL(next, 'https://oakattest.invalid');
    return url.origin === 'https://oakattest.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}
