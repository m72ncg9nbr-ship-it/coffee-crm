import { useState } from "react";
import { useListDeliveries } from "@workspace/api-client-react";
import { StatusBadge, UrgencyBadge, PriorityBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Truck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BOARD_COLUMNS = [
  { status: "unassigned", label: "Unassigned", color: "border-gray-300 bg-gray-50" },
  { status: "assigned", label: "Assigned", color: "border-blue-300 bg-blue-50" },
  { status: "arrived", label: "Arrived", color: "border-purple-300 bg-purple-50" },
  { status: "awaiting_accounting_approval", label: "Awaiting Approval", color: "border-amber-300 bg-amber-50" },
  { status: "approved", label: "Approved", color: "border-green-300 bg-green-50" },
  { status: "issue_reported", label: "Issue Reported", color: "border-red-300 bg-red-50" },
];

export default function DeliveriesPage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [dateFilter, setDateFilter] = useState("all");

  const { data: deliveries, isLoading } = useListDeliveries();

  const grouped = BOARD_COLUMNS.reduce((acc, col) => {
    acc[col.status] = (deliveries ?? []).filter((d: any) => d.status === col.status);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Delivery Board</h1>
          <p className="text-muted-foreground text-sm">{deliveries?.length ?? 0} deliveries</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView("board")}
              className={cn("px-3 py-1.5 text-sm font-medium transition-colors", view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("px-3 py-1.5 text-sm font-medium transition-colors", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">Loading deliveries...</div>}

      {!isLoading && view === "board" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map(col => (
            <div key={col.status} className={cn("shrink-0 w-64 rounded-lg border-2 p-3 space-y-2", col.color)}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{col.label}</span>
                <span className="text-xs bg-white rounded-full px-2 py-0.5 font-semibold shadow-sm">{grouped[col.status]?.length ?? 0}</span>
              </div>
              {(grouped[col.status] ?? []).map((d: any) => (
                <DeliveryCard key={d.id} delivery={d} />
              ))}
              {(grouped[col.status] ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 italic">No deliveries</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && view === "list" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Urgency</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Deviation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(deliveries ?? []).map((d: any) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{d.deliveryNumber ?? `#${d.id}`}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={d.customerPriority} />
                        <span className="text-sm font-medium">{d.customerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatDate(d.scheduledDate)}</td>
                    <td className="px-4 py-3 text-sm">{d.driverName ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-4 py-3"><UrgencyBadge urgency={d.urgency} /></td>
                    <td className="px-4 py-3">
                      {d.deviationType ? (
                        <div className="flex items-center gap-1 text-orange-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span className="text-xs capitalize">{d.deviationType.replace(/_/g, " ")}</span>
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function DeliveryCard({ delivery: d }: { delivery: any }) {
  return (
    <div className="bg-white rounded-md shadow-sm border p-3 space-y-2">
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <PriorityBadge priority={d.customerPriority} />
          <span className="text-sm font-medium leading-tight truncate">{d.customerName}</span>
        </div>
        <UrgencyBadge urgency={d.urgency} />
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Truck className="h-3 w-3" />
        {d.driverName ?? "No driver"}
      </div>
      <div className="text-xs text-muted-foreground">{formatDate(d.scheduledDate)}</div>
      {d.deviationType && (
        <div className="flex items-center gap-1 text-orange-700 text-xs">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate capitalize">{d.deviationType.replace(/_/g, " ")}</span>
        </div>
      )}
    </div>
  );
}
