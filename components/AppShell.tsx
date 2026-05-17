import Link from 'next/link';
import { LayoutDashboard, FolderKanban, Settings, ScrollText } from 'lucide-react';

export function AppShell({
  children,
  tenantName,
  userName,
}: {
  children: React.ReactNode;
  tenantName: string;
  userName: string;
}) {
  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white px-4 py-6 md:flex md:flex-col">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">OakAttest</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">{tenantName}</p>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarLink href="/engagements" icon={FolderKanban} label="Engagements" />
          <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" />
          <SidebarLink href="/admin" icon={Settings} label="Tenant admin" />
        </nav>
        <div className="mt-auto pt-6 text-xs text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{userName}</span>
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
      className="flex items-center gap-3 rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100"
    >
      <Icon className="h-4 w-4 text-slate-500" />
      {label}
    </Link>
  );
}
