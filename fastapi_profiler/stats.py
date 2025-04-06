import json
from typing import Dict, List

from rustcore import PyAggregatedStats


class AggregatedStats:
    """Maintains incremental statistics for profiled requests."""

    def __init__(self, buffer_size: int = 10000):
        self._impl = PyAggregatedStats(buffer_size)

        # Database statistics
        # TODO: move this juicer to rustcore
        self.db_stats = {
            "total_time": 0.0,
            "query_count": 0,
            "avg_time": 0.0,
            "max_time": 0.0,
            "min_time": float("inf"),
        }

        # Engine-specific statistics
        self.engine_stats = {}

    def update(self, profile: Dict):
        """Update statistics with a new profile."""
        self._impl.update(json.dumps(profile))

        # Update database statistics
        db_time = profile.get("db_time", 0)
        db_count = profile.get("db_count", 0)

        if db_count > 0:
            self.db_stats["total_time"] += db_time
            self.db_stats["query_count"] += db_count

            # Update max/min times
            self.db_stats["max_time"] = max(self.db_stats["max_time"], db_time)

            # Only update min time if we have queries
            if db_time > 0:
                self.db_stats["min_time"] = min(self.db_stats["min_time"], db_time)

            # Recalculate average
            if self.db_stats["query_count"] > 0:
                self.db_stats["avg_time"] = (
                    self.db_stats["total_time"] / self.db_stats["query_count"]
                )

            # Update engine-specific statistics if db_queries are available
            if "db_queries" in profile:
                for query in profile["db_queries"]:
                    if "metadata" in query and "dialect" in query["metadata"]:
                        engine_name = query["metadata"].get(
                            "name", query["metadata"]["dialect"]
                        )

                        # Initialize engine stats if not exists
                        if engine_name not in self.engine_stats:
                            self.engine_stats[engine_name] = {
                                "total_time": 0.0,
                                "query_count": 0,
                                "avg_time": 0.0,
                                "max_time": 0.0,
                                "min_time": float("inf"),
                                "dialect": query["metadata"]["dialect"],
                                "url": query["metadata"].get("url", "unknown"),
                            }

                        # Update engine stats
                        engine = self.engine_stats[engine_name]
                        query_time = query["duration"]

                        engine["total_time"] += query_time
                        engine["query_count"] += 1
                        engine["max_time"] = max(engine["max_time"], query_time)

                        if query_time > 0:
                            engine["min_time"] = min(engine["min_time"], query_time)

                        if engine["query_count"] > 0:
                            engine["avg_time"] = (
                                engine["total_time"] / engine["query_count"]
                            )

    def get_percentile(self, percentile: float) -> float:
        """Calculate the specified percentile of response times."""
        return self._impl.get_percentile(percentile)

    def get_endpoint_stats(self) -> List[Dict]:
        """Get calculated endpoint statistics."""
        return json.loads(self._impl.get_endpoint_stats())

    def get_slowest_endpoints(self, limit: int = 5) -> List[Dict]:
        """Get the slowest endpoints by average response time."""
        return json.loads(self._impl.get_slowest_endpoints(limit))

    def get_method_distribution(self) -> List[Dict]:
        """Get the distribution of requests by HTTP method."""
        return json.loads(self._impl.get_method_distribution())

    def get_endpoint_distribution(self, limit: int = 10) -> List[Dict]:
        """Get the top endpoints by request count."""
        return json.loads(self._impl.get_endpoint_distribution(limit))

    def get_status_code_distribution(self) -> List[Dict]:
        """Get the distribution of status codes."""
        return json.loads(self._impl.get_status_code_distribution())

    def get_avg_response_time(self) -> float:
        """Get the average response time across all requests."""
        return self._impl.get_avg_response_time()

    @property
    def total_requests(self) -> int:
        """Get the total number of requests."""
        return self._impl.get_total_requests()

    @property
    def max_time(self) -> float:
        """Get the maximum response time."""
        return self._impl.get_max_time()

    @property
    def endpoints(self) -> Dict:
        """Get the endpoints dictionary (compatibility property)."""
        # This is just for compatibility with code that might access this directly
        return {"__count__": self._impl.get_unique_endpoints()}

    def get_engine_stats(self) -> List[Dict]:
        """Get statistics for each database engine."""
        result = []

        for engine_name, stats in self.engine_stats.items():
            # Convert times to milliseconds for frontend display
            result.append(
                {
                    "name": engine_name,
                    "dialect": stats["dialect"],
                    "url": stats["url"],
                    "query_count": stats["query_count"],
                    "total_time": stats["total_time"] * 1000,  # Convert to ms
                    "avg_time": stats["avg_time"] * 1000,  # Convert to ms
                    "max_time": stats["max_time"] * 1000,  # Convert to ms
                    "min_time": stats["min_time"] * 1000
                    if stats["min_time"] < float("inf")
                    else 0,
                }
            )

        # Sort by query count (descending)
        result.sort(key=lambda x: x["query_count"], reverse=True)

        return result
