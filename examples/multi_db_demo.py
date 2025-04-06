"""
FastAPI Profiler Multi-Database Demo

This example demonstrates how to use FastAPI Profiler with multiple database engines:
1. SQLite for local development
2. PostgreSQL for production-like data

It shows how to:
- Manually instrument multiple database engines
- Track queries across different databases
- Handle complex and potentially problematic queries
"""

import asyncio
import random
import sys
import threading
import time
import webbrowser
from typing import List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    create_engine,
    text,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from fastapi_profiler import Profiler
from fastapi_profiler.instrumentations import SQLAlchemyInstrumentation

# Create FastAPI app
app = FastAPI(title="FastAPI Profiler Multi-Database Demo")

# Create base model class
Base = declarative_base()


# Define models
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)

    # Relationship to posts
    posts = relationship("Post", back_populates="author")


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True)
    title = Column(String, index=True)
    content = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))

    # Relationship to user
    author = relationship("User", back_populates="posts")


# Create SQLite engine for primary database
SQLITE_URL = "sqlite:///./primary.db"
primary_engine = create_engine(SQLITE_URL)
PrimarySessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=primary_engine
)

# Create SQLite engine for analytics database (simulating a separate database)
ANALYTICS_URL = "sqlite:///./analytics.db"
analytics_engine = create_engine(ANALYTICS_URL)
AnalyticsSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=analytics_engine
)

# Create tables in both databases
Base.metadata.create_all(bind=primary_engine)
Base.metadata.create_all(bind=analytics_engine)


# Dependency to get primary DB session
def get_primary_db():
    db = PrimarySessionLocal()
    try:
        yield db
    finally:
        db.close()


# Dependency to get analytics DB session
def get_analytics_db():
    db = AnalyticsSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic models
class UserCreate(BaseModel):
    username: str
    email: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        from_attributes = True


class PostCreate(BaseModel):
    title: str
    content: str


class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    user_id: int

    class Config:
        from_attributes = True


class AnalyticsResponse(BaseModel):
    total_users: int
    total_posts: int
    posts_per_user: float
    most_active_user: Optional[str] = None


# API routes
@app.get("/")
async def read_root():
    return {"message": "Welcome to the FastAPI Profiler Multi-Database Demo"}


@app.post("/users/", response_model=UserResponse)
def create_user(
    user: UserCreate,
    primary_db: Session = Depends(get_primary_db),
    analytics_db: Session = Depends(get_analytics_db),
):
    # Check if user exists in primary DB
    db_user = primary_db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    # Create user in primary DB
    db_user = User(username=user.username, email=user.email)
    primary_db.add(db_user)
    primary_db.commit()
    primary_db.refresh(db_user)

    # Also create in analytics DB (simulating replication)
    analytics_user = User(id=db_user.id, username=db_user.username, email=db_user.email)
    analytics_db.add(analytics_user)
    analytics_db.commit()

    return db_user


@app.get("/users/", response_model=List[UserResponse])
def read_users(
    skip: int = 0, limit: int = 10, primary_db: Session = Depends(get_primary_db)
):
    # Simple query from primary DB
    users = primary_db.query(User).offset(skip).limit(limit).all()
    return users


@app.get("/users/{user_id}", response_model=UserResponse)
def read_user(user_id: int, primary_db: Session = Depends(get_primary_db)):
    # Get user from primary DB
    db_user = primary_db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@app.post("/users/{user_id}/posts/", response_model=PostResponse)
def create_post(
    user_id: int,
    post: PostCreate,
    primary_db: Session = Depends(get_primary_db),
    analytics_db: Session = Depends(get_analytics_db),
):
    # Check if user exists
    db_user = primary_db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Create post in primary DB
    db_post = Post(title=post.title, content=post.content, user_id=user_id)
    primary_db.add(db_post)
    primary_db.commit()
    primary_db.refresh(db_post)

    # Also create in analytics DB (simulating replication)
    analytics_post = Post(
        id=db_post.id, title=db_post.title, content=db_post.content, user_id=user_id
    )
    analytics_db.add(analytics_post)
    analytics_db.commit()

    return db_post


@app.get("/posts/", response_model=List[PostResponse])
def read_posts(
    skip: int = 0, limit: int = 10, primary_db: Session = Depends(get_primary_db)
):
    # Simple query from primary DB
    posts = primary_db.query(Post).offset(skip).limit(limit).all()
    return posts


