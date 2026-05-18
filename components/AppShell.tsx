'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Settings,
  ScrollText,
  Palette,
  Globe,
  CalendarCheck,
  Database,
  Bot,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { BurlAssistant } from '@/components/burl/BurlAssistant';
import { SignOutButton } from '@/components/SignOutButton';
import { cn } from '@/lib/utils';
import type { BurlEngagementOption } from '@/lib/burl/context';

export function AppShell({
  children,
  tenantName,
  userName,
  userRole,
  canUseTenantAdmin,
  burlEngagements,
}: {
  children: React.ReactNode;
  tenantName: string;
  userName: string;
  userRole: string;
  canUseTenantAdmin: boolean;
  burlEngagements: BurlEngagementOption[];
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem('oakattest:sidebar-collapsed') === 'true');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('oakattest:sidebar-collapsed', String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh bg-[var(--background)] text-slate-950">
      <aside
        className={cn(
          'hidden shrink-0 border-r border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-6 transition-[width] duration-200 md:flex md:flex-col',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <div
          className={cn(
            'mb-6 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] px-3 py-3',
            collapsed && 'px-2',
          )}
        >
          <div className={cn('flex items-center justify-between gap-2', collapsed && 'justify-center')}>
            <BrandLogo
              variant={collapsed ? 'mark' : 'compact'}
              imageClassName="h-9"
              priority
            />
            {!collapsed && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : (
            <p className="mt-3 truncate text-sm font-semibold text-slate-950">{tenantName}</p>
          )}
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} />
          <SidebarLink href="/burl" icon={Bot} label="Burl" collapsed={collapsed} />
          {canUseTenantAdmin && (
            <>
              <SidebarLink href="/admin/compliance" icon={CalendarCheck} label="Compliance" collapsed={collapsed} />
              <SidebarLink href="/admin/ism" icon={Database} label="ISM imports" collapsed={collapsed} />
              <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" collapsed={collapsed} />
              <SidebarLink href="/admin" icon={Settings} label="Members" collapsed={collapsed} />
              <SidebarLink href="/admin/branding" icon={Palette} label="Branding" collapsed={collapsed} />
              <SidebarLink href="/admin/ip-allowlist" icon={Globe} label="IP allowlist" collapsed={collapsed} />
            </>
          )}
        </nav>
        <p className={cn('mt-6 text-xs uppercase text-slate-700', collapsed && 'sr-only')}>
          ⌘K to search engagements
        </p>
        <div className="mt-auto border-t border-[var(--field-border)] pt-5 text-xs text-slate-700">
          {!collapsed && (
            <>
              <p>
                Signed in as <span className="font-semibold text-slate-950">{userName}</span>
              </p>
              <p className="mt-1">
                Role <span className="font-semibold text-slate-950">{userRole}</span>
              </p>
            </>
          )}
          <SignOutButton compact={collapsed} />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 md:p-10">{children}</main>
      <BurlAssistant mode="popup" engagements={burlEngagements} />
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  collapsed,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-slate-800 transition-colors hover:bg-[var(--oak-mist)] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]',
        collapsed && 'justify-center px-2',
      )}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 text-[var(--oak-shield)]" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
