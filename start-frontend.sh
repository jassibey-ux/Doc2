#!/bin/bash
cd /tmp/docnock-analysis/frontend/DocNockFrontend-main
PATH="/opt/homebrew/opt/node@20/bin:$PATH"
exec node_modules/.bin/ng serve --port 4200
