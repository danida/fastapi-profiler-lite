# Configuration

FastAPI Profiler is designed to work with minimal configuration, but offers several options to customize its behavior.

## Basic Usage

The simplest way to use FastAPI Profiler is to add it to your FastAPI application with a single line:

```python
from fastapi import FastAPI
from fastapi_profiler import Profiler

app = FastAPI()
Profiler(app)
```

This will enable the profiler with default settings and make the dashboard available at `/profiler`.

## Configuration Options

The `Profiler` class accepts the following parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `app` | FastAPI | required | Your FastAPI application instance |
| `dashboard_path` | str | "/profiler" | URL path where the dashboard will be served |
| `enabled` | bool | True | Enable or disable the profiler |
| `exclude_paths` | List[str] | [] | List of URL paths to exclude from profiling |

### Example with Custom Configuration

```python
from fastapi import FastAPI
from fastapi_profiler import Profiler

app = FastAPI()

# Custom configuration
profiler = Profiler(
    app=app,
    dashboard_path="/performance",  # Custom dashboard path
    enabled=True,
    exclude_paths=[
        "/docs",                    # Exclude Swagger UI
        "/redoc",                   # Exclude ReDoc
        "/openapi.json",            # Exclude OpenAPI schema
        "/static",                  # Exclude static files
    ]
)
```

## Disabling in Production

You might want to enable the profiler only in certain environments:

```python
import os
from fastapi import FastAPI
from fastapi_profiler import Profiler

app = FastAPI()

# Enable only in development
is_dev = os.getenv("ENVIRONMENT", "production").lower() == "development"
if is_dev:
    Profiler(app)
```

## Excluding Paths

You can exclude paths from profiling to reduce overhead and noise in the dashboard:

```python
Profiler(
    app=app,
    exclude_paths=[
        "/health",       # Health check endpoint
        "/metrics",      # Prometheus metrics
        "/static",       # Static files
    ]
)
```

## Next Steps

Once configured, you can access the dashboard at the specified path (default: `/profiler`) to view your application's performance metrics.
