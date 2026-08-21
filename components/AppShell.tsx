'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Settings,
  UserRoundCog,
  ScrollText,
  Palette,
  Globe,
  CalendarCheck,
  Database,
  Bot,
  Building2,
  ShieldCheck,
  Bell,
  Contact,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { BurlAssistant } from '@/components/burl/BurlAssistant';
import { SignOutButton } from '@/components/SignOutButton';
import { cn } from '@/lib/utils';
import type { BurlEngagementOption } from '@/lib/burl/context';
import { UserTimeZoneProvider } from '@/components/timezone/UserTimezone';

export function AppShell({
  children,
  tenantName,
  userName,
  userRole,
  userTimeZone,
  canUseTenantAdmin,
  isPlatformAdmin = false,
  isPartnerMember = false,
  tenants = [],
  activeTenantId,
  actingAs = null,
  unreadCount = 0,
  burlEngagements,
}: {
  children: React.ReactNode;
  tenantName: string;
  userName: string;
  userRole: string;
  userTimeZone: string;
  canUseTenantAdmin: boolean;
  isPlatformAdmin?: boolean;
  isPartnerMember?: boolean;
  tenants?: Array<{ id: string; name: string; direct: boolean }>;
  activeTenantId?: string;
  actingAs?: { tenantName: string; exitHref: string } | null;
  unreadCount?: number;
  burlEngagements: BurlEngagementOption[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem('oakattest:sidebar-collapsed') === 'true');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Close the mobile drawer on Escape, lock body scroll while open, and move
  // focus into the drawer; restore the trigger on close.
  useEffect(() => {
    if (!mobileOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const drawerClose = document.getElementById('mobile-drawer-close');
    drawerClose?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('oakattest:sidebar-collapsed', String(next));
      return next;
    });
  }

  // Nav links, shared by the desktop sidebar and the mobile drawer. In the
  // drawer, clicking a link closes it.
  const navLinks = (linkCollapsed: boolean, onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1 text-sm" onClick={onNavigate}>
      <SidebarLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" collapsed={linkCollapsed} />
      <SidebarLink
        href="/notifications"
        icon={Bell}
        label="Notifications"
        collapsed={linkCollapsed}
        badge={unreadCount}
      />
      <SidebarLink href="/burl" icon={Bot} label="Burl" collapsed={linkCollapsed} />
      <SidebarLink href="/settings/profile" icon={UserRoundCog} label="Profile settings" collapsed={linkCollapsed} />

      {(isPlatformAdmin || isPartnerMember) && (
        <>
          <SidebarSection label="Platform" collapsed={linkCollapsed} />
          {isPlatformAdmin && (
            <SidebarLink href="/owner" icon={ShieldCheck} label="Owner console" collapsed={linkCollapsed} />
          )}
          {isPartnerMember && (
            <SidebarLink href="/partner" icon={Building2} label="MSP console" collapsed={linkCollapsed} />
          )}
        </>
      )}

      {canUseTenantAdmin && (
        <>
          <SidebarSection label="Admin" collapsed={linkCollapsed} />
          <SidebarLink href="/admin" icon={Settings} label="Tenant admin" collapsed={linkCollapsed} />
          <SidebarLink href="/clients" icon={Contact} label="Clients" collapsed={linkCollapsed} />
          <SidebarLink href="/admin/compliance" icon={CalendarCheck} label="Compliance" collapsed={linkCollapsed} />
          <SidebarLink href="/admin/frameworks" icon={Database} label="Frameworks" collapsed={linkCollapsed} />
          <SidebarLink href="/admin/audit" icon={ScrollText} label="Audit log" collapsed={linkCollapsed} />
          <SidebarLink href="/admin/branding" icon={Palette} label="Branding" collapsed={linkCollapsed} />
          <SidebarLink href="/admin/ip-allowlist" icon={Globe} label="IP allowlist" collapsed={linkCollapsed} />
        </>
      )}
    </nav>
  );

  return (
    <UserTimeZoneProvider timeZone={userTimeZone}>
    <div className="flex min-h-dvh bg-[var(--background)] text-slate-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-[var(--oak-shield)] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col overflow-y-auto border-r border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-6">
            <div className="mb-6 flex items-center justify-between">
              <BrandLogo variant="compact" imageClassName="h-9" />
              <button
                id="mobile-drawer-close"
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {tenants.length > 0 && activeTenantId ? (
              <div className="mb-4">
                <TenantSwitcher tenants={tenants} activeTenantId={activeTenantId} />
              </div>
            ) : (
              <p className="mb-4 truncate text-sm font-semibold text-slate-950">{tenantName}</p>
            )}
            {navLinks(false, () => setMobileOpen(false))}
            <div className="mt-auto border-t border-[var(--field-border)] pt-5 text-xs text-slate-700">
              <p>
                Signed in as <span className="font-semibold text-slate-950">{userName}</span>
              </p>
              <Link href="/settings/profile" className="mt-1 block text-[var(--oak-shield)] underline">
                Timezone {userTimeZone}
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>
      )}

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
          ) : tenants.length > 0 && activeTenantId ? (
            <TenantSwitcher tenants={tenants} activeTenantId={activeTenantId} />
          ) : (
            <p className="mt-3 truncate text-sm font-semibold text-slate-950">{tenantName}</p>
          )}
        </div>
        {navLinks(collapsed)}
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
              <Link href="/settings/profile" className="mt-1 block truncate text-[var(--oak-shield)] underline">
                Timezone {userTimeZone}
              </Link>
            </>
          )}
          <SignOutButton compact={collapsed} />
        </div>
      </aside>
      <main id="main-content" className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo variant="mark" imageClassName="h-7" />
          <span className="truncate text-sm font-semibold text-slate-950">{tenantName}</span>
          <Link
            href="/notifications"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            className="relative ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist)]"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--oak-shield)] px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        </div>
        {actingAs && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900 md:px-10">
            <span>
              Acting in <strong>{actingAs.tenantName}</strong> — you are managing this client&apos;s
              workspace.
            </span>
            <a
              href={actingAs.exitHref}
              className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Exit to console
            </a>
          </div>
        )}
        <div className="p-6 md:p-10">{children}</div>
      </main>
      <BurlAssistant mode="popup" engagements={burlEngagements} />
    </div>
    </UserTimeZoneProvider>
  );
}

function SidebarSection({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="my-1.5 border-t border-[var(--field-border)]" aria-hidden />;
  }
  return (
    <p className="mt-4 mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-500">
      {label}
    </p>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  collapsed,
  badge = 0,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  badge?: number;
}) {
  const showBadge = badge > 0;
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-slate-800 transition-colors hover:bg-[var(--oak-mist)] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]',
        collapsed && 'justify-center px-2',
      )}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? `${label}${showBadge ? ` (${badge} unread)` : ''}` : undefined}
    >
      <span className="relative">
        <Icon className="h-4 w-4 text-[var(--oak-shield)]" />
        {showBadge && collapsed && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--oak-shield)] px-1 text-[9px] font-semibold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && showBadge && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--oak-shield)] px-1.5 text-xs font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
