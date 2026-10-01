from app.services.live_refresh import enabled


def test_live_refresh_is_opt_in_and_never_enabled_for_presentation_cache():
    class Settings:
        cfs_runtime_mode = "local"
        cfs_presentation_cache_enabled = False
        cfs_live_refresh_enabled = True

    assert enabled(Settings()) is True
    Settings.cfs_presentation_cache_enabled = True
    assert enabled(Settings()) is False
    Settings.cfs_presentation_cache_enabled = False
    Settings.cfs_runtime_mode = "demo"
    assert enabled(Settings()) is False
