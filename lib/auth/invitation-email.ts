export function invitationEmailMatches(
  invitationEmail: string | null | undefined,
  sessionEmail: string | null | undefined,
): boolean {
  if (!invitationEmail || !sessionEmail) return false;
  return invitationEmail.trim().toLowerCase() === sessionEmail.trim().toLowerCase();
}
