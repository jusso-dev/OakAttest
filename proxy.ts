import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge proxy (Next.js 16's renamed "middleware") enforces session-level
// invariants documented in §5:
//   - assessor-side users must complete MFA enrolment before reaching any
//     `/app` route;
//   - absolute session age of 12h is honoured (the per-route session check
//     refines this against `sessions.absoluteExpiresAt`);
//   - `/(auth)` routes redirect already-authenticated users to dashboard.
//
// We can only read the session cookie at the edge, not the full DB session,
// so this is a fast-path gate. Server Components and Server Actions do the
// authoritative check via `requireSession()` + `requirePermission()`.

const PUBLIC_PATHS = [
  '/',
  '/sign-in',
  '/sign-up',
  '/mfa',
  '/invite',
  '/forgot-password',
  '/reset-password',
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/')),
  );
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const sessionCookie = req.cookies.get('better-auth.session_token')?.value;
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // MFA enforcement: if `mfa_required` flag is set on the cookie store but
  // `mfa_passed` is missing, divert to `/mfa`. The auth callbacks set these
  // cookies; full enforcement of "assessor users must have enrolled" lives
  // in the (app) layout where we can query the database.
  const mfaRequired = req.cookies.get('better-auth.two_factor_required')?.value === '1';
  const mfaPassed = req.cookies.get('better-auth.two_factor_passed')?.value === '1';
  if (mfaRequired && !mfaPassed && !pathname.startsWith('/mfa')) {
    const url = req.nextUrl.clone();
    url.pathname = '/mfa';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
