import { cn } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";
import { t, type DictKey } from "@/lib/i18n";

interface PriorityBadgeProps {
  priority: "A" | "B" | "C" | string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold",
      priority === "A" && "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
      priority === "B" && "bg-blue-100 text-blue-800 ring-1 ring-blue-300",
      priority === "C" && "bg-gray-100 text-gray-600 ring-1 ring-gray-300",
      className
    )}>
      {priority}
    </span>
  );
}

interface UrgencyBadgeProps {
  urgency: string;
  className?: string;
}

export function UrgencyBadge({ urgency, className }: UrgencyBadgeProps) {
  const { lang } = useLang();
  const URGENCY_LABEL_MAP: Record<string, DictKey> = {
    critical: "critical",
    high: "high",
    normal: "normal",
    low: "low",
  };
  const label = URGENCY_LABEL_MAP[urgency] ? t(URGENCY_LABEL_MAP[urgency], lang) : urgency;
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset",
      urgency === "critical" && "bg-red-50 text-red-700 ring-red-200",
      urgency === "high" && "bg-orange-50 text-orange-700 ring-orange-200",
      urgency === "normal" && "bg-blue-50 text-blue-700 ring-blue-200",
      urgency === "low" && "bg-gray-50 text-gray-600 ring-gray-200",
      className
    )}>
      {label}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { lang } = useLang();
  const STATUS_LABEL_MAP: Record<string, DictKey> = {
    new: "statusNew",
    planned: "planned",
    out_for_delivery: "outForDelivery",
    awaiting_accounting_approval: "awaitingApproval",
    approved: "approved",
    cancelled: "cancelled",
    incomplete: "incomplete",
    blocked: "statusBlocked",
    unassigned: "statusUnassigned",
    assigned: "statusAssigned",
    arrived: "statusArrived",
    issue_reported: "statusIssueReported",
    pending: "pending",
    rejected: "rejected",
    qualified: "statusQualified",
    manual_review: "statusManualReview",
    converted_to_customer: "statusConverted",
    auto_qualified: "autoQualified",
    in_stock: "statusInStock",
    low_stock: "statusLowStock",
    out_of_stock: "statusOutOfStock",
  };
  const statusConfig: Record<string, string> = {
    // Order statuses
    new: "bg-gray-50 text-gray-700 ring-gray-200",
    planned: "bg-blue-50 text-blue-700 ring-blue-200",
    out_for_delivery: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    awaiting_accounting_approval: "bg-amber-50 text-amber-700 ring-amber-200",
    approved: "bg-green-50 text-green-700 ring-green-200",
    cancelled: "bg-red-50 text-red-600 ring-red-200",
    incomplete: "bg-orange-50 text-orange-700 ring-orange-200",
    blocked: "bg-rose-50 text-rose-700 ring-rose-200",
    // Delivery statuses
    unassigned: "bg-gray-50 text-gray-600 ring-gray-200",
    assigned: "bg-blue-50 text-blue-700 ring-blue-200",
    arrived: "bg-purple-50 text-purple-700 ring-purple-200",
    issue_reported: "bg-red-50 text-red-700 ring-red-200",
    // Approval / lead statuses
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    rejected: "bg-red-50 text-red-700 ring-red-200",
    qualified: "bg-green-50 text-green-700 ring-green-200",
    manual_review: "bg-orange-50 text-orange-700 ring-orange-200",
    converted_to_customer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    auto_qualified: "bg-teal-50 text-teal-700 ring-teal-200",
    // Product stock
    in_stock: "bg-green-50 text-green-700 ring-green-200",
    low_stock: "bg-amber-50 text-amber-700 ring-amber-200",
    out_of_stock: "bg-red-50 text-red-700 ring-red-200",
  };

  const label = STATUS_LABEL_MAP[status] ? t(STATUS_LABEL_MAP[status], lang) : status.replace(/_/g, " ");
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset",
      statusConfig[status] ?? "bg-gray-50 text-gray-600 ring-gray-200",
      className
    )}>
      {label}
    </span>
  );
}
