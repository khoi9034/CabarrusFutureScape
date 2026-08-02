from __future__ import annotations

import os
import re
from collections.abc import Generator
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.product.models import organizations, users
from app.product.principal import ProductPrincipal, Role
from migrations.runner import upgrade


@pytest.fixture
def product_engine():
    test_database_url = os.getenv("CFS_TEST_DATABASE_URL", "").strip()
    if test_database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        database_url = make_url(test_database_url)
        if database_url.drivername == "postgresql":
            database_url = database_url.set(drivername="postgresql+psycopg")
        schema = f"cfs_product_test_{uuid4().hex}"
        admin_engine = create_engine(database_url, pool_pre_ping=True)
        with admin_engine.begin() as connection:
            connection.execute(CreateSchema(schema))
        engine = create_engine(database_url, pool_pre_ping=True)

        @event.listens_for(engine, "connect")
        def select_isolated_schema(connection, _record) -> None:
            cursor = connection.cursor()
            cursor.execute(f'SET search_path TO "{schema}"')
            cursor.close()

        try:
            upgrade(engine)
            yield engine
        finally:
            engine.dispose()
            if not re.fullmatch(r"cfs_product_test_[0-9a-f]{32}", schema):
                raise RuntimeError("Refusing to drop an unrecognized test schema name.")
            with admin_engine.begin() as connection:
                connection.execute(DropSchema(schema, cascade=True, if_exists=True))
            admin_engine.dispose()
        return

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    upgrade(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(product_engine):
    return sessionmaker(bind=product_engine, expire_on_commit=False, class_=Session)


@pytest.fixture
def product_session(session_factory) -> Generator[Session, None, None]:
    session = session_factory()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture
def identities(product_session: Session) -> dict[str, str]:
    values = {
        "organization_id": "00000000-0000-0000-0000-000000000001",
        "other_organization_id": "00000000-0000-0000-0000-000000000002",
        "user_id": "00000000-0000-0000-0000-000000000010",
        "other_user_id": "00000000-0000-0000-0000-000000000020",
    }
    product_session.execute(
        organizations.insert(),
        [
            {"id": values["organization_id"], "name": "CFS Test", "slug": "cfs-test"},
            {"id": values["other_organization_id"], "name": "Other Test", "slug": "other-test"},
        ],
    )
    product_session.execute(
        users.insert(),
        [
            {
                "id": values["user_id"],
                "organization_id": values["organization_id"],
                "external_subject": "test-user",
                "display_name": "Test User",
                "roles": [Role.ADMINISTRATOR.value],
            },
            {
                "id": values["other_user_id"],
                "organization_id": values["other_organization_id"],
                "external_subject": "other-user",
                "display_name": "Other User",
                "roles": [Role.VIEWER.value],
            },
        ],
    )
    product_session.commit()
    return values


@pytest.fixture
def principal_factory(identities):
    def build(
        *roles: Role,
        project_ids: frozenset[str] = frozenset(),
        other_organization: bool = False,
    ) -> ProductPrincipal:
        return ProductPrincipal(
            subject="test-principal",
            roles=frozenset(roles or (Role.ADMINISTRATOR,)),
            organization_id=(
                identities["other_organization_id"]
                if other_organization
                else identities["organization_id"]
            ),
            user_id=(identities["other_user_id"] if other_organization else identities["user_id"]),
            project_ids=project_ids,
            authenticated=True,
        )

    return build
