import atexit
import os
import shutil
import tempfile


# Tests are isolated by default. A disposable database must be opted into with
# CFS_TEST_DATABASE_URL; local cfs_dev credentials are never inherited.
test_database_url = os.environ.get("CFS_TEST_DATABASE_URL", "").strip()
os.environ["DATABASE_URL"] = test_database_url
os.environ["POSTGRES_PASSWORD"] = ""
os.environ["CFS_POSTGRES_PASSWORD"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["CFS_AI_ENABLED"] = "false"
os.environ["CFS_AI_PROVIDER"] = "none"
os.environ["CFS_STAGING_ACCESS_TOKEN"] = ""
if not test_database_url:
    os.environ["POSTGRES_DB"] = "cfs_pytest_disabled"

test_output_dir = tempfile.mkdtemp(prefix="cfs-pytest-")
os.environ["CFS_TEST_OUTPUT_DIR"] = test_output_dir
os.environ["CFS_ARTIFACT_ROOT"] = os.path.join(test_output_dir, "artifacts")
atexit.register(shutil.rmtree, test_output_dir, ignore_errors=True)
