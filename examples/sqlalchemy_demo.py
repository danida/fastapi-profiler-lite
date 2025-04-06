"""
FastAPI Profiler SQLAlchemy Demo

This example demonstrates how to use FastAPI Profiler with SQLAlchemy.
It creates a simple FastAPI application with SQLAlchemy integration
and shows how the profiler automatically tracks database queries.
"""

import asyncio
import random
import sys
import threading
import time
import webbrowser
from typing import List

import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from fastapi_profiler import Profiler

# Create SQLAlchemy models
Base = declarative_base()


class ItemModel(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)


# Create FastAPI app
app = FastAPI(title="FastAPI Profiler SQLAlchemy Demo")

# Create SQLAlchemy engine and session
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.create_all(bind=engine)


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic models
class Item(BaseModel):
    name: str
    description: str = None

    class Config:
        orm_mode = True


class ItemCreate(BaseModel):
    name: str
    description: str = None


# API routes
@app.get("/")
async def read_root():
    return {"message": "Welcome to the FastAPI Profiler SQLAlchemy Demo"}


@app.get("/items/", response_model=List[Item])
def read_items(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    # Add a small delay to simulate processing
    time.sleep(random.uniform(0.01, 0.05))

    # Execute a query
    items = db.query(ItemModel).offset(skip).limit(limit).all()
    return items


@app.get("/items/{item_id}", response_model=Item)
def read_item(item_id: int, db: Session = Depends(get_db)):
    # Add a small delay to simulate processing
    time.sleep(random.uniform(0.01, 0.05))

    # Execute a query
    item = db.query(ItemModel).filter(ItemModel.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.post("/items/", response_model=Item)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    # Add a small delay to simulate processing
    time.sleep(random.uniform(0.05, 0.1))

    # Create a new item
    db_item = ItemModel(name=item.name, description=item.description)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/complex-query/")
def complex_query(db: Session = Depends(get_db)):
    # Add a small delay to simulate processing
    time.sleep(random.uniform(0.05, 0.1))

    # Execute multiple queries
    total_items = db.query(ItemModel).count()
    items_with_a = db.query(ItemModel).filter(ItemModel.name.like("%a%")).count()
    items_with_b = db.query(ItemModel).filter(ItemModel.name.like("%b%")).count()

    return {
        "total_items": total_items,
        "items_with_a": items_with_a,
        "items_with_b": items_with_b,
    }


# Initialize the profiler
print("Initializing profiler...")
profiler = Profiler(app)

# Manually instrument the engine (required step)
from fastapi_profiler.instrumentations import SQLAlchemyInstrumentation

SQLAlchemyInstrumentation.instrument(engine)
print(f"Instrumented SQLAlchemy engine: {engine}")


# Function to generate sample data
def generate_sample_data():
    db = SessionLocal()
    try:
        # Check if we already have data
        count = db.query(ItemModel).count()
        if count > 0:
            print(f"Database already contains {count} items")
            return

        print("Generating sample data...")
        for i in range(100):
            item = ItemModel(name=f"Item {i}", description=f"Description for item {i}")
            db.add(item)
        db.commit()
        print("Sample data generated")
    finally:
        db.close()


# Function to make requests to the API
async def make_requests(base_url: str, num_requests: int = 50):
    """Make a series of requests to the API endpoints"""
    import httpx

    print(f"\nMaking {num_requests} requests to demonstrate the profiler...")

    async with httpx.AsyncClient() as client:
        for i in range(num_requests):
            # Choose a random endpoint
            endpoint = random.choice(
                ["/items/", f"/items/{random.randint(1, 50)}", "/complex-query/"]
            )

            try:
                if endpoint == "/items/" and random.random() < 0.3:
                    # 30% chance to create a new item
                    await client.post(
                        f"{base_url}/items/",
                        json={
                            "name": f"New Item {random.randint(1000, 9999)}",
                            "description": f"Created during demo run {i}",
                        },
                    )
                    print(f"Request {i + 1}/{num_requests}: POST {endpoint}")
                else:
                    # GET request
                    await client.get(f"{base_url}{endpoint}")
                    print(f"Request {i + 1}/{num_requests}: GET {endpoint}")

                # Small delay between requests
                await asyncio.sleep(random.uniform(0.1, 0.3))

            except Exception as e:
                print(f"Error making request to {endpoint}: {e}")


def open_browser(url: str, delay: float = 2.0):
    """Open the browser after a short delay"""
    time.sleep(delay)
    print(f"Opening dashboard in browser: {url}")
    webbrowser.open(url)


def run_server():
    """Run the uvicorn server"""
    uvicorn.run(app, host="127.0.0.1", port=8000)


async def main():
    """Main function to run the demo"""
    # Generate sample data
    generate_sample_data()

    # Start the server in a separate thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait for server to start
    print("Starting server...")
    await asyncio.sleep(2)

    # Open the dashboard in a browser
    browser_thread = threading.Thread(
        target=open_browser, args=("http://127.0.0.1:8000/profiler",), daemon=True
    )
    browser_thread.start()

    # Wait a bit more for the browser to open
    await asyncio.sleep(1)

    # Make some requests
    await make_requests("http://127.0.0.1:8000", num_requests=30)

    print(
        "\nDemo completed! The profiler dashboard shows the database query performance."
    )
    print("Press Ctrl+C to exit.")

    while True:
        await asyncio.sleep(1)


if __name__ == "__main__":
    print("FastAPI Profiler SQLAlchemy Demo")
    print("================================")
    print(
        "This demo shows how FastAPI Profiler automatically tracks SQLAlchemy queries."
    )
    print("The dashboard will open in your browser.")

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)
