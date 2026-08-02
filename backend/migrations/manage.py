from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import create_engine

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.database import build_database_url  # noqa: E402
from migrations.runner import check, rollback_one, status, upgrade  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage reviewed CFS Product V1 migrations.")
    parser.add_argument("command", choices=("status", "check", "upgrade", "rollback-one"))
    parser.add_argument("--database-url", help="Explicit disposable or deployment database URL.")
    parser.add_argument("--allow-cfs-dev-rollback", action="store_true")
    args = parser.parse_args()
    engine = create_engine(args.database_url or build_database_url(get_settings()), pool_pre_ping=True)
    if args.command == "status":
        result = status(engine)
    elif args.command == "check":
        result = check(engine)
    elif args.command == "upgrade":
        result = upgrade(engine)
    else:
        result = rollback_one(engine, allow_cfs_dev=args.allow_cfs_dev_rollback)
    print(json.dumps(result, indent=2, default=str))
    return 0 if args.command != "check" or result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
