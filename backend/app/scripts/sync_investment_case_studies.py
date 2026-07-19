"""Sync repository-backed CFS Investment case-study packages into the local workspace."""

from __future__ import annotations

import argparse
import json

from app.database import SessionLocal
from app.services.investment_case_study_service import sync_case_study


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync a repository-backed CFS Investment case study.")
    parser.add_argument("--case-study", required=True, help="Case-study slug, for example large-development-land.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report planned changes without writing.")
    parser.add_argument("--target", default="local", choices=["local"], help="Only local cfs_cloud_stage sync is supported in CASE-2.")
    args = parser.parse_args()

    with SessionLocal() as db:
        try:
            result = sync_case_study(db, args.case_study, dry_run=args.dry_run)
            if args.dry_run:
                db.rollback()
            else:
                db.commit()
        except Exception as exc:
            db.rollback()
            print(json.dumps({"status": "failed", "error": str(exc), "case_study": args.case_study}, indent=2))
            return 1
    print(json.dumps({"status": "ok", **_summary(result)}, indent=2, default=str))
    return 0


def _summary(result: dict) -> dict:
    case_study = result.get("case_study") or {}
    return {
        **result,
        "case_study": {
            "active_parcel_id": case_study.get("active_parcel_id"),
            "candidate_count": case_study.get("candidate_count"),
            "current_stage": case_study.get("current_stage"),
            "engagement_id": case_study.get("engagement_id"),
            "priority_candidate_id": case_study.get("priority_candidate_id"),
            "slug": case_study.get("slug"),
            "status": case_study.get("status"),
            "title": case_study.get("title"),
        },
    }


if __name__ == "__main__":
    raise SystemExit(main())
