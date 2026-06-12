import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useListOrders, useSendOrderToPlanning, useDeleteOrder, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, UrgencyBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Search, Send, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DeleteConfirm } from "@/components/delete-confirm";

type SortKey = "orderNumber" | "customer" | "channel" | "deliveryDate" | "urgency" | "total" | "status";
type SortDir = "asc" | "desc";

const URGENCY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_ORDER = ["new", "incomplete", "blocked", "planned", "out_for_delivery", "awaiting_accounting_approval", "approved", "cancelled"];

function sortOrders(list: any[], key: SortKey, dir: SortDir): any[] {
  return [...list].sort((a, b) => {
    let va: any, vb: any;
    switch (key) {
      case "orderNumber":  va = a.orderNumber ?? ""; vb = b.orderNumber ?? ""; break;
      case "customer":     va = a.customerName ?? ""; vb = b.customerName ?? ""; break;
      case "channel":      va = a.businessChannel ?? ""; vb = b.businessChannel ?? ""; break;
      case "deliveryDate": va = a.requestedDeliveryDate ?? ""; vb = b.requestedDeliveryDate ?? ""; break;
      case "urgency":
        va = URGENCY_ORDER[a.urgency] ?? 9;
        vb = URGENCY_ORDER[b.urgency] ?? 9;
        return dir === "asc" ? va - vb : vb - va;
      case "total":
        va = a.totalAmount ?? 0; vb = b.totalAmount ?? 0;
        return dir === "asc" ? va - vb : vb - va;
      case "status":
        va = STATUS_ORDER.indexOf(a.status); vb = STATUS_ORDER.indexOf(b.status);
        return dir === "asc" ? va - vb : vb - va;
      default: return 0;
    }
    const cmp = String(va).localeCompare(String(vb));
    return dir === "asc" ? cmp : -cmp;
  });
}

function ColHeader({ label, col, sortKey, sortDir, onSort, className }: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {!active && <ArrowUpDown className="h-3 w-3 opacity-40" />}
        {active && sortDir === "asc"  && <ArrowUp   className="h-3 w-3 text-primary" />}
        {active && sortDir === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
      </span>
    </th>
  );
}

export default function OrdersPage() {
  const [search,     setSearch]     = useState("");
  const [status,     setStatus]     = useState("all");
  const [channel,    setChannel]    = useState("all");
  const [urgency,    setUrgency]    = useState("all");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [totalMin,   setTotalMin]   = useState("");
  const [totalMax,   setTotalMax]   = useState("");
  const [sortKey,    setSortKey]    = useState<SortKey>("orderNumber");
  const [sortDir,    setSortDir]    = useState<SortDir>("desc");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all orders (search is client-side below, but we still pass it to the API for server-side text search)
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (status !== "all") params.status = status;

  const { data: orders, isLoading } = useListOrders(params as any);

  const { user } = useAuth();
  const canDelete = !!user && ["owner_admin", "general_manager", "channel_manager", "sales"].includes(user.role);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const sendToPlanning = useSendOrderToPlanning({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order sent to planning" });
      },
      onError: (e: any) => toast({ title: "Cannot plan order", description: e?.error ?? "Order is still incomplete", variant: "destructive" }),
    },
  });

  const deleteOrder = useDeleteOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order deleted" });
      },
      onError: (e: any) => toast({ title: "Could not delete order", description: e?.error ?? "Try again", variant: "destructive" }),
    },
  });

  // Build channel options dynamically
  const channelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of (orders ?? []) as any[]) {
      if (o.businessChannel) seen.add(o.businessChannel);
    }
    return Array.from(seen).sort();
  }, [orders]);

  // Client-side filtering (channel, urgency, date, total on top of server-side search/status)
  const filtered = useMemo(() => {
    let list = (orders ?? []) as any[];
    if (channel !== "all") list = list.filter(o => o.businessChannel === channel);
    if (urgency !== "all") list = list.filter(o => o.urgency === urgency);
    if (dateFrom) list = list.filter(o => o.requestedDeliveryDate && o.requestedDeliveryDate >= dateFrom);
    if (dateTo)   list = list.filter(o => o.requestedDeliveryDate && o.requestedDeliveryDate <= dateTo);
    if (totalMin.trim()) list = list.filter(o => (o.totalAmount ?? 0) >= parseFloat(totalMin));
    if (totalMax.trim()) list = list.filter(o => (o.totalAmount ?? 0) <= parseFloat(totalMax));
    return list;
  }, [orders, channel, urgency, dateFrom, dateTo, totalMin, totalMax]);

  const sorted = useMemo(() => sortOrders(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const hasFilters = search || status !== "all" || channel !== "all" || urgency !== "all" || dateFrom || dateTo || totalMin || totalMax;

  function clearFilters() {
    setSearch(""); setStatus("all"); setChannel("all"); setUrgency("all");
    setDateFrom(""); setDateTo(""); setTotalMin(""); setTotalMax("");
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{sorted.length}{hasFilters ? ` of ${orders?.length ?? 0}` : ""} records</p>
        </div>
        <Link href="/orders/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            New Order
          </Button>
        </Link>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-muted/20 border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filters</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs pl-7 w-44"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
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
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Channels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channelOptions.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Urgency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgency</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Delivery date</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">Total</span>
          <Input placeholder="Min" value={totalMin} onChange={e => setTotalMin(e.target.value)} className="h-8 text-xs w-24" type="number" min="0" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input placeholder="Max" value={totalMax} onChange={e => setTotalMax(e.target.value)} className="h-8 text-xs w-24" type="number" min="0" />
          {hasFilters && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <ColHeader label="#"            col="orderNumber"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label="Customer"     col="customer"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label="Channel"      col="channel"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label="Delivery Date" col="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label="Urgency"      col="urgency"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label="Total"        col="total"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label="Status"       col="status"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading...</td></tr>
              )}
              {!isLoading && sorted.map((o: any) => (
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
                    <div className="flex items-center justify-end gap-1">
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
                      {canDelete && o.status !== "approved" && (
                        <DeleteConfirm
                          title={`Delete order ${o.orderNumber ?? `#${o.id}`}?`}
                          description="This will remove the order, its items, and any unapproved deliveries and documentation. This cannot be undone."
                          confirmLabel="Delete order"
                          disabled={deleteOrder.isPending}
                          testId={`button-delete-order-${o.id}`}
                          onConfirm={() => deleteOrder.mutate({ id: o.id })}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && sorted.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">{hasFilters ? "No orders match the current filters." : "No orders found"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
