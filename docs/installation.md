# Installation

## Requirements

- Python 3.8+
- FastAPI 0.68.0+

## Basic Installation

Install FastAPI Profiler using pip:

```bash
pip install fastapi-profiler-lite
```

Or with Poetry:

```bash
poetry add fastapi-profiler
```

## Installation with Optional Dependencies

```bash
# With Uvicorn for running examples
pip install "fastapi-profiler-lite[standard]"

# With development dependencies
pip install "fastapi-profiler-lite[dev]"
```

## Development Installation

For development, you can install the package with development dependencies:

```bash
# Clone and install in dev mode
git clone https://github.com/al91liwo/fastapi-profiler.git
cd fastapi-profiler
pip install -e ".[dev]"

# Using Poetry
poetry install
```

## Quick Start

```bash
# Run basic example
python example.py
```

Open your browser to:
- http://127.0.0.1:8000/ - API endpoints
- http://127.0.0.1:8000/profiler - Profiler dashboard

## Interactive Demo

For a more interactive experience with automatic browser launch and simulated traffic:

```bash
# Run interactive demo with browser
python examples/demo_with_browser.py
```

This will:
1. Start a FastAPI server with the profiler
2. Open the dashboard in your default browser
3. Generate sample requests with varying response times
4. Show real-time profiling data in the dashboard

## Verifying Installation

You can verify that FastAPI Profiler is installed correctly by running:

```python
import fastapi_profiler
print(fastapi_profiler.__version__)
```

## Next Steps

Once installed, see the [Configuration](configuration.md) guide to set up the profiler in your FastAPI application.
