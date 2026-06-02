from app.core.contracts import DEVELOPMENT_TEMPORAL_QUERY_SPECIFICATION


class TemporalService:
    """Read-only temporal analytics service boundary."""

    contract_documents = (DEVELOPMENT_TEMPORAL_QUERY_SPECIFICATION,)

    def get_trends(self) -> None:
        """TODO: Implement `GET /development/trends`."""
        raise NotImplementedError("Development trend endpoint logic is not implemented yet.")

    def run_temporal_query(self) -> None:
        """TODO: Implement `GET /development/temporal-query`."""
        raise NotImplementedError("Temporal query endpoint logic is not implemented yet.")
