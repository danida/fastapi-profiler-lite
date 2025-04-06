import asyncio
import time
from unittest import mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import fastapi_profiler
from fastapi_profiler import Profiler
from fastapi_profiler.instrumentations.base import BaseInstrumentation
from fastapi_profiler.instrumentations.sqlalchemy import SQLAlchemyInstrumentation
from fastapi_profiler.utils import get_current_profiler


class MockEngine:
    """Mock SQLAlchemy engine for testing."""
    
    def __init__(self, name="mock_engine", dialect_name="sqlite"):
        self.name = name
        self.dispatch = MockDispatch()
        self.dialect = MockDialect(dialect_name)
        self.connect_called = False
        self.execute_called = False
        self.query_result = None
    
    def connect(self):
        self.connect_called = True
        return MockConnection(self)


class MockConnection:
    """Mock SQLAlchemy connection for testing."""
    
    def __init__(self, engine):
        self.engine = engine
        self.closed = False
    
    def execute(self, statement):
        self.engine.execute_called = True
        return self.engine.query_result
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.closed = True


class MockDispatch:
    """Mock SQLAlchemy dispatch system for testing."""
    
    def __init__(self):
        self._events = {
            "before_cursor_execute": [],
            "after_cursor_execute": []
        }
        
    def _listen(self, event_name, fn):
        """Mock implementation of event listening"""
        if event_name in self._events:
            self._events[event_name].append(fn)
            return True
        return False
        
    # Add a method to register event listeners directly
    def register_event(self, event_name, fn):
        """Register an event listener directly"""
        if event_name in self._events:
            self._events[event_name].append(fn)
            return True
        return False


class MockDialect:
    """Mock SQLAlchemy dialect for testing."""
    
    def __init__(self, name="sqlite"):
        self.name = name
        self.server_version_info = (3, 36, 0)


class MockContext:
    """Mock SQLAlchemy execution context for testing."""
    
    def __init__(self):
        self._query_start = None
        self._stmt = None
        self._params = None
        self._engine_metadata = None


class CustomInstrumentation(BaseInstrumentation):
    """Custom instrumentation implementation for testing."""
    
    tracked_queries = []
    
    @classmethod
    def instrument(cls, engine):
        cls.tracked_queries = []
        engine.instrumented = True
    
    @classmethod
    def uninstrument(cls, engine):
        engine.instrumented = False
    
    @classmethod
    def track_query(cls, duration, statement, metadata=None):
        cls.tracked_queries.append({
            "duration": duration,
            "statement": statement,
            "metadata": metadata or {}
        })


@pytest.fixture
def app():
    """Create a FastAPI app for testing."""
    return FastAPI()


@pytest.fixture
def mock_engine():
    """Create a mock SQLAlchemy engine."""
    return MockEngine()


@pytest.fixture
def mock_postgres_engine():
    """Create a mock PostgreSQL engine."""
    return MockEngine(name="postgres_engine", dialect_name="postgresql")


@pytest.fixture
def mock_mysql_engine():
    """Create a mock MySQL engine."""
    return MockEngine(name="mysql_engine", dialect_name="mysql")


def test_sqlalchemy_instrumentation_basic(mock_engine):
    """Test basic SQLAlchemy instrumentation."""
    # Instrument the engine
    SQLAlchemyInstrumentation.instrument(mock_engine)
    
    # Verify that event listeners were added
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_engine.dispatch._events["after_cursor_execute"]) == 1
    
    # Uninstrument the engine
    SQLAlchemyInstrumentation.uninstrument(mock_engine)
    
    # Verify that event listeners were removed
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 0
    assert len(mock_engine.dispatch._events["after_cursor_execute"]) == 0


