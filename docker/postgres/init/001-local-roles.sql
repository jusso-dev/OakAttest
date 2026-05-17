CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
