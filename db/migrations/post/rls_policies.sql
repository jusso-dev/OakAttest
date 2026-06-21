-- Row-Level Security (defence-in-depth) for tenant isolation.
-- Companion to docs/saas/oakattest-tenancy-model.md §12 and
-- docs/saas/msp-hosting-readiness.md §3.1.
--
-- Applied as a post-migration hook (like audit_log_grants.sql). Idempotent.
--
-- Model:
--   * The app connects as `oakattest_app`, a NON-owner role, so these policies
--     are enforced for it (the table owner / migration role bypasses RLS).
--     `oakattest_app` MUST NOT have the BYPASSRLS attribute.
--   * Isolation is keyed to the `app.current_tenant_id` GUC, set per request by
--     `runWithTenantScope()` (lib/db/scoped.ts), which issues
--     `set_config('app.current_tenant_id', <tenantId>, true)` inside a tx.
--
-- GRADUAL ADOPTION (non-breaking): the policy is PERMISSIVE when the GUC is
-- unset — a query that does NOT run inside `runWithTenantScope()` sees all rows
-- exactly as before. As tenant-scoped reads/writes are migrated onto
-- `runWithTenantScope()`, the database begins enforcing isolation for them.
-- To make isolation MANDATORY (recommended once all tenant-scoped reads are
-- routed through the helper), remove the
-- `current_setting('app.current_tenant_id', true) IS NULL OR` escape from each
-- policy and re-run this script.
--
-- Applies to every BASE TABLE in `public` that carries a `tenant_id` column.
-- The catalogue tables (framework_controls, framework_imports, frameworks),
-- `tenants`, `partners`, and `partner_members` are intentionally excluded
-- (global or partner-scoped; they carry no tenant_id).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
      -- Catalogue tables carry a NULLABLE tenant_id (NULL = global catalogue
      -- shared by all tenants). They get a bespoke NULL-aware policy below.
      AND c.table_name NOT IN ('framework_controls', 'framework_imports')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I'
      || ' USING (current_setting(''app.current_tenant_id'', true) IS NULL'
      || '        OR tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)'
      || ' WITH CHECK (current_setting(''app.current_tenant_id'', true) IS NULL'
      || '        OR tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      r.table_name
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- Catalogue tables: a global row (tenant_id IS NULL) is visible to every
-- tenant; a client-imported row is visible only to its owning tenant. This
-- keeps the shared ISM/NIST catalogue readable under tenant scope while
-- isolating licensed SOC 2 / ISO 27001 content.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['framework_controls', 'framework_imports']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS catalogue_isolation ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY catalogue_isolation ON public.%I'
      || ' USING (tenant_id IS NULL'
      || '        OR current_setting(''app.current_tenant_id'', true) IS NULL'
      || '        OR tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)'
      || ' WITH CHECK (tenant_id IS NULL'
      || '        OR current_setting(''app.current_tenant_id'', true) IS NULL'
      || '        OR tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END
$$;