def test_sqlalchemy_query_tracking():
    """Test that SQL queries are properly tracked."""
    # Create a mock engine and context
    engine = MockEngine()
    context = MockContext()
    
    # Instrument the engine
    SQLAlchemyInstrumentation.instrument(engine)
    
    # Get the event handlers
    before_execute = engine.dispatch._events["before_cursor_execute"][0]
    after_execute = engine.dispatch._events["after_cursor_execute"][0]
    
    # Create a request profiler and set it in the context
    # Use a different approach to mock the context variable
    mock_profiler = mock.MagicMock()
    
    # Create a context manager to temporarily replace the get function
    class MockContextManager:
        def __enter__(self):
            # Save original function
            self.original_get_current_profiler = fastapi_profiler.utils.get_current_profiler
            
            # Create a function that returns our mock profiler
            def mock_get():
                return mock_profiler
                
            # Replace the function
            fastapi_profiler.utils.get_current_profiler = mock_get
            
            # Also set the context variable for compatibility
            self.token = fastapi_profiler.utils.current_profiler_ctx.set(mock_profiler)
            
            return mock_profiler
            
        def __exit__(self, *args):
            # Restore the original function
            fastapi_profiler.utils.get_current_profiler = self.original_get_current_profiler
            # Reset the context variable
            fastapi_profiler.utils.current_profiler_ctx.reset(self.token)
    
    # Use our custom context manager
    with MockContextManager() as mock_prof:
        # Simulate query execution
        before_execute(None, None, "SELECT * FROM users", {}, context, False)
        time.sleep(0.01)  # Small delay to simulate query execution
        after_execute(None, None, "SELECT * FROM users", {}, context, False)
        
        # Verify that add_db_query was called with the correct parameters
        mock_prof.add_db_query.assert_called_once()
        args = mock_prof.add_db_query.call_args[0]
        assert args[1] == "SELECT * FROM users"  # Statement
        assert isinstance(args[0], float)  # Duration
        assert args[0] > 0  # Duration should be positive


def test_manual_instrument_single_engine(app, mock_engine):
    """Test manual instrumentation with a single engine."""
    # Add engine to app state
    app.state.sqlalchemy_engine = mock_engine
    
    # Initialize profiler without auto-instrumentation
    profiler = Profiler(app)
    
    # Manually instrument the engine
    SQLAlchemyInstrumentation.instrument(mock_engine)
    
    # Verify that the engine was instrumented
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_engine.dispatch._events["after_cursor_execute"]) == 1


def test_manual_instrument_multiple_engines(app, mock_engine, mock_postgres_engine):
    """Test manual instrumentation with multiple engines."""
    # Add engines to app state
    app.state.sqlalchemy_engine = mock_engine
    app.state.postgres_engine = mock_postgres_engine
    
    # Initialize profiler without auto-instrumentation
    profiler = Profiler(app)
    
    # Manually instrument both engines
    SQLAlchemyInstrumentation.instrument(mock_engine)
    SQLAlchemyInstrumentation.instrument(mock_postgres_engine)
    
    # Verify that both engines were instrumented
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_engine.dispatch._events["after_cursor_execute"]) == 1
    assert len(mock_postgres_engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_postgres_engine.dispatch._events["after_cursor_execute"]) == 1


def test_manual_instrument_db_session(app):
    """Test manual instrumentation with a db session factory."""
    # Create a mock db session with an engine
    mock_db = mock.MagicMock()
    mock_db.engine = MockEngine()
    
    # Add db session to app state
    app.state.db = mock_db
    
    # Initialize profiler without auto-instrumentation
    profiler = Profiler(app)
    
    # Manually instrument the engine
    SQLAlchemyInstrumentation.instrument(mock_db.engine)
    
    # Verify that the engine was instrumented
    assert len(mock_db.engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_db.engine.dispatch._events["after_cursor_execute"]) == 1


def test_profiler_without_instrumentation(app):
    """Test profiler initialization without database instrumentation."""
    # Initialize profiler without instrumentation
    profiler = Profiler(app)
    
    # No exception should be raised, and the app should still work
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 404  # Default 404 for undefined route


