# Contributing to FastAPI Profiler Lite

Thank you for your interest in FastAPI Profiler! This project is in its early prototype phase, so we're keeping things simple for now.

## Quick Start

1. Clone the repository
2. Create a virtual environment
3. Install development dependencies:
   ```bash
   pip install -e ".[dev]"
   ```

## Running the Example

Test your changes with:

```bash
python example.py
```

Then visit http://127.0.0.1:8000/profiler in your browser.

## Development Pipeline

Our development pipeline includes several automated checks and processes:

1. **Continuous Integration**: All pull requests trigger automated tests on multiple Python versions (3.8, 3.9, 3.10, 3.11)
2. **Code Quality**: We use ruff for linting and formatting
3. **Conventional Commits**: We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard for commit messages
   - Format: `type(scope): description` (e.g., `feat(dashboard): add new chart`)
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
4. **Semantic Versioning**: Version numbers are automatically determined based on commit messages
5. **Automated Releases**: When merged to main, semantic-release creates a new release if needed

When submitting a PR, the GitHub Actions workflow will automatically check your code and commits.

## Code Style

We use ruff for code formatting and linting. More detailed style guides will be added as the project matures.

## Pull Requests

1. Keep changes focused and small
2. Test your changes
3. Update docstrings for any new functions

## Reporting Issues

When reporting bugs, please include:
- Steps to reproduce
- Expected vs. actual behavior
- Your environment (Python version, FastAPI version)

## Project Status

This project is in its early stages. The codebase and contribution guidelines will evolve as the project matures.
