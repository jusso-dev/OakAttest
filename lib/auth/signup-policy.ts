export function isPublicSignupEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.ALLOW_PUBLIC_SIGNUP?.trim().toLowerCase() === 'true';
}
