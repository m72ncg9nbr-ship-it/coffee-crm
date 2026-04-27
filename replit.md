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

### Key fields per spec (Wave 1 + 2)
- `users`: phone, channel_scope (`all`/`horeca`/`retail`)
- `customers`: created_by_user_id
- `customer_addresses`: district, notes, is_delivery_address, is_billing_address (no `address_type`)
- `leads`: status (`new`/`qualified`/`manual_review`/`converted_to_customer`/`rejected`), qualification_result, qualification_reason
- `orders`: order_number (`ORD-NNNN`), status (`new`/`planned`/`out_for_delivery`/`awaiting_accounting_approval`/`approved`/`cancelled`), approved_by_accounting_user_id, approved_at, invoice_triggered_at
- `deliveries`: delivery_number (`DEL-NNNN`), delivery_address_id, planned_sequence, planned_by_user_id, status (`unassigned`/`assigned`/`arrived`/`awaiting_accounting_approval`/`approved`/`issue_reported`), arrival_marked_at, documentation_uploaded_at
- `accounting_approvals`: order_id (in addition to delivery_id)
- `activity_logs`: action_type, action_label, metadata_json

### Order/Delivery flow
1. Sales creates order → status `new`, auto-numbered ORD-NNNN
2. Ops assigns delivery → status `assigned` on delivery, `out_for_delivery` on order, auto-numbered DEL-NNNN, `planned_by_user_id` set
3. Driver marks `arrived` → `arrival_marked_at` set
4. Driver uploads documentation → delivery status `awaiting_accounting_approval`, `documentation_uploaded_at` set, accounting approval row created with both `delivery_id` and `order_id`, order status `awaiting_accounting_approval`
5. Accounting approves at `POST /api/accounting/approvals/:deliveryId/approve` → delivery `approved`, `invoice_triggered`/`invoice_triggered_at` set, order `approved` with `approved_by_accounting_user_id`/`approved_at`/`invoice_triggered_at`

## API Notes

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-spec/orval.config.ts` — codegen config (schemas path removed to avoid conflict)
- `lib/api-zod/src/index.ts` — must only export `./generated/api` (codegen overwrites it)
- CORS configured with `credentials: true`
- Frontend overrides `window.fetch` to always include `credentials: "include"`

## Recent Changes — Spec Gap Closures

- **5.2 Lead auto-scoring**: leads list shows green "Auto-qualified" or amber "Needs review" badge per `qualificationResult`, plus the scoring reason text. POST /leads also seeds `followUpDueAt = now + 24h`.
- **6.2 Order create auto-fill**: new page `/orders/new` (`artifacts/crm/src/pages/orders/new.tsx`). Selecting customer surfaces payment terms, discount, channel, default delivery address, priority. Live completeness sidebar (4 checks) reflects backend `evaluateOrderCompleteness` (items + delivery address + date) and predicts `planned` vs `incomplete`.
- **6.4 Forsinket badge**: deliveries board cards (red double border) and list rows (red row tint) show red "Forsinket" badge when `scheduledDate < today` and status not in (approved, cancelled).
- **6.5 / 6.9 Auto follow-ups**: leads schema has `followUpDueAt` + `followUpCompletedAt` columns. New `overdueLeadFollowUps` panel in `/dashboard/today-priorities` and inline overdue banner on each lead card. Deviations remain surfaced via existing "Open deviations" panel.
- **6.6 Compact accounting summary**: `enrichApprovals` (accounting.ts) now joins orders, order_items, products, delivery_documents, drivers. Approval card shows ORD/DEL number badges, NOK total, items list, "View document" link, deviation note, reviewer + reviewedAt. Added `reviewedAt` column on `accounting_approvals`.
