import { t, type DictKey, type Lang } from "@/lib/i18n";

/**
 * Shared inventory status calculation.
 * Single source of truth used by: inventory page, dashboard stock overview, new-order selector.
 *
 * Terminology in this codebase:
 *   quantityAvailable  — units that can still be ordered (not yet reserved)
 *   quantityReserved   — units reserved for pending orders (not yet fulfilled/cancelled)
 *   allocated          — quantityAvailable + quantityReserved  (total units in the pool)
 *
 * Status rules (50 % threshold):
 *   allocated === 0                      → not_allocated
 *   available <= 0  && allocated > 0     → out_of_stock
 *   available/allocated < 0.50           → low_stock
 *   available/allocated >= 0.50          → in_stock
 */

export type InventoryStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "not_allocated";

export interface InventoryStatusResult {
  status: InventoryStatus;
  label: string;
  /** available / allocated ratio — null when not_allocated */
  ratio: number | null;
  /** quantityAvailable + quantityReserved */
  allocated: number;
}

export function calculateInventoryStatus(
  available: number,
  reserved: number,
): InventoryStatusResult {
  const allocated = available + reserved;

  if (allocated === 0) {
    return { status: "not_allocated", label: "Not Allocated", ratio: null, allocated: 0 };
  }
  if (available <= 0) {
    return { status: "out_of_stock", label: "Out of Stock", ratio: 0, allocated };
  }

  const ratio = available / allocated;
  if (ratio < 0.5) {
    return { status: "low_stock", label: "Low Stock", ratio, allocated };
  }
  return { status: "in_stock", label: "In Stock", ratio, allocated };
}

/**
 * Map order source → inventory pool name.
 * Mirrors getPoolNameForOrderSource in artifacts/api-server/src/lib/inventory.ts
 */
const ONLINE_SOURCES = new Set(["web", "online"]);
const SAMPLE_SOURCES = new Set(["sample", "free_issue"]);

export function getPoolNameForSource(orderSource: string): string {
  if (ONLINE_SOURCES.has(orderSource)) return "online_sales";
  if (SAMPLE_SOURCES.has(orderSource)) return "free_samples";
  return "physical_sales"; // covers phone, whatsapp, sales_rep, b2b, direct + unknown
}

/** Human-readable pool labels (matches seed data) */
export const POOL_LABELS: Record<string, string> = {
  physical_sales: "Physical Sales",
  online_sales: "Online Sales",
  free_samples: "Free Samples",
};

const INV_STATUS_DICT_KEY: Record<InventoryStatus, DictKey> = {
  in_stock: "statusInStock",
  low_stock: "statusLowStock",
  out_of_stock: "statusOutOfStock",
  not_allocated: "notAllocated",
};

export function invStatusLabel(status: InventoryStatus, lang: Lang): string {
  return t(INV_STATUS_DICT_KEY[status], lang);
}

const POOL_LABEL_KEY: Record<string, DictKey> = {
  physical_sales: "poolPhysicalSales",
  online_sales: "poolOnlineSales",
  free_samples: "poolFreeSamples",
};

export function poolDisplayLabel(poolName: string, lang: Lang): string {
  const key = POOL_LABEL_KEY[poolName];
  if (!key) return poolName.replace(/_/g, " ");
  return t(key, lang);
}

const MOVEMENT_REASON_KEY: Record<string, DictKey> = {
  order_reserved: "reasonOrderReserved",
  order_cancelled_released: "reasonOrderCancelled",
  order_fulfilled: "reasonOrderFulfilled",
  manual_set: "reasonManualSet",
};

export function movementReasonLabel(reason: string, lang: Lang): string {
  const key = MOVEMENT_REASON_KEY[reason];
  if (!key) return reason.replace(/_/g, " ");
  return t(key, lang);
}

/** Tailwind text-color class for a given status */
export function invStatusTextClass(status: InventoryStatus): string {
  switch (status) {
    case "out_of_stock":  return "text-red-700";
    case "low_stock":     return "text-amber-700";
    case "not_allocated": return "text-gray-500";
    default:              return "text-green-700";
  }
}

/** Tailwind classes for a small badge span */
export function invStatusBadgeClass(status: InventoryStatus): string {
  switch (status) {
    case "out_of_stock":  return "bg-red-100 text-red-800 border-red-200";
    case "low_stock":     return "bg-amber-100 text-amber-800 border-amber-200";
    case "not_allocated": return "bg-gray-100 text-gray-600 border-gray-200";
    default:              return "bg-green-100 text-green-800 border-green-200";
  }
}
