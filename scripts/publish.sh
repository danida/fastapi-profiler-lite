#!/bin/bash
# Script to build and publish the package

# Ensure we're in the project root
cd "$(dirname "$0")/.." || exit

# Check if poetry is installed
if ! command -v poetry &> /dev/null; then
    echo "Poetry is not installed. Please install it first."
    echo "https://python-poetry.org/docs/#installation"
    exit 1
fi

# Ensure we have the latest dependencies
echo "Installing dependencies..."
poetry install

# Run tests
echo "Running tests..."
poetry run pytest
if [ $? -ne 0 ]; then
    echo "Tests failed. Aborting publish."
    exit 1
fi

# Build the package
echo "Building package..."
poetry build

# Ask for confirmation before publishing
read -p "Do you want to publish to PyPI? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Publishing to PyPI..."
    poetry publish
    echo "Package published successfully!"
else
    echo "Publish aborted."
fi