@app.get("/analytics/summary", response_model=AnalyticsResponse)
def get_analytics_summary(analytics_db: Session = Depends(get_analytics_db)):
    """Get analytics summary using complex queries on the analytics database."""
    # Add a small delay to simulate complex processing
    time.sleep(random.uniform(0.05, 0.2))

    # Complex query to get user and post counts
    result = analytics_db.execute(
        text("""
        WITH user_counts AS (
            SELECT COUNT(*) as total_users FROM users
        ),
        post_counts AS (
            SELECT COUNT(*) as total_posts FROM posts
        ),
        user_post_counts AS (
            SELECT u.username, COUNT(p.id) as post_count
            FROM users u
            LEFT JOIN posts p ON u.id = p.user_id
            GROUP BY u.username
            ORDER BY post_count DESC
            LIMIT 1
        )
        SELECT 
            user_counts.total_users,
            post_counts.total_posts,
            CASE 
                WHEN user_counts.total_users > 0 
                THEN CAST(post_counts.total_posts AS FLOAT) / user_counts.total_users 
                ELSE 0 
            END as posts_per_user,
            user_post_counts.username as most_active_user
        FROM user_counts, post_counts, user_post_counts
    """)
    ).fetchone()

    if result:
        return {
            "total_users": result[0],
            "total_posts": result[1],
            "posts_per_user": result[2],
            "most_active_user": result[3],
        }
    else:
        return {
            "total_users": 0,
            "total_posts": 0,
            "posts_per_user": 0,
            "most_active_user": None,
        }


@app.get("/analytics/user-activity")
def get_user_activity(analytics_db: Session = Depends(get_analytics_db)):
    """Get user activity statistics using a complex query."""
    # Complex query with subqueries and window functions
    query = text("""
    WITH post_stats AS (
        SELECT 
            user_id,
            COUNT(*) as post_count,
            MIN(id) as first_post_id,
            MAX(id) as last_post_id
        FROM posts
        GROUP BY user_id
    ),
    user_rankings AS (
        SELECT 
            u.id,
            u.username,
            COALESCE(ps.post_count, 0) as post_count,
            RANK() OVER (ORDER BY COALESCE(ps.post_count, 0) DESC) as activity_rank
        FROM users u
        LEFT JOIN post_stats ps ON u.id = ps.user_id
    )
    SELECT 
        ur.id,
        ur.username,
        ur.post_count,
        ur.activity_rank,
        CASE 
            WHEN ur.post_count > 0 THEN 'active'
            ELSE 'inactive'
        END as status
    FROM user_rankings ur
    ORDER BY ur.activity_rank
    """)

    results = analytics_db.execute(query).fetchall()

    return [
        {
            "user_id": row[0],
            "username": row[1],
            "post_count": row[2],
            "activity_rank": row[3],
            "status": row[4],
        }
        for row in results
    ]


@app.get("/analytics/advanced-metrics")
def get_advanced_metrics(analytics_db: Session = Depends(get_analytics_db)):
    """Get advanced analytics metrics using window functions and complex SQL."""
    # Complex query with window functions, CTEs, and advanced SQL features
    query = text("""
    WITH user_post_stats AS (
        SELECT 
            u.id as user_id,
            u.username,
            COUNT(p.id) as post_count,
            MAX(p.id) as latest_post_id,
            MIN(p.id) as first_post_id,
            COALESCE(AVG(LENGTH(p.content)), 0) as avg_content_length
        FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
        GROUP BY u.id, u.username
    ),
    ranked_users AS (
        SELECT 
            user_id,
            username,
            post_count,
            avg_content_length,
            RANK() OVER (ORDER BY post_count DESC) as post_rank,
            PERCENT_RANK() OVER (ORDER BY post_count DESC) as percentile,
            NTILE(4) OVER (ORDER BY post_count DESC) as quartile
        FROM user_post_stats
    ),
    engagement_metrics AS (
        SELECT
            ru.user_id,
            ru.username,
            ru.post_count,
            ru.avg_content_length,
            ru.post_rank,
            ru.percentile,
            ru.quartile,
            CASE 
                WHEN ru.quartile = 1 THEN 'High Engagement'
                WHEN ru.quartile = 2 THEN 'Medium-High Engagement'
                WHEN ru.quartile = 3 THEN 'Medium-Low Engagement'
                WHEN ru.quartile = 4 THEN 'Low Engagement'
                ELSE 'No Engagement'
            END as engagement_level
        FROM ranked_users ru
    )
    SELECT 
        em.user_id,
        em.username,
        em.post_count,
        ROUND(em.avg_content_length, 2) as avg_content_length,
        em.post_rank,
        ROUND(em.percentile * 100, 2) as percentile,
        em.quartile,
        em.engagement_level,
        CASE
            WHEN em.post_count > 0 THEN 'Active'
            ELSE 'Inactive'
        END as status
    FROM engagement_metrics em
    ORDER BY em.post_rank
    """)

    results = analytics_db.execute(query).fetchall()

    return [
        {
            "user_id": row[0],
            "username": row[1],
            "post_count": row[2],
            "avg_content_length": row[3],
            "rank": row[4],
            "percentile": row[5],
            "quartile": row[6],
            "engagement_level": row[7],
            "status": row[8],
        }
        for row in results
    ]