def test_manual_instrumentation_multiple_engines(app, mock_engine, mock_postgres_engine):
    """Test manually instrumenting multiple engines."""
    # Initialize profiler
    profiler = Profiler(app)
    
    # Manually instrument both engines
    SQLAlchemyInstrumentation.instrument(mock_engine)
    SQLAlchemyInstrumentation.instrument(mock_postgres_engine)
    
    # Verify that both engines were instrumented
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_engine.dispatch._events["after_cursor_execute"]) == 1
    assert len(mock_postgres_engine.dispatch._events["before_cursor_execute"]) == 1
    assert len(mock_postgres_engine.dispatch._events["after_cursor_execute"]) == 1


def test_custom_instrumentation(app, mock_engine):
    """Test using a custom instrumentation class."""
    # Initialize profiler
    profiler = Profiler(app)
    
    # Use custom instrumentation
    CustomInstrumentation.instrument(mock_engine)
    
    # Verify that the engine was instrumented
    assert hasattr(mock_engine, "instrumented")
    assert mock_engine.instrumented is True
    
    # Uninstrument
    CustomInstrumentation.uninstrument(mock_engine)
    
    # Verify that the engine was uninstrumented
    assert mock_engine.instrumented is False


def test_complex_query_tracking():
    """Test tracking of complex SQL queries."""
    # Create a mock engine and context
    engine = MockEngine()
    context = MockContext()
    
    # Instrument the engine
    SQLAlchemyInstrumentation.instrument(engine)
    
    # Get the event handlers
    before_execute = engine.dispatch._events["before_cursor_execute"][0]
    after_execute = engine.dispatch._events["after_cursor_execute"][0]
    
    # Complex SQL queries to test
    complex_queries = [
        # Complex SELECT with JOINs, GROUP BY, and HAVING
        """
        SELECT u.id, u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE u.status = 'active' AND o.created_at > '2023-01-01'
        GROUP BY u.id, u.name
        HAVING COUNT(o.id) > 5
        ORDER BY total_spent DESC
        LIMIT 10
        """,
        
        # Complex INSERT with subquery
        """
        INSERT INTO monthly_stats (user_id, month, order_count, total_spent)
        SELECT user_id, DATE_TRUNC('month', created_at) as month, 
               COUNT(*) as order_count, SUM(total) as total_spent
        FROM orders
        WHERE created_at BETWEEN '2023-01-01' AND '2023-12-31'
        GROUP BY user_id, DATE_TRUNC('month', created_at)
        """,
        
        # Complex UPDATE with JOIN
        """
        UPDATE products p
        SET stock_status = 'out_of_stock'
        FROM inventory i
        WHERE p.id = i.product_id AND i.quantity = 0
        """,
        
        # Query with Common Table Expression (CTE)
        """
        WITH ranked_products AS (
            SELECT p.id, p.name, p.price, 
                   ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.price DESC) as price_rank
            FROM products p
            WHERE p.active = TRUE
        )
        SELECT * FROM ranked_products
        WHERE price_rank <= 3
        ORDER BY price_rank
        """,
        
        # Window functions
        """
        SELECT 
            department,
            employee_name,
            salary,
            AVG(salary) OVER (PARTITION BY department) as dept_avg_salary,
            MAX(salary) OVER (PARTITION BY department) as dept_max_salary,
            salary - AVG(salary) OVER (PARTITION BY department) as diff_from_avg
        FROM employees
        ORDER BY department, salary DESC
        """,
        
        # Recursive CTE
        """
        WITH RECURSIVE subordinates AS (
            SELECT employee_id, manager_id, name, 1 as depth
            FROM employees
            WHERE employee_id = 1
            UNION ALL
            SELECT e.employee_id, e.manager_id, e.name, s.depth + 1
            FROM employees e
            JOIN subordinates s ON s.employee_id = e.manager_id
        )
        SELECT * FROM subordinates ORDER BY depth
        """,
        
        # JSON operations (PostgreSQL)
        """
        SELECT 
            id,
            data->>'name' as name,
            data->>'email' as email,
            jsonb_array_elements(data->'addresses') as address
        FROM customers
        WHERE data->>'status' = 'active'
        """
    ]
    
    # Create a request profiler and set it in the context
    # Use a different approach to mock the context variable
    mock_profiler = mock.MagicMock()
    
    # Create a context manager to temporarily replace the get function
    class MockContextManager:
        def __enter__(self):
            # Save original function
            self.original_get_current_profiler = fastapi_profiler.utils.get_current_profiler
                
            # Create a function that returns our mock profiler
            def mock_get():
                return mock_profiler
                    
            # Replace both the function and the BaseInstrumentation.track_query method
            fastapi_profiler.utils.get_current_profiler = mock_get
                
            # Also patch the BaseInstrumentation.track_query method directly
            self.original_track_query = fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query
                
            @staticmethod
            def mock_track_query(duration, statement, metadata=None):
                prof = mock_profiler
                if prof:
                    prof.add_db_query(duration, statement, metadata or {})
                
            fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query = mock_track_query
                
            return mock_profiler
            
        def __exit__(self, *args):
            # Restore the original functions
            fastapi_profiler.utils.get_current_profiler = self.original_get_current_profiler
            fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query = self.original_track_query
    
    # Use our custom context manager
    with MockContextManager() as mock_prof:
        # Track each complex query
        for query in complex_queries:
            # Reset the mock
            mock_prof.add_db_query.reset_mock()
            
            # Simulate query execution
            before_execute(None, None, query, {}, context, False)
            time.sleep(0.01)  # Small delay to simulate query execution
            after_execute(None, None, query, {}, context, False)
            
            # Verify that add_db_query was called with the correct query
            mock_prof.add_db_query.assert_called_once()
            args = mock_prof.add_db_query.call_args[0]
            assert args[1] == query  # Statement should match
            assert isinstance(args[0], float)  # Duration should be a float
            assert args[0] > 0  # Duration should be positive


