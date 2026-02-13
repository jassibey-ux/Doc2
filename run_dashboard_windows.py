#!/usr/bin/env python3
"""Entry point for Windows PyInstaller executable.

This uses the Windows-specific launcher with:
- First-run folder selection dialog
- Auto-browser launch
- User-friendly error dialogs
"""

import sys
import os

# Add the package to the path
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    application_path = sys._MEIPASS
else:
    # Running as script
    application_path = os.path.dirname(os.path.abspath(__file__))

# Import and run Windows launcher
from logtail_dashboard.windows_launcher import main

if __name__ == '__main__':
    main()