@app.get("/analytics/content-analysis")
def get_content_analysis(analytics_db: Session = Depends(get_analytics_db)):
    """Analyze post content with complex SQL."""
    # Complex query with string operations and aggregations
    query = text("""
    WITH content_metrics AS (
        SELECT 
            p.id,
            p.title,
            p.content,
            u.username as author,
            LENGTH(p.content) as content_length,
            (LENGTH(p.content) - LENGTH(REPLACE(p.content, ' ', ''))) + 1 as word_count,
            CASE
                WHEN LENGTH(p.content) < 100 THEN 'Short'
                WHEN LENGTH(p.content) < 500 THEN 'Medium'
                ELSE 'Long'
            END as length_category
        FROM posts p
        JOIN users u ON p.user_id = u.id
    ),
    author_metrics AS (
        SELECT
            author,
            COUNT(*) as post_count,
            AVG(content_length) as avg_content_length,
            AVG(word_count) as avg_word_count,
            SUM(CASE WHEN length_category = 'Short' THEN 1 ELSE 0 END) as short_posts,
            SUM(CASE WHEN length_category = 'Medium' THEN 1 ELSE 0 END) as medium_posts,
            SUM(CASE WHEN length_category = 'Long' THEN 1 ELSE 0 END) as long_posts
        FROM content_metrics
        GROUP BY author
    )
    SELECT
        author,
        post_count,
        ROUND(avg_content_length, 2) as avg_content_length,
        ROUND(avg_word_count, 2) as avg_word_count,
        short_posts,
        medium_posts,
        long_posts,
        ROUND((short_posts * 100.0 / post_count), 2) as short_percentage,
        ROUND((medium_posts * 100.0 / post_count), 2) as medium_percentage,
        ROUND((long_posts * 100.0 / post_count), 2) as long_percentage
    FROM author_metrics
    WHERE post_count > 0
    ORDER BY post_count DESC, avg_content_length DESC
    """)

    results = analytics_db.execute(query).fetchall()

    return [
        {
            "author": row[0],
            "post_count": row[1],
            "avg_content_length": row[2],
            "avg_word_count": row[3],
            "short_posts": row[4],
            "medium_posts": row[5],
            "long_posts": row[6],
            "short_percentage": row[7],
            "medium_percentage": row[8],
            "long_percentage": row[9],
        }
        for row in results
    ]


@app.get("/analytics/problematic-query")
def problematic_query(analytics_db: Session = Depends(get_analytics_db)):
    """Endpoint with intentionally problematic queries to test error handling."""
    try:
        # Malformed SQL query
        result1 = analytics_db.execute(text("SELCT * FROM users")).fetchall()
    except Exception as e:
        # Just log the error, don't raise it
        print(f"Expected error in problematic query 1: {str(e)}")

    try:
        # Query with syntax error
        result2 = analytics_db.execute(
            text("SELECT * FROM users WHERE username = 'test'")
        ).fetchall()
    except Exception as e:
        print(f"Error in query 2: {str(e)}")

    try:
        # Query with unclosed quotes
        result3 = analytics_db.execute(
            text("SELECT * FROM users WHERE username = 'unclosed")
        ).fetchall()
    except Exception as e:
        print(f"Expected error in problematic query 3: {str(e)}")

    return {"message": "Problematic queries executed"}