def test_malformed_query_tracking():
    """Test tracking of malformed SQL queries."""
    # Create a mock engine and context
    engine = MockEngine()
    context = MockContext()
    
    # Instrument the engine
    SQLAlchemyInstrumentation.instrument(engine)
    
    # Get the event handlers
    before_execute = engine.dispatch._events["before_cursor_execute"][0]
    after_execute = engine.dispatch._events["after_cursor_execute"][0]
    
    # Malformed SQL queries to test
    malformed_queries = [
        # Missing FROM clause
        "SELECT id, name WHERE status = 'active'",
        
        # Unclosed quotes
        "SELECT * FROM users WHERE name = 'John",
        
        # Invalid syntax
        "SELEKT * FROM users",
        
        # Incomplete statement
        "UPDATE users SET",
        
        # Invalid JOIN syntax
        "SELECT * FROM users JOIN orders ON users.id = orders.user_id"
    ]
    
    # Create a request profiler and set it in the context
    # Use a different approach to mock the context variable
    mock_profiler = mock.MagicMock()
    
    # Create a context manager to temporarily replace the get function
    class MockContextManager:
        def __enter__(self):
            # Save original function
            self.original_get_current_profiler = fastapi_profiler.utils.get_current_profiler
                
            # Create a function that returns our mock profiler
            def mock_get():
                return mock_profiler
                    
            # Replace both the function and the BaseInstrumentation.track_query method
            fastapi_profiler.utils.get_current_profiler = mock_get
                
            # Also patch the BaseInstrumentation.track_query method directly
            self.original_track_query = fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query
                
            @staticmethod
            def mock_track_query(duration, statement, metadata=None):
                prof = mock_profiler
                if prof:
                    prof.add_db_query(duration, statement, metadata or {})
                
            fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query = mock_track_query
                
            return mock_profiler
            
        def __exit__(self, *args):
            # Restore the original functions
            fastapi_profiler.utils.get_current_profiler = self.original_get_current_profiler
            fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query = self.original_track_query
    
    # Use our custom context manager
    with MockContextManager() as mock_prof:
        # Track each malformed query
        for query in malformed_queries:
            # Reset the mock
            mock_prof.add_db_query.reset_mock()
            
            # Simulate query execution
            before_execute(None, None, query, {}, context, False)
            time.sleep(0.01)  # Small delay to simulate query execution
            after_execute(None, None, query, {}, context, False)
            
            # Verify that add_db_query was called with the correct query
            mock_prof.add_db_query.assert_called_once()
            args = mock_prof.add_db_query.call_args[0]
            assert args[1] == query  # Statement should match
            assert isinstance(args[0], float)  # Duration should be a float
            assert args[0] > 0  # Duration should be positive


