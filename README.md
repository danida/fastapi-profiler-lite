# FastAPI Profiler Lite

<p align="center">
  <img src="https://github.com/al91liwo/fastapi-profiler/raw/main/docs/images/logo.png" alt="FastAPI Profiler Lite Logo" width="150"/>
</p>

<p align="center">
  <a href="https://pypi.org/project/fastapi-profiler-lite/"><img src="https://img.shields.io/pypi/v/fastapi-profiler-lite?color=blue" alt="PyPI version"></a>
  <a href="https://github.com/al91liwo/fastapi-profiler/blob/main/LICENSE"><img src="https://img.shields.io/github/license/al91liwo/fastapi-profiler" alt="License"></a>
  <a href="https://github.com/al91liwo/fastapi-profiler/stargazers"><img src="https://img.shields.io/github/stars/al91liwo/fastapi-profiler" alt="GitHub stars"></a>
  <a href="https://github.com/al91liwo/fastapi-profiler/actions/workflows/python-package.yml"><img src="https://github.com/al91liwo/fastapi-profiler/actions/workflows/python-package.yml/badge.svg" alt="CI Status"></a>
  <a href="https://github.com/al91liwo/fastapi-profiler/actions/workflows/release.yml"><img src="https://github.com/al91liwo/fastapi-profiler/actions/workflows/release.yml/badge.svg" alt="Release Status"></a>
</p>

A lightweight, zero-configuration performance profiler for FastAPI applications. Monitor your API performance in real-time without external dependencies.

<p align="center">
  <img src="https://github.com/al91liwo/fastapi-profiler/raw/main/docs/images/dashboard-demo.gif" alt="Dashboard Demo" width="800"/>
</p>

## Why FastAPI Profiler?

Monitoring API performance shouldn't require complex setups or external services. FastAPI Profiler gives you instant visibility into your application's performance with just one line of code.

- **Instant insights** - See which endpoints are slow without complex instrumentation
- **Zero configuration** - Works out of the box with sensible defaults
- **Rust-powered statistics** - High-performance stats calculation using Rust
- **Developer-friendly** - Designed for both development and lightweight production use

## Installation

```bash
pip install fastapi-profiler-lite
```

For more installation options, see the [Installation Guide](docs/installation.md).

## Quick Start

```python
from fastapi import FastAPI
from fastapi_profiler import Profiler

app = FastAPI()

# Add the profiler with just one line
Profiler(app)

@app.get("/")
async def read_root():
    return {"Hello": "World"}
```

That's it! Visit `/profiler` to see the performance dashboard.

## Features

- **One-line integration** - Add to any FastAPI app with minimal code
- **Real-time dashboard** - Live updates with automatic refresh
- **Response time tracking** - Measure execution time of each request
- **Endpoint analysis** - Identify your slowest and most used endpoints
- **Request filtering** - Search and sort through captured requests
- **Visual metrics** - Charts for response times and request distribution
- **Database monitoring** - Tracking of SQLAlchemy queries
- **Minimal overhead** - Designed to have low performance impact

## Technical Details

- **Rust Core**: Statistics calculations are powered by a Rust extension using [PyO3](https://github.com/pyo3) for improved performance. Benchmarks comparing to NumPy will be published soon. Pre-built wheels are provided for all major platforms, but if you encounter any issues, please open a GitHub issue.

- **UI Framework**: The dashboard uses [Tabler.io](https://tabler.io/), a premium and open-source admin dashboard template, providing a clean and modern interface.

- **Database Instrumentation**: Track database queries with SQLAlchemy integration. Manually instrument your SQLAlchemy engines to see detailed query performance data.

## Running Examples

The repository includes several examples to demonstrate different features:

```bash
# Basic example with simple endpoints
python example.py

# Example with SQLAlchemy database instrumentation
python examples/sqlalchemy_demo.py

# Example with multiple database engines
python examples/multi_db_demo.py

# Real-time continuous monitoring demo
python examples/realtime_demo.py

# Stress test with high load
python examples/stress_test.py
```

### Database Instrumentation Example

To manually instrument database engines:

```python
from fastapi import FastAPI
from sqlalchemy import create_engine
from fastapi_profiler import Profiler
from fastapi_profiler.instrumentations import SQLAlchemyInstrumentation

app = FastAPI()

# Create SQLAlchemy engines
primary_db = create_engine("sqlite:///./primary.db")
analytics_db = create_engine("sqlite:///./analytics.db")

# Initialize profiler
profiler = Profiler(app)

# Manually instrument each database engine
SQLAlchemyInstrumentation.instrument(primary_db)
SQLAlchemyInstrumentation.instrument(analytics_db)
```

Visit `/profiler` to see the dashboard with database query performance data.

## Documentation

- [Installation](https://github.com/al91liwo/fastapi-profiler/blob/main/docs/installation.md)
- [Configuration](https://github.com/al91liwo/fastapi-profiler/blob/main/docs/configuration.md)
- [Contributing](https://github.com/al91liwo/fastapi-profiler/blob/main/docs/contributing.md)
- [Extending](https://github.com/al91liwo/fastapi-profiler/blob/main/docs/extending.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