@app.get("/search")
def search(q: str = Query(...), primary_db: Session = Depends(get_primary_db)):
    """Search users and posts with a potentially unsafe query parameter."""
    # This is intentionally vulnerable to SQL injection for demonstration purposes
    # DO NOT use this pattern in real applications!
    try:
        # Unsafe direct string interpolation (for demonstration only)
        unsafe_query = text(
            f"SELECT * FROM users WHERE username LIKE '%{q}%' OR email LIKE '%{q}%'"
        )
        users_result = primary_db.execute(unsafe_query).fetchall()

        # A safer approach using SQLAlchemy's text() with parameters
        safe_query = text(
            "SELECT * FROM posts WHERE title LIKE :search OR content LIKE :search"
        )
        posts_result = primary_db.execute(safe_query, {"search": f"%{q}%"}).fetchall()

        return {
            "users": [
                {"id": row[0], "username": row[1], "email": row[2]}
                for row in users_result
            ],
            "posts": [
                {"id": row[0], "title": row[1], "content": row[2]}
                for row in posts_result
            ],
        }
    except Exception as e:
        return {"error": str(e)}


# Initialize the profiler
profiler = Profiler(app)

# Manually instrument both database engines (required step)
print(f"Instrumenting primary engine: {primary_engine}")
SQLAlchemyInstrumentation.instrument(primary_engine)

print(f"Instrumenting analytics engine: {analytics_engine}")
SQLAlchemyInstrumentation.instrument(analytics_engine)

# Add a test query to verify instrumentation
with PrimarySessionLocal() as db:
    try:
        result = db.execute(text("SELECT 1 AS test")).fetchone()
        print(f"Test query on primary DB successful: {result}")
    except Exception as e:
        print(f"Test query on primary DB failed: {e}")

with AnalyticsSessionLocal() as db:
    try:
        result = db.execute(text("SELECT 1 AS test")).fetchone()
        print(f"Test query on analytics DB successful: {result}")
    except Exception as e:
        print(f"Test query on analytics DB failed: {e}")


# Function to generate sample data
def generate_sample_data():
    """Generate sample data for both databases."""
    primary_db = PrimarySessionLocal()
    analytics_db = AnalyticsSessionLocal()

    try:
        # Check if we already have data
        if primary_db.query(User).count() > 0:
            print("Database already contains data")
            return

        print("Generating sample data...")

        # Create sample users with more varied data
        users = []
        for i in range(20):
            activity_level = random.choice(["high", "medium", "low"])
            post_count = (
                random.randint(1, 20)
                if activity_level == "high"
                else random.randint(1, 5)
                if activity_level == "medium"
                else 0
            )

            user = User(
                username=f"user{i}_{activity_level}", email=f"user{i}@example.com"
            )
            primary_db.add(user)
            users.append((user, post_count))

        primary_db.commit()

        # Create sample posts with varied content lengths
        lorem_ipsum = """
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor 
        incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud 
        exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure 
        dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. 
        Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt 
        mollit anim id est laborum.
        """

        post_id = 0
        for user, post_count in users:
            for i in range(post_count):
                post_id += 1
                # Vary content length
                content_length = random.choice(["short", "medium", "long"])
                if content_length == "short":
                    content = lorem_ipsum[:50].strip()
                elif content_length == "medium":
                    content = lorem_ipsum[:200].strip()
                else:
                    content = lorem_ipsum.strip()

                post = Post(
                    title=f"Post {post_id} by {user.username}",
                    content=content,
                    user_id=user.id,
                )
                primary_db.add(post)

        primary_db.commit()

        # Copy data to analytics database (simulating replication)
        for user in primary_db.query(User).all():
            analytics_user = User(id=user.id, username=user.username, email=user.email)
            analytics_db.add(analytics_user)

        analytics_db.commit()

        for post in primary_db.query(Post).all():
            analytics_post = Post(
                id=post.id, title=post.title, content=post.content, user_id=post.user_id
            )
            analytics_db.add(analytics_post)

        analytics_db.commit()

        print(f"Sample data generated: {len(users)} users and {post_id} posts")
    finally:
        primary_db.close()
        analytics_db.close()


