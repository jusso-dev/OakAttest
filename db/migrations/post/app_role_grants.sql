-- Create the login role used by the application. Migrations connect with the
-- separate owner URL so the application cannot alter schema or bypass RLS.
SELECT format('CREATE ROLE oakattest_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oakattest_app')
\gexec

SELECT format('ALTER ROLE oakattest_app LOGIN PASSWORD %L', :'app_password')
\gexec

ALTER ROLE oakattest_app
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE :DBNAME TO oakattest_app;
GRANT USAGE ON SCHEMA public TO oakattest_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oakattest_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO oakattest_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oakattest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO oakattest_app;