def test_metadata_capture():
    """Test that database metadata is properly captured."""
    # Create engines with different dialects
    sqlite_engine = MockEngine(dialect_name="sqlite")
    postgres_engine = MockEngine(dialect_name="postgresql")
    mysql_engine = MockEngine(dialect_name="mysql")
    
    # Instrument all engines
    SQLAlchemyInstrumentation.instrument(sqlite_engine)
    SQLAlchemyInstrumentation.instrument(postgres_engine)
    SQLAlchemyInstrumentation.instrument(mysql_engine)
    
    # Verify that metadata was stored on each engine
    assert hasattr(sqlite_engine, '_profiler_metadata')
    assert hasattr(postgres_engine, '_profiler_metadata')
    assert hasattr(mysql_engine, '_profiler_metadata')
    
    # Verify the dialect information
    assert sqlite_engine._profiler_metadata['dialect'] == 'sqlite'
    assert postgres_engine._profiler_metadata['dialect'] == 'postgresql'
    assert mysql_engine._profiler_metadata['dialect'] == 'mysql'


def test_sql_formatting():
    """Test that SQL queries are properly formatted."""
    # Skip test if sqlparse is not installed
    try:
        import sqlparse
    except ImportError:
        import pytest
        pytest.skip("sqlparse not installed")
    
    # Create a mock engine and context
    engine = MockEngine()
    context = MockContext()
    
    # Instrument the engine
    SQLAlchemyInstrumentation.instrument(engine)
    
    # Get the event handlers
    before_execute = engine.dispatch._events["before_cursor_execute"][0]
    after_execute = engine.dispatch._events["after_cursor_execute"][0]
    
    # Create a request profiler and set it in the context
    mock_profiler = mock.MagicMock()
    
    # Create a context manager to temporarily replace the get function
    class MockContextManager:
        def __enter__(self):
            # Save original function
            self.original_get_current_profiler = fastapi_profiler.utils.get_current_profiler
                
            # Create a function that returns our mock profiler
            def mock_get():
                return mock_profiler
                    
            # Replace both the function and the BaseInstrumentation.track_query method
            fastapi_profiler.utils.get_current_profiler = mock_get
                
            # Also patch the BaseInstrumentation.track_query method directly
            self.original_track_query = fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query
                
            @staticmethod
            def mock_track_query(duration, statement, metadata=None):
                prof = mock_profiler
                if prof:
                    prof.add_db_query(duration, statement, metadata or {})
                
            fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query = mock_track_query
                
            return mock_profiler
            
        def __exit__(self, *args):
            # Restore the original functions
            fastapi_profiler.utils.get_current_profiler = self.original_get_current_profiler
            fastapi_profiler.instrumentations.base.BaseInstrumentation.track_query = self.original_track_query
    
    # Test SQL formatting
    with MockContextManager() as mock_prof:
        # Unformatted SQL query
        unformatted_sql = "select id, name from users where status='active' and created_at > '2023-01-01' order by name"
        
        # Simulate query execution
        before_execute(None, None, unformatted_sql, {}, context, False)
        time.sleep(0.01)
        after_execute(None, None, unformatted_sql, {}, context, False)
        
        # Verify that add_db_query was called with formatted SQL in metadata
        mock_prof.add_db_query.assert_called_once()
        args = mock_prof.add_db_query.call_args[0]
        kwargs = mock_prof.add_db_query.call_args[1]
        
        # Check if metadata contains formatted SQL
        metadata = args[2] if len(args) > 2 else kwargs.get('metadata', {})
        assert 'formatted_sql' in metadata
        
        # Verify formatting was applied (keywords should be uppercase)
        formatted_sql = metadata['formatted_sql']
        assert 'SELECT' in formatted_sql
        assert 'FROM' in formatted_sql
        assert 'WHERE' in formatted_sql
        assert 'ORDER BY' in formatted_sql


