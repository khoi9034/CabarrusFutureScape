from __future__ import annotations

from sqlalchemy.engine import Connection

from app.product.models import audit_events, product_metadata

revision = "0001_product_v1"
down_revision: str | None = None
IMMUTABLE_FUNCTION = "cfs_product_v1_0001_reject_immutable_mutation"
POSTGRES_IMMUTABLE_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {IMMUTABLE_FUNCTION}()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING MESSAGE = TG_TABLE_NAME || ' is append-only/immutable';
END $$
"""


def upgrade(connection: Connection) -> None:
    """Create only missing Product V1 objects; authoritative data is untouched."""

    product_metadata.create_all(connection, checkfirst=True)
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql(
            """
            CREATE TRIGGER IF NOT EXISTS cfs_audit_no_update
            BEFORE UPDATE ON audit_events
            BEGIN SELECT RAISE(ABORT, 'audit_events are append-only'); END
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TRIGGER IF NOT EXISTS cfs_audit_no_delete
            BEFORE DELETE ON audit_events
            BEGIN SELECT RAISE(ABORT, 'audit_events are append-only'); END
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TRIGGER IF NOT EXISTS cfs_ingestion_no_update
            BEFORE UPDATE ON ingestion_runs
            BEGIN SELECT RAISE(ABORT, 'ingestion_runs are immutable'); END
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TRIGGER IF NOT EXISTS cfs_ingestion_no_delete
            BEFORE DELETE ON ingestion_runs
            BEGIN SELECT RAISE(ABORT, 'ingestion_runs are immutable'); END
            """
        )
    elif connection.dialect.name == "postgresql":
        # Avoid percent-style placeholders: psycopg parses them even for
        # exec_driver_sql before PostgreSQL sees the PL/pgSQL body.
        connection.exec_driver_sql(POSTGRES_IMMUTABLE_FUNCTION_SQL)
        connection.exec_driver_sql(
            """
            DROP TRIGGER IF EXISTS cfs_audit_no_mutation ON audit_events
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TRIGGER cfs_audit_no_mutation
            BEFORE UPDATE OR DELETE ON audit_events
            FOR EACH ROW EXECUTE FUNCTION cfs_product_v1_0001_reject_immutable_mutation()
            """
        )
        connection.exec_driver_sql("DROP TRIGGER IF EXISTS cfs_ingestion_no_mutation ON ingestion_runs")
        connection.exec_driver_sql(
            """
            CREATE TRIGGER cfs_ingestion_no_mutation
            BEFORE UPDATE OR DELETE ON ingestion_runs
            FOR EACH ROW EXECUTE FUNCTION cfs_product_v1_0001_reject_immutable_mutation()
            """
        )


def downgrade(connection: Connection) -> None:
    if connection.dialect.name == "postgresql":
        connection.exec_driver_sql("DROP TRIGGER IF EXISTS cfs_audit_no_mutation ON audit_events")
        connection.exec_driver_sql("DROP TRIGGER IF EXISTS cfs_ingestion_no_mutation ON ingestion_runs")
        connection.exec_driver_sql(
            f"DROP FUNCTION IF EXISTS {IMMUTABLE_FUNCTION}()"
        )
    product_metadata.drop_all(connection, checkfirst=True)


expected_tables = frozenset(product_metadata.tables) | {audit_events.name}
