#!/usr/bin/env python3
"""
Build script for SCENSUS Dashboard Windows distribution.

This script automates the build process:
1. Creates the application icon
2. Builds the executable with PyInstaller
3. Prepares files for Inno Setup

Usage:
    python build_windows.py

Requirements:
    - Python 3.9+
    - PyInstaller: pip install pyinstaller
    - Pillow: pip install Pillow

After running this script:
    1. Open installer.iss in Inno Setup Compiler
    2. Click Build -> Compile
    3. Find installer in installer_output/ folder
"""

import os
import subprocess
import sys
from pathlib import Path


def run_command(cmd, description):
    """Run a command and handle errors."""
    print(f"\n{'=' * 60}")
    print(f"  {description}")
    print(f"{'=' * 60}\n")

    try:
        result = subprocess.run(
            cmd,
            shell=True if isinstance(cmd, str) else False,
            check=True,
            capture_output=False
        )
        print(f"\n[OK] {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] {description} failed with code {e.returncode}")
        return False


def main():
    # Change to script directory
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)

    print("""
    ============================================================
              SCENSUS Dashboard - Windows Build Script
    ============================================================
    """)

    # Step 1: Check dependencies
    print("\n[1/4] Checking dependencies...")

    try:
        import PyInstaller
        print("  - PyInstaller: OK")
    except ImportError:
        print("  - PyInstaller: NOT FOUND")
        print("    Installing PyInstaller...")
        run_command([sys.executable, "-m", "pip", "install", "pyinstaller"], "Install PyInstaller")

    try:
        from PIL import Image
        print("  - Pillow: OK")
    except ImportError:
        print("  - Pillow: NOT FOUND")
        print("    Installing Pillow...")
        run_command([sys.executable, "-m", "pip", "install", "Pillow"], "Install Pillow")

    # Step 2: Create icon
    print("\n[2/4] Creating application icon...")
    icon_path = script_dir / "scensus_icon.ico"

    if not icon_path.exists():
        if not run_command([sys.executable, "create_icon.py"], "Create icon"):
            print("  Warning: Could not create icon. Build will continue without custom icon.")
    else:
        print(f"  Icon already exists: {icon_path}")

    # Step 3: Build with PyInstaller
    print("\n[3/4] Building executable with PyInstaller...")

    spec_file = script_dir / "logtail_dashboard_windows.spec"
    if not spec_file.exists():
        print(f"  ERROR: Spec file not found: {spec_file}")
        sys.exit(1)

    # Clean previous build
    dist_dir = script_dir / "dist" / "SCENSUS_Dashboard"
    if dist_dir.exists():
        print(f"  Cleaning previous build: {dist_dir}")
        import shutil
        shutil.rmtree(dist_dir)

    build_dir = script_dir / "build"
    if build_dir.exists():
        import shutil
        shutil.rmtree(build_dir)

    if not run_command(
        [sys.executable, "-m", "PyInstaller", "--clean", str(spec_file)],
        "PyInstaller build"
    ):
        print("\n  ERROR: PyInstaller build failed!")
        sys.exit(1)

    # Step 4: Verify build
    print("\n[4/4] Verifying build...")

    exe_path = dist_dir / "SCENSUS_Dashboard.exe"
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"  Executable created: {exe_path}")
        print(f"  Size: {size_mb:.1f} MB")
    else:
        print(f"  ERROR: Executable not found at {exe_path}")
        sys.exit(1)

    # Count files in distribution
    file_count = sum(1 for _ in dist_dir.rglob("*") if _.is_file())
    print(f"  Total files in distribution: {file_count}")

    # Create installer output directory
    installer_output = script_dir / "installer_output"
    installer_output.mkdir(exist_ok=True)

    print(f"""
    ============================================================
                         BUILD COMPLETE!
    ============================================================

    Distribution folder: {dist_dir}

    NEXT STEPS:
    1. Test the executable:
       {exe_path}

    2. Create the installer:
       - Download Inno Setup from: https://jrsoftware.org/isinfo.php
       - Open: {script_dir / 'installer.iss'}
       - Click: Build -> Compile
       - Find installer in: {installer_output}

    3. Distribute to customers:
       - Send the installer .exe file
       - Users just double-click to install!
    """)


if __name__ == "__main__":
    main()
