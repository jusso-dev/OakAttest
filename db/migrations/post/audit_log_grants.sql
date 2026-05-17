-- Applied after every migration to enforce the audit log invariant (§6, §15).
--
-- Two database roles are expected:
--   * oakattest_app  -- used by the running application; INSERT + SELECT only.
--   * oakattest_audit -- used by the audit viewer and exports; SELECT only.
--
-- These grants are idempotent. Run via `drizzle-kit` post-migration hook or
-- via the `db:postdeploy` npm script.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oakattest_app') THEN
    CREATE ROLE oakattest_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oakattest_audit') THEN
    CREATE ROLE oakattest_audit NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON TABLE audit_log FROM PUBLIC;
REVOKE ALL ON TABLE audit_log FROM oakattest_app;
REVOKE ALL ON TABLE audit_log FROM oakattest_audit;

GRANT INSERT, SELECT ON TABLE audit_log TO oakattest_app;
GRANT SELECT ON TABLE audit_log TO oakattest_audit;

-- Belt and braces: a trigger that refuses UPDATE and DELETE even if a future
-- migration accidentally regrants them.
CREATE OR REPLACE FUNCTION audit_log_no_mutate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_block_update ON audit_log;
CREATE TRIGGER audit_log_block_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_no_mutate();
