from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_internal_operations_are_bounded_and_documented() -> None:
    readiness = (ROOT / "scripts/check-cfs-internal.ps1").read_text(encoding="utf-8")
    backup = (ROOT / "scripts/backup-cfs-database.ps1").read_text(encoding="utf-8")
    assert "/health/ready" in readiness
    assert "check_cfs_local_data.py" in readiness
    assert "CFS_BACKUP_DIRECTORY" in readiness
    assert "--format custom" in backup
    assert "--no-owner --no-acl" in backup
    assert "Get-FileHash -Algorithm SHA256" in backup
    assert "Database backups must be stored outside the repository" in backup
    for document in (
        "docs/PRODUCTION_READINESS.md",
        "docs/OPERATIONS_RUNBOOK.md",
        "docs/ARCHITECTURE.md",
        "docs/DATA_SOURCES.md",
        "docs/DEVELOPER_HANDOFF.md",
    ):
        assert (ROOT / document).is_file()
