import { useState } from "react";
import { Link } from "wouter";
import { useListOrders, useSendOrderToPlanning, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, UrgencyBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Search, Send } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function OrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (status !== "all") params.status = status;

  const { data: orders, isLoading } = useListOrders(params as any);

  const sendToPlanning = useSendOrderToPlanning({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order sent to planning" });
      },
      onError: (e: any) => toast({ title: "Cannot plan order", description: e?.error ?? "Order is still incomplete", variant: "destructive" }),
    },
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{orders?.length ?? 0} records</p>
        </div>
        <Link href="/orders/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
            <SelectItem value="awaiting_accounting_approval">Awaiting Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Delivery Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Urgency</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading...</td></tr>
              )}
              {!isLoading && (orders ?? []).map((o: any) => (
                <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{o.orderNumber ?? `#${o.id}`}</td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`}>
                      <span className="text-sm font-medium text-primary hover:underline cursor-pointer">{o.customerName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize">{o.businessChannel}</td>
                  <td className="px-4 py-3 text-sm">{formatDate(o.requestedDeliveryDate)}</td>
                  <td className="px-4 py-3"><UrgencyBadge urgency={o.urgency} /></td>
                  <td className="px-4 py-3 text-sm font-medium">{formatCurrency(o.totalAmount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {(o.status === "incomplete" || o.status === "blocked" || o.status === "new") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendToPlanning.isPending}
                        onClick={() => sendToPlanning.mutate({ id: o.id })}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Send to planning
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (orders ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
