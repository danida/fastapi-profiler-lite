from abc import ABC, abstractmethod
from typing import Any

from fastapi_profiler.utils import current_profiler_ctx


class BaseInstrumentation(ABC):
    """Base class for all database instrumentations"""
    
    @classmethod
    @abstractmethod
    def instrument(cls, engine: Any) -> None:
        """Instrument a database engine/client"""
        pass
    
    @classmethod
    @abstractmethod
    def uninstrument(cls, engine: Any) -> None:
        """Remove instrumentation"""
        pass
    
    @staticmethod
    def track_query(duration: float, statement: str, metadata: dict = None) -> None:
        """Universal tracking method"""
        profiler = current_profiler_ctx.get()
        if profiler:
            profiler.add_db_query(duration, statement, metadata or {})
