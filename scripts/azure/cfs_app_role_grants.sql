-- Run as migration/admin after restore validation.
-- Login secrets must be supplied out of band.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfs_readonly') THEN
    CREATE ROLE cfs_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfs_app') THEN
    CREATE ROLE cfs_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE cfs_cloud TO cfs_readonly, cfs_app;
GRANT USAGE ON SCHEMA public TO cfs_readonly, cfs_app;

DO $$
DECLARE
  rel record;
BEGIN
  FOR rel IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.objid = c.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE %I.%I TO cfs_readonly, cfs_app', rel.nspname, rel.relname);
    IF rel.relkind IN ('r', 'p') THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM cfs_readonly, cfs_app',
        rel.nspname,
        rel.relname
      );
    END IF;
  END LOOP;

  FOR rel IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.objid = c.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO cfs_app', rel.nspname, rel.relname);
    EXECUTE format('REVOKE USAGE, SELECT, UPDATE ON SEQUENCE %I.%I FROM cfs_readonly', rel.nspname, rel.relname);
  END LOOP;
END $$;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.investment_candidate_intake,
  public.investment_saved_item,
  public.investment_recent_work,
  public.investment_saved_search,
  public.investment_engagement,
  public.investment_underwriting_scenario
TO cfs_app;

-- Reports and due-diligence packet workflows currently use generated payloads
-- plus saved-item/report-bucket records. Add tables here only when a new
-- persistent report table is introduced and validated.
