"""Refresh Investment Panel environmental parcel summaries.

Run from the backend import context:
python -m app.scripts.refresh_investment_environmental --source all
"""

from __future__ import annotations

import argparse
import json

from app.database import SessionLocal
from app.services.investment_environmental_context_service import refresh_environmental_context


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh environmental screening context for Investment Panel candidates.")
    parser.add_argument("--source", choices=["all", "nwi", "terrain", "slope", "soils", "epa", "summaries"], default="all")
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            result = refresh_environmental_context(db, source=args.source)
            db.commit()
        except Exception as exc:
            db.rollback()
            print(json.dumps({"status": "failed", "error": str(exc), "last_good_data_preserved": True}, indent=2))
            return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
