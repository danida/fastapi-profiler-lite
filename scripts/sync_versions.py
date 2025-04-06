#!/usr/bin/env python3
"""
Synchronize version numbers across all project files.
"""
import re
import sys
from pathlib import Path

def update_versions(new_version):
    """Update all version references to the new version."""
    project_root = Path(__file__).parent.parent
    
    # Update Cargo.toml - be specific about the package version
    cargo_toml = project_root / "fastapi_profiler" / "rustcore" / "Cargo.toml"
    update_cargo_version(cargo_toml, new_version)
    
    # Update pyproject.toml in rustcore - be specific about the version field
    rust_pyproject = project_root / "fastapi_profiler" / "rustcore" / "pyproject.toml"
    update_project_version(rust_pyproject, new_version)
    
    # Update setup.py in rustcore
    rust_setup = project_root / "fastapi_profiler" / "rustcore" / "setup.py"
    update_file(rust_setup, r'version="([^"]+)"', f'version="{new_version}"')
    
    # Update __init__.py in rustcore
    rust_init = project_root / "fastapi_profiler" / "rustcore" / "__init__.py"
    if rust_init.exists():
        update_file(rust_init, r'__version__ = "([^"]+)"', f'__version__ = "{new_version}"')
    else:
        rust_init.write_text(f'__version__ = "{new_version}"\n')
    
    # Update main package files
    main_pyproject = project_root / "pyproject.toml"
    update_project_version(main_pyproject, new_version)
    update_dependency_version(main_pyproject, "fastapi-profiler-rust", f">={new_version}")
    
    main_setup = project_root / "setup.py"
    update_file(main_setup, r'version="([^"]+)"', f'version="{new_version}"')
    update_file(main_setup, r'fastapi-profiler-rust>=([^"]+)"', f'fastapi-profiler-rust>={new_version}"')
    
    main_init = project_root / "fastapi_profiler" / "__init__.py"
    update_file(main_init, r'__version__ = "([^"]+)"', f'__version__ = "{new_version}"')
    
    print(f"✅ All version references updated to {new_version}")

def update_cargo_version(file_path, new_version):
    """Update only the package version in Cargo.toml, not dependencies."""
    if not file_path.exists():
        print(f"⚠️ File not found: {file_path}")
        return
    
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    # Find the package section and update only the version line within it
    in_package_section = False
    for i, line in enumerate(lines):
        if line.strip() == '[package]':
            in_package_section = True
        elif line.strip().startswith('[') and line.strip().endswith(']'):
            in_package_section = False
        
        if in_package_section and line.strip().startswith('version = '):
            lines[i] = f'version = "{new_version}"\n'
    
    with open(file_path, 'w') as f:
        f.writelines(lines)
    
    print(f"Updated {file_path}")

def update_project_version(file_path, new_version):
    """Update version in pyproject.toml without affecting other version strings."""
    if not file_path.exists():
        print(f"⚠️ File not found: {file_path}")
        return
    
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    # Look for the version line in the [tool.poetry] or [project] section
    in_project_section = False
    for i, line in enumerate(lines):
        if line.strip() == '[tool.poetry]' or line.strip() == '[project]':
            in_project_section = True
        elif line.strip().startswith('[') and line.strip().endswith(']'):
            in_project_section = False
        
        if in_project_section and line.strip().startswith('version = '):
            lines[i] = f'version = "{new_version}"\n'
    
    with open(file_path, 'w') as f:
        f.writelines(lines)
    
    print(f"Updated {file_path}")

def update_dependency_version(file_path, dependency_name, version_spec):
    """Update a specific dependency version in pyproject.toml."""
    if not file_path.exists():
        print(f"⚠️ File not found: {file_path}")
        return
    
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    # Look for the dependency in the dependencies section
    in_dependencies = False
    for i, line in enumerate(lines):
        if line.strip() == '[tool.poetry.dependencies]' or line.strip() == '[project.dependencies]':
            in_dependencies = True
        elif line.strip().startswith('[') and line.strip().endswith(']'):
            in_dependencies = False
        
        if in_dependencies and line.strip().startswith(f'{dependency_name} = '):
            lines[i] = f'{dependency_name} = "{version_spec}"\n'
    
    with open(file_path, 'w') as f:
        f.writelines(lines)
    
    print(f"Updated dependency {dependency_name} in {file_path}")

def update_file(file_path, pattern, replacement):
    """Update version in a file using regex pattern."""
    if not file_path.exists():
        print(f"⚠️ File not found: {file_path}")
        return
    
    content = file_path.read_text()
    updated = re.sub(pattern, replacement, content)
    file_path.write_text(updated)
    print(f"Updated {file_path}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python sync_versions.py NEW_VERSION")
        sys.exit(1)
    
    new_version = sys.argv[1]
    update_versions(new_version)
