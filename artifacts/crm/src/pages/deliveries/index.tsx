import { useState, type ReactNode } from "react";
import { useListDeliveries, useUpdateDelivery, useDeleteDelivery, useListUsers, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, UrgencyBadge, PriorityBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Truck, AlertCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DeleteConfirm } from "@/components/delete-confirm";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canDelete = !!user && ["owner_admin", "general_manager", "channel_manager", "sales"].includes(user.role);

  const { data: deliveries, isLoading } = useListDeliveries();

  const deleteDelivery = useDeleteDelivery({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
        toast({ title: "Delivery deleted" });
      },
      onError: (e: any) => toast({ title: "Could not delete delivery", description: e?.error ?? "Try again", variant: "destructive" }),
    },
  });

  function renderDelete(d: any) {
    if (!canDelete || d.status === "approved") return null;
    return (
      <DeleteConfirm
        title={`Delete delivery ${d.deliveryNumber ?? `#${d.id}`}?`}
        description="This will remove the delivery and any uploaded documentation. The order will move back to planned. This cannot be undone."
        confirmLabel="Delete delivery"
        disabled={deleteDelivery.isPending}
        testId={`button-delete-delivery-${d.id}`}
        onConfirm={() => deleteDelivery.mutate({ id: d.id })}
      />
    );
  }

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
                <DeliveryCard key={d.id} delivery={d} deleteSlot={renderDelete(d)} />
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
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(deliveries ?? []).map((d: any) => {
                  const overdue = isOverdue(d);
                  return (
                  <tr key={d.id} className={`hover:bg-muted/20 transition-colors ${overdue ? "bg-red-50/50" : ""}`}>
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{d.deliveryNumber ?? `#${d.id}`}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={d.customerPriority} />
                        <span className="text-sm font-medium">{d.customerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{formatDate(d.scheduledDate)}</span>
                        {overdue && <OverdueBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {d.driverName ?? (
                        d.status === "unassigned"
                          ? <div className="w-44"><AssignDriverControl deliveryId={d.id} compact /></div>
                          : <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
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
                    <td className="px-4 py-3 text-right">{renderDelete(d)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function isOverdue(d: any): boolean {
  if (!d.scheduledDate) return false;
  if (["approved", "cancelled"].includes(d.status)) return false;
  const today = new Date().toISOString().split("T")[0];
  return d.scheduledDate < today;
}

function OverdueBadge() {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white px-1.5 py-0.5 rounded">
      Forsinket
    </span>
  );
}

function DeliveryCard({ delivery: d, deleteSlot }: { delivery: any; deleteSlot?: ReactNode }) {
  const overdue = isOverdue(d);
  return (
    <div className={`bg-white rounded-md shadow-sm border p-3 space-y-2 ${overdue ? "border-red-400 border-2" : ""}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <PriorityBadge priority={d.customerPriority} />
          <span className="text-sm font-medium leading-tight truncate">{d.customerName}</span>
        </div>
        <div className="flex items-center gap-1">
          <UrgencyBadge urgency={d.urgency} />
          {deleteSlot}
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Truck className="h-3 w-3" />
        {d.driverName ?? "No driver"}
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span>{formatDate(d.scheduledDate)}</span>
        {overdue && <OverdueBadge />}
      </div>
      {d.deviationType && (
        <div className="flex items-center gap-1 text-orange-700 text-xs">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate capitalize">{d.deviationType.replace(/_/g, " ")}</span>
        </div>
      )}
      {d.status === "unassigned" && <AssignDriverControl deliveryId={d.id} />}
    </div>
  );
}

function AssignDriverControl({ deliveryId, compact }: { deliveryId: number; compact?: boolean }) {
  const { toast } = useToast();
  const { data: users } = useListUsers();
  const drivers = (users ?? []).filter((u: any) => u.role === "driver" && u.active);
  const update = useUpdateDelivery({
    mutation: {
      onSuccess: () => toast({ title: "Driver assigned" }),
      onError: () => toast({ title: "Failed to assign driver", variant: "destructive" }),
    },
  });

  return (
    <div className={compact ? "" : "pt-1 border-t"}>
      <Select
        disabled={update.isPending}
        onValueChange={(value) => update.mutate({ id: deliveryId, data: { driverId: Number(value) } })}
      >
        <SelectTrigger className={compact ? "h-8 text-xs" : "h-7 text-xs"} data-testid={`select-assign-driver-${deliveryId}`}>
          <div className="flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            <SelectValue placeholder="Assign driver..." />
          </div>
        </SelectTrigger>
        <SelectContent>
          {drivers.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No active drivers</div>
          )}
          {drivers.map((u: any) => (
            <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
