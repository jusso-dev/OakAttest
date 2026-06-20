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
-- The catalogue tables (ism_controls etc.), `tenants`, `partners`, and
-- `partner_members` are intentionally excluded (global or partner-scoped).

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
