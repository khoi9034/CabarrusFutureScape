"""Refresh Cabarrus ACS tract context for the Investment Panel.

Run from the backend import context, for example:
python -m app.scripts.refresh_investment_acs
"""

from __future__ import annotations

import argparse
import json

from app.database import SessionLocal
from app.services.investment_market_context_service import refresh_acs_market_context


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh ACS market context for Cabarrus investment candidates.")
    parser.add_argument("--year", type=int, default=None)
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            result = refresh_acs_market_context(db, **({"year": args.year} if args.year else {}))
            db.commit()
        except Exception as exc:
            db.rollback()
            message = str(exc)
            if "CENSUS_API_KEY" in message:
                message = "Census ACS API key is required by the current API response; set CENSUS_API_KEY."
            else:
                message = "ACS refresh failed before writing data. Check database connectivity and Census API key configuration."
            print(json.dumps({"status": "failed", "error": message, "last_good_data_preserved": True}, indent=2))
            return 1
    print(json.dumps({"status": "ok", **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
