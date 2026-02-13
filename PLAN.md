# Debug Plan: Folder Browser Error on Different Computer

## Problem
When clicking "Browse" in Settings to select a data folder, user gets an error on a different computer.

---

## Root Cause Analysis

### Most Likely Causes (in order of probability):

1. **Initial path doesn't exist** - The `initialPath` passed to FolderBrowser comes from saved config pointing to a path that existed on the original computer but not on the new one (e.g., `C:\Users\jassi\...` vs `C:\Users\other\...`)

2. **Default C:\ fallback fails** - If no path provided, code defaults to `C:\` which may not be accessible or may require elevated permissions on some systems

3. **Permission denied** - User account on new computer lacks read access to the default/configured directory

4. **Network path issues** - If original config had a network path (`\\server\share`) that's not accessible

---

## Code Flow When Error Occurs

```
User clicks "Browse"
    ↓
SettingsPanel.tsx: setShowBrowser(true)
    ↓
FolderBrowser.tsx: browseDirectory(initialPath)  ← initialPath from config
    ↓
pathService.browse(path)  → API call to /api/browse?path=...
    ↓
api.py: browse_directory()
    ↓
FAILURE POINTS:
  - Line 277: Path doesn't exist → returns {success: false, message: "Path does not exist"}
  - Line 341: Permission denied → returns {success: false, message: "Permission denied"}
  - Line 303: iterdir() fails → exception caught, returns error
```

---

## Proposed Fixes

### Fix 1: Graceful Fallback in Backend (api.py)
When requested path doesn't exist, fall back to available drives instead of returning error.

**Location:** `logtail_dashboard/api.py` lines 276-283

**Change:** Instead of returning error when path doesn't exist, return drives list so user can navigate.

```python
# Before (fails immediately):
if not browse_path.exists():
    return {"success": False, "message": f"Path does not exist"}

# After (graceful fallback):
if not browse_path.exists():
    # Fall back to first available drive or home
    fallback_path = None
    if platform.system() == "Windows":
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if Path(drive).exists():
                fallback_path = Path(drive)
                break
    else:
        fallback_path = Path.home()

    if fallback_path:
        browse_path = fallback_path
    else:
        return {"success": False, ...}  # Only fail if no fallback
```

### Fix 2: Better Error Recovery in Frontend (FolderBrowser.tsx)
Show drives even when there's an error, so user can navigate.

**Location:** `frontend/src/components/FolderBrowser.tsx` lines 180-184

**Change:** When error occurs, still show drive selector and allow navigation.

### Fix 3: Add "drives" to Error Response (api.py)
Include available drives in error responses so frontend can display them.

**Location:** `logtail_dashboard/api.py` error return statements

---

## Implementation Plan

| Step | File | Change |
|------|------|--------|
| 1 | `api.py` | Add fallback logic when path doesn't exist |
| 2 | `api.py` | Include drives list in error responses |
| 3 | `FolderBrowser.tsx` | Show drives even when error occurs |
| 4 | `FolderBrowser.tsx` | Add "Reset to default" button |
| 5 | Build & test | Rebuild frontend, test on clean system |

---

## Testing

After fix:
1. Delete `config.json` from build folder
2. Run exe fresh
3. Go to Settings → Browse
4. Should show available drives even if default path doesn't exist
5. Should be able to navigate to any folder
