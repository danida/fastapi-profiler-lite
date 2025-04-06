#!/usr/bin/env python3
"""
Synchronize version numbers across all project files.
"""
import argparse
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

def update_main_only(new_version):
    """Update only the main package version, not the Rust package."""
    project_root = Path(__file__).parent.parent
    
    # Update main package files
    main_pyproject = project_root / "pyproject.toml"
    update_project_version(main_pyproject, new_version)
    
    main_setup = project_root / "setup.py"
    update_file(main_setup, r'version="([^"]+)"', f'version="{new_version}"')
    
    main_init = project_root / "fastapi_profiler" / "__init__.py"
    update_file(main_init, r'__version__ = "([^"]+)"', f'__version__ = "{new_version}"')
    
    print(f"✅ Main package version updated to {new_version}")

def update_dependency(dependency_name, version_spec):
    """Update only a specific dependency version."""
    project_root = Path(__file__).parent.parent
    
    # Update in pyproject.toml
    main_pyproject = project_root / "pyproject.toml"
    update_dependency_version(main_pyproject, dependency_name, version_spec)
    
    # Update in setup.py
    main_setup = project_root / "setup.py"
    update_file(main_setup, f'{dependency_name}>=([^"]+)"', f'{dependency_name}>={version_spec.lstrip(">=")})"')
    
    print(f"✅ Updated {dependency_name} dependency to {version_spec}")

def update_rust_version(rust_version):
    """Update only the Rust package version in all relevant files."""
    project_root = Path(__file__).parent.parent
    
    # Update Cargo.toml
    cargo_toml = project_root / "fastapi_profiler" / "rustcore" / "Cargo.toml"
    update_cargo_version(cargo_toml, rust_version)
    
    # Update pyproject.toml in rustcore
    rust_pyproject = project_root / "fastapi_profiler" / "rustcore" / "pyproject.toml"
    update_project_version(rust_pyproject, rust_version)
    
    # Update setup.py in rustcore
    rust_setup = project_root / "fastapi_profiler" / "rustcore" / "setup.py"
    update_file(rust_setup, r'version="([^"]+)"', f'version="{rust_version}"')
    
    # Update __init__.py in rustcore
    rust_init = project_root / "fastapi_profiler" / "rustcore" / "__init__.py"
    if rust_init.exists():
        update_file(rust_init, r'__version__ = "([^"]+)"', f'__version__ = "{rust_version}"')
    else:
        rust_init.write_text(f'__version__ = "{rust_version}"\n')
    
    # Update dependency in main package
    main_pyproject = project_root / "pyproject.toml"
    update_dependency_version(main_pyproject, "fastapi-profiler-rust", f">={rust_version}")
    
    main_setup = project_root / "setup.py"
    update_file(main_setup, r'fastapi-profiler-rust>=([^"]+)"', f'fastapi-profiler-rust>={rust_version}"')
    
    print(f"✅ Updated Rust package version to {rust_version} in all files")

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
    parser = argparse.ArgumentParser(description="Synchronize version numbers across project files.")
    parser.add_argument("version", nargs="?", help="New version number")
    parser.add_argument("--update-dependency", nargs=2, metavar=("NAME", "VERSION"), 
                        help="Update only a specific dependency version")
    parser.add_argument("--update-rust", metavar="VERSION", 
                        help="Update only the Rust package version in all relevant files")
    parser.add_argument("--main-only", metavar="VERSION",
                        help="Update only the main package version, not the Rust package")
    
    args = parser.parse_args()
    
    if args.update_dependency:
        dependency_name, version_spec = args.update_dependency
        update_dependency(dependency_name, version_spec)
    elif args.update_rust:
        update_rust_version(args.update_rust)
    elif args.main_only:
        update_main_only(args.main_only)
    elif args.version:
        update_versions(args.version)
    else:
        parser.print_help()
        sys.exit(1)
