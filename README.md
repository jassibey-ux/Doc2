# SCENSUS MOPS Platform

Clean-room starter for the SCENSUS Maritime Operations Platform (MOPS). The repository includes:

- **client/** – React + Vite front-end with a bespoke design system.
- **server/** – Fastify + TypeScript API talking to Postgres/PostGIS.
- **db/** – Database scaffolding, migrations, and seed helpers.
- **docker-compose.yml** – Local PostGIS container for development.

## Quick Start

```bash
# 1) Database (PostGIS)
docker compose up postgres -d
psql postgresql://scensus:scensus@localhost:5432/scensus_dev \
  -f db/migrations/001_public_schema.sql \
  -f db/migrations/010_tenant_template.sql \
  -f db/seeds/sm_ghana.sql

# 2) Backend
cd server
npm install
cp .env.example .env
npm run dev

# 3) Frontend
cd ../client
npm install
cp .env.example .env.local   # optional override
npm run dev
```

The client loads data from `http://localhost:4000/api` by default and will surface cameras + oil slick stats for the active tenant (`sm-ghana` unless overridden).

## Project Goals

1. **Design System Foundations** – Tokens, components, and theming optimized for maritime operations centers.
2. **Database Scaffold** – Multi-tenant Postgres/PostGIS schema with key tables (`vessel_positions`, `cameras`, `oil_slicks`, `alerts`).
3. **Full Stack Bootstrap** – Fastify backend + React front-end wired together with sensible defaults and ready-to-extend modules.

Extend iteratively by layering additional features (incidents UI, history playback, sensor ingest adapters) directly on this base.
# scensus-mops
