import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';

describe('auth proxy session cookie detection', () => {
  it.each([
    '__Secure-better-auth.session_token=session-value',
    'better-auth.session_token=session-value',
  ])('allows a request carrying %s', (cookie) => {
    const request = new NextRequest('https://oakattest.example/', {
      headers: { cookie },
    });

    const response = proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects a request without a session cookie to sign in', () => {
    const request = new NextRequest('https://oakattest.example/engagements');

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://oakattest.example/signin?next=%2Fengagements',
    );
  });
});
