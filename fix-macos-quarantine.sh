#!/bin/bash
# Fix macOS Gatekeeper quarantine issues for Python native extensions
# Run this if you see "Apple could not verify... is free of malware" warnings

echo "Fixing macOS quarantine attributes for Python packages..."

# Get Python site-packages directory
SITE_PACKAGES=$(python3 -c "import site; print(site.getsitepackages()[0])")

if [ -z "$SITE_PACKAGES" ]; then
    echo "Error: Could not find Python site-packages directory"
    exit 1
fi

echo "Site-packages: $SITE_PACKAGES"

# Remove quarantine from common packages with native extensions
PACKAGES=(
    "watchfiles"
    "uvloop"
    "uvicorn"
    "websockets"
    "multidict"
    "yarl"
    "aiohttp"
)

for package in "${PACKAGES[@]}"; do
    if [ -d "$SITE_PACKAGES/$package" ]; then
        echo "Removing quarantine from $package..."
        xattr -r -d com.apple.quarantine "$SITE_PACKAGES/$package" 2>/dev/null && \
            echo "  ✓ Fixed $package" || \
            echo "  ℹ No quarantine found on $package"
    fi
done

echo ""
echo "Done! You can now run the dashboard without quarantine warnings."
echo "If you still see warnings, run this script again after installing new packages."
