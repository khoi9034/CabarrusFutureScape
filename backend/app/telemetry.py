from app.config import Settings


def configure_telemetry(settings: Settings) -> None:
    if not settings.cfs_telemetry_enabled or not settings.applicationinsights_connection_string:
        return

    from azure.monitor.opentelemetry import configure_azure_monitor

    configure_azure_monitor(connection_string=settings.applicationinsights_connection_string)
