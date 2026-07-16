\set ON_ERROR_STOP on
SET client_min_messages TO warning;

SELECT pg_catalog.pgaadauth_create_principal_with_oid(:'principal_name', :'object_id', 'service', false, false)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pgaadauth_list_principals(false)
  WHERE rolname = :'principal_name'
);

ALTER ROLE :"principal_name" INHERIT;
GRANT cfs_app TO :"principal_name";
