import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useListOrders, useSendOrderToPlanning, useDeleteOrder, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, UrgencyBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Send, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DeleteConfirm } from "@/components/delete-confirm";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { channelDisplayLabel } from "@/lib/customer-options";

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
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground whitespace-nowrap ${className ?? ""}`}
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

type PayStatus = "not_invoiced" | "paid" | "unpaid" | "overdue";

function computePayStatus(o: any): PayStatus {
  if (o.paymentStatus === "paid") return "paid";
  if (!o.invoiceDate) return "not_invoiced";
  const today = new Date().toISOString().split("T")[0];
  if (o.dueDate && o.dueDate < today) return "overdue";
  return "unpaid";
}

function PaymentBadge({ status }: { status: PayStatus }) {
  const { lang } = useLang();
  if (status === "not_invoiced") return <span className="text-xs text-muted-foreground">—</span>;
  const cls: Record<string, string> = {
    paid:    "bg-green-100 text-green-800 border-green-200",
    unpaid:  "bg-yellow-100 text-yellow-800 border-yellow-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
  };
  const labelMap = { paid: t("paid", lang), unpaid: t("unpaid", lang), overdue: t("overdue", lang) };
  return <Badge variant="outline" className={`text-xs ${cls[status]}`}>{labelMap[status]}</Badge>;
}

export default function OrdersPage() {
  const [search,         setSearch]         = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [status,         setStatus]         = useState("all");
  const [channel,        setChannel]        = useState("all");
  const [urgency,        setUrgency]        = useState("all");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [totalMin,       setTotalMin]       = useState("");
  const [totalMax,       setTotalMax]       = useState("");
  const [paymentFilter,  setPaymentFilter]  = useState("all");
  const [sortKey,        setSortKey]        = useState<SortKey>("orderNumber");
  const [sortDir,        setSortDir]        = useState<SortDir>("desc");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { channel: globalChannel } = useChannel();
  const { lang } = useLang();

  // Server-side: order number / text search + status filter
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

  const channelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of (orders ?? []) as any[]) {
      if (!o.businessChannel) continue;
      if (globalChannel === "cosmetics" && o.businessChannel !== "cosmetics") continue;
      if (globalChannel === "coffee" && o.businessChannel === "cosmetics") continue;
      seen.add(o.businessChannel);
    }
    return Array.from(seen).sort();
  }, [orders, globalChannel]);

  // Client-side filtering: global channel, customer name, channel, urgency, date, total, payment status
  const filtered = useMemo(() => {
    let list = (orders ?? []) as any[];
    // Global channel filter (sidebar)
    if (globalChannel === "cosmetics") list = list.filter(o => o.businessChannel === "cosmetics");
    else if (globalChannel === "coffee") list = list.filter(o => o.businessChannel !== "cosmetics");
    if (customerSearch.trim()) {
      const cs = customerSearch.toLowerCase().trim();
      list = list.filter(o => (o.customerName ?? "").toLowerCase().includes(cs));
    }
    if (channel !== "all") list = list.filter(o => o.businessChannel === channel);
    if (urgency !== "all") list = list.filter(o => o.urgency === urgency);
    if (dateFrom) list = list.filter(o => o.requestedDeliveryDate && o.requestedDeliveryDate >= dateFrom);
    if (dateTo)   list = list.filter(o => o.requestedDeliveryDate && o.requestedDeliveryDate <= dateTo);
    if (totalMin.trim()) list = list.filter(o => (o.totalAmount ?? 0) >= parseFloat(totalMin));
    if (totalMax.trim()) list = list.filter(o => (o.totalAmount ?? 0) <= parseFloat(totalMax));
    if (paymentFilter !== "all") list = list.filter(o => computePayStatus(o) === paymentFilter);
    return list;
  }, [orders, globalChannel, customerSearch, channel, urgency, dateFrom, dateTo, totalMin, totalMax, paymentFilter]);

  const sorted = useMemo(() => sortOrders(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const hasFilters = !!(search || customerSearch || status !== "all" || channel !== "all" || urgency !== "all" || dateFrom || dateTo || totalMin || totalMax || paymentFilter !== "all");

  function clearFilters() {
    setSearch(""); setCustomerSearch(""); setStatus("all"); setChannel("all"); setUrgency("all");
    setDateFrom(""); setDateTo(""); setTotalMin(""); setTotalMax(""); setPaymentFilter("all");
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("orders", lang)}</h1>
          <p className="text-muted-foreground text-sm">{sorted.length}{hasFilters ? ` of ${orders?.length ?? 0}` : ""} {t("records", lang)}</p>
        </div>
        <Link href="/orders/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            {t("newOrder", lang)}
          </Button>
        </Link>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-muted/20 border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{t("filters", lang)}</span>
        </div>

        {/* Row 1: text searches + status/channel/urgency */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("searchOrder", lang)}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs pl-7 w-32"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("searchCustomerName", lang)}
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              className="h-8 text-xs pl-7 w-44"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder={t("allStatuses", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses", lang)}</SelectItem>
              <SelectItem value="new">{t("statusNew", lang)}</SelectItem>
              <SelectItem value="incomplete">{t("incomplete", lang)}</SelectItem>
              <SelectItem value="blocked">{t("statusBlocked", lang)}</SelectItem>
              <SelectItem value="planned">{t("planned", lang)}</SelectItem>
              <SelectItem value="out_for_delivery">{t("outForDelivery", lang)}</SelectItem>
              <SelectItem value="awaiting_accounting_approval">{t("awaitingApproval", lang)}</SelectItem>
              <SelectItem value="approved">{t("approved", lang)}</SelectItem>
              <SelectItem value="cancelled">{t("cancelled", lang)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder={t("allChannels", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allChannels", lang)}</SelectItem>
              {channelOptions.map(c => <SelectItem key={c} value={c}>{channelDisplayLabel(c, lang)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder={t("allUrgency", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allUrgency", lang)}</SelectItem>
              <SelectItem value="critical">{t("critical", lang)}</SelectItem>
              <SelectItem value="high">{t("high", lang)}</SelectItem>
              <SelectItem value="normal">{t("normal", lang)}</SelectItem>
              <SelectItem value="low">{t("low", lang)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: date range + total range + payment status */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("deliveryDate", lang)}</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{t("orderTotalFilter", lang)}</span>
          <Input placeholder={t("from", lang)} value={totalMin} onChange={e => setTotalMin(e.target.value)} className="h-8 text-xs w-24" type="number" min="0" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input placeholder={t("to", lang)}   value={totalMax} onChange={e => setTotalMax(e.target.value)} className="h-8 text-xs w-24" type="number" min="0" />
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder={t("allPayments", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allPayments", lang)}</SelectItem>
              <SelectItem value="paid">{t("paid", lang)}</SelectItem>
              <SelectItem value="unpaid">{t("unpaid", lang)}</SelectItem>
              <SelectItem value="overdue">{t("overdue", lang)}</SelectItem>
              <SelectItem value="not_invoiced">{t("notInvoiced", lang)}</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              {t("clearFilters", lang)}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/40">
                <ColHeader label="#"                        col="orderNumber"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label={t("customerHeader", lang)} col="customer"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label={t("channel", lang)}       col="channel"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label={t("deliveryDate", lang)}  col="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label={t("urgency", lang)}       col="urgency"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label={t("total", lang)}         col="total"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ColHeader label={t("status", lang)}        col="status"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{t("paymentHeader", lang)}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("actionsHeader", lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">{t("loading", lang)}</td></tr>
              )}
              {!isLoading && sorted.map((o: any) => (
                <tr
                  key={o.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{o.orderNumber ?? `#${o.id}`}</td>
                  <td className="px-4 py-3 text-sm font-medium">{o.customerName}</td>
                  <td className="px-4 py-3 text-sm">{channelDisplayLabel(o.businessChannel, lang)}</td>
                  <td className="px-4 py-3 text-sm">{formatDate(o.requestedDeliveryDate)}</td>
                  <td className="px-4 py-3"><UrgencyBadge urgency={o.urgency} /></td>
                  <td className="px-4 py-3 text-sm font-medium">{formatCurrency(o.totalAmount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3"><PaymentBadge status={computePayStatus(o)} /></td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {(o.status === "incomplete" || o.status === "blocked" || o.status === "new") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendToPlanning.isPending}
                          onClick={() => sendToPlanning.mutate({ id: o.id })}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          {t("sendToPlanning", lang)}
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
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">{hasFilters ? t("noOrdersMatchFilters", lang) : t("noOrders", lang)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