# Function to make requests to the API
async def make_requests(base_url: str, num_requests: int = 50):
    """Make a series of requests to the API endpoints."""
    import httpx

    print(f"Making {num_requests} requests to demonstrate the profiler...")

    async with httpx.AsyncClient() as client:
        for i in range(num_requests):
            # Choose a random endpoint
            endpoint_type = random.choices(
                ["users", "posts", "analytics", "search", "problematic"],
                weights=[0.25, 0.25, 0.3, 0.15, 0.05],
                k=1,
            )[0]

            try:
                if endpoint_type == "users":
                    if random.random() < 0.2:  # 20% chance to create a new user
                        await client.post(
                            f"{base_url}/users/",
                            json={
                                "username": f"newuser{random.randint(100, 999)}",
                                "email": f"newuser{random.randint(100, 999)}@example.com",
                            },
                        )
                        print(f"Request {i + 1}/{num_requests}: POST /users/")
                    else:
                        # Get users or a specific user
                        if random.random() < 0.5:
                            await client.get(f"{base_url}/users/")
                            print(f"Request {i + 1}/{num_requests}: GET /users/")
                        else:
                            user_id = random.randint(1, 20)
                            await client.get(f"{base_url}/users/{user_id}")
                            print(
                                f"Request {i + 1}/{num_requests}: GET /users/{user_id}"
                            )

                elif endpoint_type == "posts":
                    if random.random() < 0.3:  # 30% chance to create a new post
                        user_id = random.randint(1, 20)
                        await client.post(
                            f"{base_url}/users/{user_id}/posts/",
                            json={
                                "title": f"New Post {random.randint(100, 999)}",
                                "content": f"Content for new post {random.randint(100, 999)}",
                            },
                        )
                        print(
                            f"Request {i + 1}/{num_requests}: POST /users/{user_id}/posts/"
                        )
                    else:
                        # Get posts
                        await client.get(f"{base_url}/posts/")
                        print(f"Request {i + 1}/{num_requests}: GET /posts/")

                elif endpoint_type == "analytics":
                    # Get analytics data - now with more endpoints
                    analytics_endpoint = random.choices(
                        [
                            "summary",
                            "user-activity",
                            "advanced-metrics",
                            "content-analysis",
                        ],
                        weights=[0.25, 0.25, 0.25, 0.25],
                        k=1,
                    )[0]

                    await client.get(f"{base_url}/analytics/{analytics_endpoint}")
                    print(
                        f"Request {i + 1}/{num_requests}: GET /analytics/{analytics_endpoint}"
                    )

                elif endpoint_type == "search":
                    # Search with various terms
                    search_terms = [
                        "user",
                        "post",
                        "content",
                        "example",
                        "new",
                        "high",
                        "medium",
                        "low",
                    ]
                    term = random.choice(search_terms)
                    await client.get(f"{base_url}/search?q={term}")
                    print(f"Request {i + 1}/{num_requests}: GET /search?q={term}")

                elif endpoint_type == "problematic":
                    # Trigger problematic queries
                    await client.get(f"{base_url}/analytics/problematic-query")
                    print(
                        f"Request {i + 1}/{num_requests}: GET /analytics/problematic-query"
                    )

                # Small delay between requests
                await asyncio.sleep(random.uniform(0.1, 0.3))

            except Exception as e:
                print(f"Error making request: {e}")


def open_browser(url: str, delay: float = 2.0):
    """Open the browser after a short delay."""
    time.sleep(delay)
    print(f"Opening dashboard in browser: {url}")
    webbrowser.open(url)


def run_server():
    """Run the uvicorn server."""
    uvicorn.run(app, host="127.0.0.1", port=8000)


async def main():
    """Main function to run the demo."""
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

    print("\nStarting continuous request loop for testing...")
    print("The demo will run indefinitely. Press Ctrl+C to exit.")

    # Run indefinitely, making batches of requests
    request_count = 0
    while True:
        # Make a batch of requests
        batch_size = random.randint(5, 15)
        print(
            f"\nMaking batch of {batch_size} requests (total so far: {request_count})..."
        )
        await make_requests("http://127.0.0.1:8000", num_requests=batch_size)
        request_count += batch_size

        # Short pause between batches
        pause_time = random.uniform(1.0, 3.0)
        print(f"Pausing for {pause_time:.1f} seconds...")
        await asyncio.sleep(pause_time)


if __name__ == "__main__":
    print("FastAPI Profiler Multi-Database Demo")
    print("====================================")
    print(
        "This demo shows how FastAPI Profiler tracks queries across multiple database engines."
    )
    print("The dashboard will open in your browser.")
    print(
        "\nNOTE: This demo has been configured to run indefinitely for testing purposes."
    )
    print("Press Ctrl+C at any time to exit.")

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)
