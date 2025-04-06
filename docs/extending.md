# Extending FastAPI Profiler

FastAPI Profiler is designed to be extensible. This guide outlines the key extension points.

## Extension Points

### Custom Metrics

You can extend the `RequestProfiler` class to track additional metrics beyond the default ones. This allows you to monitor specific aspects of your application's performance that matter to your use case.

### Database Instrumentation

FastAPI Profiler includes built-in support for tracking database queries. The base instrumentation system can be extended to support additional database backends beyond SQLAlchemy.

To create a custom database instrumentation:

1. Subclass `BaseInstrumentation` from `fastapi_profiler.instrumentations.base`
2. Implement the `instrument` and `uninstrument` methods
3. Use the `track_query` method to record query performance

Example for a custom database client:

```python
from fastapi_profiler.instrumentations.base import BaseInstrumentation

class MyDatabaseInstrumentation(BaseInstrumentation):
    @classmethod
    def instrument(cls, client):
        # Store original method
        original_query = client.query
        
        # Replace with instrumented version
        def instrumented_query(*args, **kwargs):
            import time
            start = time.perf_counter()
            result = original_query(*args, **kwargs)
            duration = time.perf_counter() - start
            
            # Track the query
            cls.track_query(duration, str(args[0]))
            return result
            
        client.query = instrumented_query
        
    @classmethod
    def uninstrument(cls, client):
        # Restore original method if possible
        if hasattr(client, '_original_query'):
            client.query = client._original_query
```

### Dashboard Customization

The dashboard UI can be extended with custom visualizations. By adding your own charts or modifying existing ones, you can create views that highlight the metrics most important to your team.

### Middleware Extensions

The profiler middleware can be extended to capture additional context about requests and responses. This is useful for correlating performance data with business metrics or user behavior.

### Plugin System

For more complex extensions, you can implement a plugin architecture that hooks into various points in the request lifecycle. This allows for modular, reusable extensions that can be shared across projects.

## When to Extend

Consider extending FastAPI Profiler when:

- You need to track domain-specific metrics
- You want to correlate performance with business outcomes
- You need to integrate with other monitoring systems
- You want to add custom alerting or thresholds

## Contributing Extensions

If you develop a useful extension, consider contributing it back to the project! See the [Contributing Guide](contributing.md) for details on how to submit your extensions for inclusion in the main project.
