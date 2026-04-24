import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: "A" | "B" | "C" | string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
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
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
      urgency === "critical" && "bg-red-100 text-red-800",
      urgency === "high" && "bg-orange-100 text-orange-800",
      urgency === "normal" && "bg-blue-100 text-blue-800",
      urgency === "low" && "bg-gray-100 text-gray-600",
      className
    )}>
      {urgency}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    confirmed: "bg-blue-100 text-blue-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-600",
    unassigned: "bg-gray-100 text-gray-600",
    assigned: "bg-blue-100 text-blue-800",
    in_transit: "bg-yellow-100 text-yellow-800",
    arrived: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    awaiting_accounting_approval: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    pending: "bg-amber-100 text-amber-800",
    qualified: "bg-green-100 text-green-800",
    manual_review: "bg-orange-100 text-orange-800",
    in_stock: "bg-green-100 text-green-800",
    low_stock: "bg-amber-100 text-amber-800",
    out_of_stock: "bg-red-100 text-red-800",
  };

  const label = status.replace(/_/g, " ");
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
      statusConfig[status] ?? "bg-gray-100 text-gray-600",
      className
    )}>
      {label}
    </span>
  );
}
