import Link from 'next/link';
import {
  LayoutDashboard,
  Settings,
  ScrollText,
  Palette,
  Globe,
  CalendarCheck,
  Database,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { SignOutButton } from '@/components/SignOutButton';

export function AppShell({
  children,
  tenantName,
  userName,
  userRole,
  canUseTenantAdmin,
}: {
  children: React.ReactNode;
  tenantName: string;
  userName: string;
  userRole: string;
  canUseTenantAdmin: boolean;
}) {
  return (
    <div className="flex min-h-dvh bg-[var(--background)] text-slate-950">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-6 md:flex md:flex-col">
        <div className="mb-8 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] px-3 py-3">
          <BrandLogo imageClassName="h-9" priority />
          <p className="mt-3 truncate text-sm font-semibold text-slate-950">{tenantName}</p>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          {canUseTenantAdmin && (
            <>
              <SidebarLink href="/admin/compliance" icon={CalendarCheck} label="Compliance" />
              <SidebarLink href="/admin/ism" icon={Database} label="ISM imports" />
              <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" />
              <SidebarLink href="/admin" icon={Settings} label="Members" />
              <SidebarLink href="/admin/branding" icon={Palette} label="Branding" />
              <SidebarLink href="/admin/ip-allowlist" icon={Globe} label="IP allowlist" />
            </>
          )}
        </nav>
        <p className="mt-6 text-xs uppercase text-slate-700">
          ⌘K to search engagements
        </p>
        <div className="mt-auto border-t border-[var(--field-border)] pt-5 text-xs text-slate-700">
          <p>
            Signed in as <span className="font-semibold text-slate-950">{userName}</span>
          </p>
          <p className="mt-1">
            Role <span className="font-semibold text-slate-950">{userRole}</span>
          </p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 md:p-10">{children}</main>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-slate-800 transition-colors hover:bg-[var(--oak-mist)] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
    >
      <Icon className="h-4 w-4 text-[var(--oak-shield)]" />
      {label}
    </Link>
  );
}
