#!/usr/bin/env python3
"""Entry point for PyInstaller executable."""

import sys
import os

# Add the package to the path
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    application_path = sys._MEIPASS
else:
    # Running as script
    application_path = os.path.dirname(os.path.abspath(__file__))

# Import and run main
from logtail_dashboard.__main__ import main

if __name__ == '__main__':
    main()
