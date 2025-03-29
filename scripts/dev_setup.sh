#!/bin/bash
# Development setup script for FastAPI Profiler

# Create virtual environment
echo "Creating virtual environment..."
python -m venv venv
source venv/bin/activate

# Install development dependencies
echo "Installing development dependencies..."
pip install -e ".[dev]"

echo "Development setup complete!"
echo "Run 'python example.py' to start the example application."
