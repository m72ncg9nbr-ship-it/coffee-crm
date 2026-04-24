# Coffee CRM — Distribution Operations

## Overview

A full-stack CRM for a coffee distribution business. Role-based access (admin, operations, sales, driver, accounting), customer management, lead intake, product catalog, order management, kanban delivery board, driver mobile view, and accounting approval queue.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- **API Server** (`artifacts/api-server`) — Express 5 REST API at `/api/*` with session auth
- **Coffee CRM** (`artifacts/crm`) — React+Vite SPA at `/`

## Authentication

Session-based auth using express-session + Node.js crypto (scrypt). No bcrypt.
- Login: `POST /api/auth/login`
- Logout: `POST /api/auth/logout`
- Current user: `GET /api/auth/me`

## Demo Accounts

| Username | Password   | Role        | Default Route |
|----------|------------|-------------|---------------|
| admin    | admin123   | admin       | /dashboard    |
| ops1     | ops123     | operations  | /dashboard    |
| sales1   | sales123   | sales       | /dashboard    |
| driver1  | driver123  | driver      | /driver       |
| acct1    | acct123    | accounting  | /accounting   |

## Role Access

| Page        | admin | operations | sales | driver | accounting |
|-------------|-------|------------|-------|--------|------------|
| Dashboard   | ✓     | ✓          | ✓     |        | ✓          |
| Customers   | ✓     | ✓          | ✓     |        |            |
| Leads       | ✓     |            | ✓     |        |            |
| Products    | ✓     | ✓          | ✓     |        |            |
| Orders      | ✓     | ✓          | ✓     |        |            |
| Deliveries  | ✓     | ✓          |       |        |            |
| Approvals   | ✓     |            |       |        | ✓          |
| Activity    | ✓     | ✓          |       |        |            |
| Driver View |       |            |       | ✓      |            |

## DB Schema

Tables: users, customers, customer_addresses, leads, products, orders, order_items, deliveries, delivery_documents, accounting_approvals, activity_logs

## API Notes

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-spec/orval.config.ts` — codegen config (schemas path removed to avoid conflict)
- `lib/api-zod/src/index.ts` — must only export `./generated/api` (codegen overwrites it)
- CORS configured with `credentials: true`
- Frontend overrides `window.fetch` to always include `credentials: "include"`
