import os


# Keep local test runs on the CFS dev PostGIS settings. Deployment DATABASE_URL
# belongs to backend hosting smoke tests, not the repository test suite.
os.environ.pop("DATABASE_URL", None)
