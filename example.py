"""Minimal FastAPI Profiler Lite Example"""

import time
from fastapi import FastAPI
from fastapi_profiler import Profiler

app = FastAPI(title="FastAPI Profiler Demo")


@app.get("/")
async def read_root():
    return {"Hello": "World"}


@app.get("/slow")
async def slow_endpoint():
    time.sleep(0.5)
    return {"status": "completed slowly"}


@app.get("/very-slow")
async def very_slow_endpoint():
    time.sleep(1)
    return {"status": "completed very slowly"}


# Initialize the profiler
Profiler(app)

if __name__ == "__main__":
    try:
        import uvicorn

        print("FastAPI Profiler Demo running at http://127.0.0.1:8000")
        print("Visit http://127.0.0.1:8000/profiler to see the profiler dashboard")
        print("\nTry these endpoints:")
        print("  - http://127.0.0.1:8000/       (fast)")
        print("  - http://127.0.0.1:8000/slow   (slow)")
        print("  - http://127.0.0.1:8000/very-slow (very slow)")
        uvicorn.run(app, host="127.0.0.1", port=8000)
    except ImportError:
        print("\nCannot run the server without uvicorn.")
        print("Install with: pip install 'fastapi-profiler[standard]'")
