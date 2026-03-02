# Windows Development + Git Sync Workflow

## Context

Guide for testing and making code changes on a Windows machine, then syncing back to Mac via Git.

---

## Setup: Get the Repo on Windows

### Clone from GitHub
```powershell
git clone <your-github-repo-url>
cd scensus-dashboard
```
Both machines push/pull to the same remote.

---

## Making Changes on Windows + Syncing Back

### On Windows (make changes):
```powershell
# Make your code changes, then:
git add -A
git commit -m "description of changes"
git push origin main
```

### On Mac (pull changes):
```bash
cd /Users/scensus
git pull origin main
```

---

## If You Want to Work on a Branch (Safer)

### On Windows:
```powershell
git checkout -b windows-testing
# make changes
git add -A
git commit -m "changes from windows testing"
git push -u origin windows-testing
```

### On Mac:
```bash
git fetch origin
git checkout main
git merge origin/windows-testing
```

This lets you review Windows changes before merging into main on your Mac.

---

## Prerequisites on Windows (to run the app)

1. **Node.js 18+** — https://nodejs.org
2. **Python 3.11+** — https://python.org (check "Add to PATH")
3. **Visual C++ Build Tools** — https://visualstudio.microsoft.com/visual-cpp-build-tools/ (select "Desktop development with C++") — needed for `better-sqlite3` native compilation
4. **Git** — https://git-scm.com/download/win

### Install steps:
```powershell
# Python deps
cd server && pip install -r requirements.txt && cd ..

# Frontend build
cd frontend && npm install && npm run build && cd ..

# Electron (compiles native modules for Windows)
cd electron && npm install && npm run postinstall

# Run
npm run dev
```

---

## Important Notes

- `node_modules/` and build outputs should be in `.gitignore` — each machine runs its own `npm install` since native modules are platform-specific
- Don't commit `node_modules/`, `electron/out/`, or Python `__pycache__/`
- After pulling on Mac, run `npm install && npm run postinstall` in `electron/` to recompile `better-sqlite3` for macOS if `package.json` changed
