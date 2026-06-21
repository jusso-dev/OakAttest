import { and, desc, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { partners, partnerMembers, partnerInvitations } from '@/db/schema/partners';
import { tenants } from '@/db/schema/tenants';
import { requirePageSession } from '@/lib/auth/session';
import { isPlatformAdmin } from '@/lib/auth/platform';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ProvisionPartnerForm } from '@/components/partner/ProvisionPartnerForm';
import { InvitePartnerMemberForm } from '@/components/partner/InvitePartnerMemberForm';
import { RevokeInviteButton } from '@/components/partner/RevokeInviteButton';
import { DropIntoButton } from '@/components/partner/DropIntoButton';

export const metadata = { title: 'Platform owner · OakAttest' };

export default async function OwnerConsolePage() {
  const session = await requirePageSession();
  if (!(await isPlatformAdmin(session.user.id))) redirect('/dashboard');

  const partnerRows = await db
    .select({ id: partners.id, name: partners.name, slug: partners.slug, billingEmail: partners.billingEmail })
    .from(partners)
    .where(isNull(partners.deletedAt))
    .orderBy(partners.name);

  // Every tenant on the instance, so the owner can drop into any of them —
  // including self-managed (direct) tenants not under an MSP.
  const allTenants = await db
    .select({ id: tenants.id, name: tenants.name, partnerId: tenants.partnerId })
    .from(tenants)
    .where(isNull(tenants.deletedAt))
    .orderBy(tenants.name);
  const partnerNameById = new Map(partnerRows.map((p) => [p.id, p.name]));

  const sections = await Promise.all(
    partnerRows.map(async (p) => {
      const [clientTenants, members, pendingInvites] = await Promise.all([
        db
          .select({ id: tenants.id, name: tenants.name })
          .from(tenants)
          .where(and(eq(tenants.partnerId, p.id), isNull(tenants.deletedAt)))
          .orderBy(tenants.name),
        db
          .select({ userId: partnerMembers.userId, role: partnerMembers.role })
          .from(partnerMembers)
          .where(and(eq(partnerMembers.partnerId, p.id), isNull(partnerMembers.deletedAt))),
        db
          .select({ id: partnerInvitations.id, email: partnerInvitations.email, role: partnerInvitations.role })
          .from(partnerInvitations)
          .where(
            and(
              eq(partnerInvitations.partnerId, p.id),
              isNull(partnerInvitations.acceptedAt),
              isNull(partnerInvitations.revokedAt),
            ),
          )
          .orderBy(desc(partnerInvitations.createdAt)),
      ]);
      return { partner: p, clientTenants, members, pendingInvites };
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-xs uppercase text-slate-600">Platform owner</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">MSP partners</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are the platform superadmin. Provision MSP partners, invite their owners, and drop
          into any client tenant for support. Each MSP manages its own clients.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Provision an MSP</CardTitle>
          <CardDescription>
            Creates the partner workspace and emails an owner invitation. You do not become a
            member — the MSP owner runs their own workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionPartnerForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All tenants</CardTitle>
          <CardDescription>
            Every workspace on this instance. Drop into any tenant to manage it directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allTenants.length === 0 ? (
            <p className="text-sm text-slate-600">No tenants yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--field-border)]">
              {allTenants.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-900">
                    {t.name}
                    <span className="ml-2 text-xs text-slate-500">
                      {t.partnerId ? (partnerNameById.get(t.partnerId) ?? 'MSP') : 'Self-managed'}
                    </span>
                  </span>
                  <DropIntoButton tenantId={t.id} label="Drop in" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {sections.length === 0 ? (
        <p className="text-sm text-slate-600">No MSP partners yet. Provision one above.</p>
      ) : (
        sections.map(({ partner, clientTenants, members, pendingInvites }) => (
          <section key={partner.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{partner.name}</h2>
              <span className="text-xs uppercase text-slate-500">
                {members.length} member(s) · {clientTenants.length} client(s)
              </span>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Client tenants</CardTitle>
                <CardDescription>Drop into a tenant to manage it directly.</CardDescription>
              </CardHeader>
              <CardContent>
                {clientTenants.length === 0 ? (
                  <p className="text-sm text-slate-600">No client tenants yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--field-border)]">
                    {clientTenants.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-900">{t.name}</span>
                        <DropIntoButton tenantId={t.id} label="Drop in" />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invite MSP staff</CardTitle>
                <CardDescription>
                  {pendingInvites.length > 0 ? `${pendingInvites.length} pending invite(s).` : 'No pending invites.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingInvites.length > 0 && (
                  <ul className="divide-y divide-[var(--field-border)]">
                    {pendingInvites.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-sm text-slate-800">
                          {i.email} <span className="text-xs text-slate-500">· {i.role.replace('_', ' ')}</span>
                        </span>
                        <RevokeInviteButton partnerId={partner.id} invitationId={i.id} email={i.email} />
                      </li>
                    ))}
                  </ul>
                )}
                <InvitePartnerMemberForm partnerId={partner.id} />
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