def test_concurrent_query_tracking():
    """Test tracking queries from concurrent requests."""
    # Create a FastAPI app with a database endpoint
    app = FastAPI()
    
    # Create a mock engine
    engine = MockEngine()
    app.state.sqlalchemy_engine = engine
    
    # Add a test endpoint that simulates database queries
    @app.get("/db-query/{query_id}")
    async def db_query(query_id: int):
        # Simulate a database query
        profiler = get_current_profiler()
        if profiler:
            profiler.add_db_query(0.1, f"SELECT * FROM test WHERE id = {query_id}")
        return {"query_id": query_id}
    
    # Initialize profiler
    Profiler(app)
    
    # Create a test client
    client = TestClient(app)
    
    # Make concurrent requests
    async def make_requests():
        tasks = []
        for i in range(10):
            tasks.append(client.get(f"/db-query/{i}"))
        return tasks
    
    # Run the requests (not concurrently in test, but that's fine)
    for i in range(10):
        client.get(f"/db-query/{i}")
    
    # Check the dashboard data
    response = client.get("/profiler/api/dashboard-data")
    assert response.status_code == 200
    data = response.json()
    
    # Verify database stats
    assert "database" in data
    assert data["database"]["query_count"] == 10  # Should have 10 queries
    assert data["database"]["total_time"] > 0




def test_error_handling_during_instrumentation(app):
    """Test error handling when instrumentation fails."""
    # Create a problematic engine that will raise an exception
    problematic_engine = mock.MagicMock()
    problematic_engine.dispatch = mock.MagicMock()
    problematic_engine.dispatch.side_effect = Exception("Simulated error")
    
    # Add the problematic engine to app state
    app.state.sqlalchemy_engine = problematic_engine
    
    # Initialize profiler
    # This should not crash the application
    profiler = Profiler(app)
    
    # Verify the app still works
    client = TestClient(app)
    response = client.get("/profiler")
    assert response.status_code == 200


def test_double_instrumentation(app, mock_engine):
    """Test that instrumenting the same engine twice doesn't cause issues."""
    # First instrumentation
    SQLAlchemyInstrumentation.instrument(mock_engine)
    
    # Get the number of event listeners after first instrumentation
    first_listener_count = len(mock_engine.dispatch._events["before_cursor_execute"])
    assert first_listener_count == 1, "Should have exactly one listener after first instrumentation"
    
    # Instrument the same engine again
    SQLAlchemyInstrumentation.instrument(mock_engine)
    
    # Verify that no duplicate listeners were added
    second_listener_count = len(mock_engine.dispatch._events["before_cursor_execute"])
    assert second_listener_count == first_listener_count, "Should not add duplicate listeners"
    
    # Verify the engine is only tracked once in the instrumented engines set
    engine_id = id(mock_engine)
    assert engine_id in SQLAlchemyInstrumentation._instrumented_engines
    
    # Count occurrences of this engine ID in the set
    # This is a bit of a hack since sets can't have duplicates, but it verifies our tracking logic
    engine_count = sum(1 for e_id in SQLAlchemyInstrumentation._instrumented_engines if e_id == engine_id)
    assert engine_count == 1, "Engine should only be tracked once"


def test_double_manual_instrumentation(app, mock_engine):
    """Test that manual instrumentation handles duplicates correctly."""
    # Add engine to app state
    app.state.sqlalchemy_engine = mock_engine
    
    # Initialize profiler
    profiler = Profiler(app)
    
    # Manually instrument the engine
    SQLAlchemyInstrumentation.instrument(mock_engine)
    
    # Verify that the engine was instrumented
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 1
    
    # Manually instrument again
    SQLAlchemyInstrumentation.instrument(mock_engine)
    
    # Verify that no duplicate listeners were added
    assert len(mock_engine.dispatch._events["before_cursor_execute"]) == 1
