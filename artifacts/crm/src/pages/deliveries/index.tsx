import { useState, useMemo, type ReactNode } from "react";
import {
  useListDeliveries, useUpdateDelivery, useDeleteDelivery,
  useListUsers, getListDeliveriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, UrgencyBadge, PriorityBadge } from "@/components/priority-badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { Truck, AlertCircle, UserPlus, Search, X, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DeleteConfirm } from "@/components/delete-confirm";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t, type DictKey } from "@/lib/i18n";

// ── Board column definitions ──────────────────────────────────────────────────
const BOARD_COLUMNS: { status: string; labelKey: DictKey; color: string }[] = [
  { status: "unassigned",                   labelKey: "statusUnassigned",   color: "border-gray-300 bg-gray-50" },
  { status: "assigned",                     labelKey: "statusAssigned",     color: "border-blue-300 bg-blue-50" },
  { status: "arrived",                      labelKey: "statusArrived",      color: "border-purple-300 bg-purple-50" },
  { status: "awaiting_accounting_approval", labelKey: "awaitingApproval",   color: "border-amber-300 bg-amber-50" },
  { status: "approved",                     labelKey: "approved",           color: "border-green-300 bg-green-50" },
  { status: "issue_reported",               labelKey: "statusIssueReported",color: "border-red-300 bg-red-50" },
];

const STATUS_ORDER = BOARD_COLUMNS.map(c => c.status);

// ── Sort option keys (labels resolved inside component using t()) ─────────────
const SORT_OPTION_KEYS: { value: string; labelKey: DictKey }[] = [
  { value: "date_asc",          labelKey: "sortByDeliveryDateAsc" },
  { value: "date_desc",         labelKey: "sortByDeliveryDateDesc" },
  { value: "customer_asc",      labelKey: "sortByCustomerAZ" },
  { value: "customer_desc",     labelKey: "sortByCustomerZA" },
  { value: "driver_asc",        labelKey: "sortByDriverAZ" },
  { value: "driver_desc",       labelKey: "sortByDriverAZ" },
  { value: "priority_high",     labelKey: "sortByUrgencyHigh" },
  { value: "priority_low",      labelKey: "sortByUrgencyLow" },
  { value: "status",            labelKey: "sortByStatusAsc" },
  { value: "delayed_first",     labelKey: "sortOverdueFirst" },
  { value: "not_delayed_first", labelKey: "sortNotOverdueFirst" },
  { value: "delivery_asc",      labelKey: "sortByDeliveryDateAsc" },
  { value: "delivery_desc",     labelKey: "sortByDeliveryDateDesc" },
  { value: "order_asc",         labelKey: "sortByOrderNumAsc" },
  { value: "order_desc",        labelKey: "sortByOrderNumDesc" },
];

const URGENCY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

const DEFAULT_SORT = "date_asc";

// ── Helpers ───────────────────────────────────────────────────────────────────
function isOverdue(d: any): boolean {
  if (!d.scheduledDate) return false;
  if (["approved", "cancelled"].includes(d.status)) return false;
  const today = new Date().toISOString().split("T")[0];
  return d.scheduledDate < today;
}

function sortDeliveries(list: any[], sortBy: string): any[] {
  return [...list].sort((a, b) => {
    switch (sortBy) {
      case "date_asc":          return (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "");
      case "date_desc":         return (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? "");
      case "customer_asc":      return (a.customerName ?? "").localeCompare(b.customerName ?? "");
      case "customer_desc":     return (b.customerName ?? "").localeCompare(a.customerName ?? "");
      case "driver_asc":        return (a.driverName ?? "￿").localeCompare(b.driverName ?? "￿");
      case "driver_desc":       return (b.driverName ?? "￿").localeCompare(a.driverName ?? "￿");
      case "priority_high":     return (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9);
      case "priority_low":      return (URGENCY_ORDER[b.urgency] ?? 9) - (URGENCY_ORDER[a.urgency] ?? 9);
      case "status":            return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      case "delayed_first":     return Number(isOverdue(b)) - Number(isOverdue(a));
      case "not_delayed_first": return Number(isOverdue(a)) - Number(isOverdue(b));
      case "delivery_asc":      return (a.deliveryNumber ?? "").localeCompare(b.deliveryNumber ?? "");
      case "delivery_desc":     return (b.deliveryNumber ?? "").localeCompare(a.deliveryNumber ?? "");
      case "order_asc":         return (a.orderNumber ?? "").localeCompare(b.orderNumber ?? "");
      case "order_desc":        return (b.orderNumber ?? "").localeCompare(a.orderNumber ?? "");
      default: return 0;
    }
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeliveriesPage() {
  const [view, setView] = useState<"board" | "list">("board");

  // Filter state
  const [customerSearch, setCustomerSearch] = useState("");
  const [deliverySearch, setDeliverySearch]  = useState("");
  const [orderSearch, setOrderSearch]        = useState("");
  const [driverFilter, setDriverFilter]      = useState("all");
  const [statusFilter, setStatusFilter]      = useState("all");
  const [priorityFilter, setPriorityFilter]  = useState("all");
  const [dateFrom, setDateFrom]              = useState("");
  const [dateTo, setDateTo]                  = useState("");
  const [delayFilter, setDelayFilter]        = useState("all");
  const [issueFilter, setIssueFilter]        = useState("all");
  const [sortBy, setSortBy]                  = useState(DEFAULT_SORT);

  const queryClient = useQueryClient();
  const { toast }   = useToast();
  const { user }    = useAuth();
  const { channel } = useChannel();
  const { lang }    = useLang();
  const canDelete = !!user &&
    ["owner_admin", "general_manager", "channel_manager", "sales"].includes(user.role);

  const { data: deliveries, isLoading } = useListDeliveries();

  // ── Unique driver names (for filter dropdown) ───────────────────────────────
  const driverOptions = useMemo((): string[] => {
    const seen = new Set<string>();
    for (const d of (deliveries ?? []) as any[]) {
      if (d.driverName) seen.add(d.driverName as string);
    }
    return Array.from(seen).sort();
  }, [deliveries]);

  // ── Active filter check ─────────────────────────────────────────────────────
  const hasFilters =
    customerSearch || deliverySearch || orderSearch ||
    driverFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all" ||
    dateFrom || dateTo || delayFilter !== "all" || issueFilter !== "all";

  function clearFilters() {
    setCustomerSearch(""); setDeliverySearch(""); setOrderSearch("");
    setDriverFilter("all"); setStatusFilter("all"); setPriorityFilter("all");
    setDateFrom(""); setDateTo("");
    setDelayFilter("all"); setIssueFilter("all");
    setSortBy(DEFAULT_SORT);
  }

  // ── Filter pipeline ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = (deliveries ?? []) as any[];

    // Global channel filter
    if (channel === "cosmetics") list = list.filter(d => d.businessChannel === "cosmetics");
    else if (channel === "coffee") list = list.filter(d => d.businessChannel !== "cosmetics");

    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase();
      list = list.filter(d => d.customerName?.toLowerCase().includes(q));
    }
    if (deliverySearch.trim()) {
      const q = deliverySearch.toLowerCase();
      list = list.filter(d => d.deliveryNumber?.toLowerCase().includes(q));
    }
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
      list = list.filter(d => d.orderNumber?.toLowerCase().includes(q));
    }
    if (driverFilter !== "all")   list = list.filter(d => d.driverName === driverFilter);
    if (statusFilter !== "all")   list = list.filter(d => d.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter(d => d.urgency === priorityFilter);
    if (dateFrom) list = list.filter(d => d.scheduledDate && d.scheduledDate >= dateFrom);
    if (dateTo)   list = list.filter(d => d.scheduledDate && d.scheduledDate <= dateTo);
    if (delayFilter === "delayed")     list = list.filter(d => isOverdue(d));
    if (delayFilter === "not_delayed") list = list.filter(d => !isOverdue(d));
    if (issueFilter === "issue")    list = list.filter(d => d.status === "issue_reported");
    if (issueFilter === "no_issue") list = list.filter(d => d.status !== "issue_reported");

    return list;
  }, [deliveries, channel, customerSearch, deliverySearch, orderSearch,
      driverFilter, statusFilter, priorityFilter,
      dateFrom, dateTo, delayFilter, issueFilter]);

  // ── Sort ────────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => sortDeliveries(filtered, sortBy), [filtered, sortBy]);

  // ── Board grouping (uses sorted so cards are sorted within each column) ──────
  const grouped = useMemo(() =>
    BOARD_COLUMNS.reduce((acc, col) => {
      acc[col.status] = sorted.filter((d: any) => d.status === col.status);
      return acc;
    }, {} as Record<string, any[]>),
  [sorted]);

  // ── Delete handler ──────────────────────────────────────────────────────────
  const deleteDelivery = useDeleteDelivery({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
        toast({ title: t("deliveryDeleted", lang) });
      },
      onError: (e: any) =>
        toast({ title: t("couldNotDeleteDelivery", lang), description: e?.error ?? "Try again", variant: "destructive" }),
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

  // ── Subtitle ────────────────────────────────────────────────────────────────
  const total = deliveries?.length ?? 0;
  const subtitle = hasFilters
    ? `${sorted.length} / ${total} ${t("deliveries", lang)}`
    : `${total} ${t("deliveries", lang)}`;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("deliveryBoard", lang)}</h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView("board")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                view === "board"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t("boardView", lang)}
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t("listView", lang)}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter & Sort bar ─────────────────────────────────────────────────── */}
      <div className="bg-muted/20 border rounded-lg p-3 space-y-2">

        {/* Row 1 — text searches */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{t("filters", lang)}</span>
          </div>

          {/* Customer search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("searchCustomer", lang)}
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              className="h-8 text-xs pl-7 w-40"
            />
          </div>

          {/* Delivery # search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("searchDelivery", lang)}
              value={deliverySearch}
              onChange={e => setDeliverySearch(e.target.value)}
              className="h-8 text-xs pl-7 w-32"
            />
          </div>

          {/* Order # search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("searchOrder", lang)}
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              className="h-8 text-xs pl-7 w-28"
            />
          </div>

          {/* Driver filter */}
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder={t("allDrivers", lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allDrivers", lang)}</SelectItem>
              {driverOptions.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder={t("allStatuses", lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses", lang)}</SelectItem>
              {BOARD_COLUMNS.map(col => (
                <SelectItem key={col.status} value={col.status}>{t(col.labelKey, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority (urgency) filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder={t("allUrgency", lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allUrgency", lang)}</SelectItem>
              <SelectItem value="critical">{t("critical", lang)}</SelectItem>
              <SelectItem value="high">{t("high", lang)}</SelectItem>
              <SelectItem value="normal">{t("normal", lang)}</SelectItem>
              <SelectItem value="low">{t("low", lang)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Row 2 — date range, delay, issue, sort, clear */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("date", lang)}</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs w-36"
              title="Scheduled date from"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-8 text-xs w-36"
              title="Scheduled date to"
            />
          </div>

          {/* Delay filter */}
          <Select value={delayFilter} onValueChange={setDelayFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder={t("allStatuses", lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses", lang)}</SelectItem>
              <SelectItem value="delayed">{t("delayedOnly", lang)}</SelectItem>
              <SelectItem value="not_delayed">{t("notDelayed", lang)}</SelectItem>
            </SelectContent>
          </Select>

          {/* Issue filter */}
          <Select value={issueFilter} onValueChange={setIssueFilter}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder={t("allStatuses", lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses", lang)}</SelectItem>
              <SelectItem value="issue">{t("issueReportedOnly", lang)}</SelectItem>
              <SelectItem value="no_issue">{t("noIssue", lang)}</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue placeholder={t("sortBy", lang)} />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTION_KEYS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear filters — shown whenever any filter is active or sort is non-default */}
          {(hasFilters || sortBy !== DEFAULT_SORT) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 shrink-0"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5" />
              {t("clearFilters", lang)}
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm py-8 text-center">{t("loading", lang)}</div>
      )}

      {/* ── Board view ───────────────────────────────────────────────────────── */}
      {!isLoading && view === "board" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map(col => (
            <div
              key={col.status}
              className={cn("shrink-0 w-64 rounded-lg border-2 p-3 space-y-2", col.color)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t(col.labelKey, lang)}
                </span>
                <span className="text-xs bg-white rounded-full px-2 py-0.5 font-semibold shadow-sm">
                  {grouped[col.status]?.length ?? 0}
                </span>
              </div>

              {(grouped[col.status] ?? []).map((d: any) => (
                <DeliveryCard key={d.id} delivery={d} deleteSlot={renderDelete(d)} />
              ))}

              {(grouped[col.status] ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 italic">
                  {hasFilters ? t("noMatchesInColumn", lang) : t("noDeliveriesInColumn", lang)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────────────────── */}
      {!isLoading && view === "list" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <SortableHeader col="delivery_asc" descVal="delivery_desc" sortBy={sortBy} setSortBy={setSortBy}>{t("deliveryNum", lang)}</SortableHeader>
                  <SortableHeader col="order_asc" descVal="order_desc" sortBy={sortBy} setSortBy={setSortBy}>{t("orderNumCol", lang)}</SortableHeader>
                  <SortableHeader col="customer_asc" descVal="customer_desc" sortBy={sortBy} setSortBy={setSortBy}>{t("customer", lang)}</SortableHeader>
                  <SortableHeader col="date_asc" descVal="date_desc" sortBy={sortBy} setSortBy={setSortBy}>{t("date", lang)}</SortableHeader>
                  <SortableHeader col="driver_asc" descVal="driver_desc" sortBy={sortBy} setSortBy={setSortBy}>{t("driverHeader", lang)}</SortableHeader>
                  <SortableHeader col="priority_high" descVal="priority_low" sortBy={sortBy} setSortBy={setSortBy}>{t("urgency", lang)}</SortableHeader>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{t("deviationHeader", lang)}</th>
                  <SortableHeader col="status" descVal="status" sortBy={sortBy} setSortBy={setSortBy}>{t("status", lang)}</SortableHeader>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">{t("actionsHeader", lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      {hasFilters ? t("noDeliveriesMatchFilters", lang) : t("noDeliveriesYet", lang)}
                    </td>
                  </tr>
                )}
                {sorted.map((d: any) => {
                  const overdue = isOverdue(d);
                  return (
                    <tr
                      key={d.id}
                      className={`hover:bg-muted/20 transition-colors ${overdue ? "bg-red-50/50" : ""}`}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                        {d.deliveryNumber ?? `#${d.id}`}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {d.orderNumber ?? "—"}
                      </td>
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
                            : <span className="text-muted-foreground">{t("statusUnassigned", lang)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <UrgencyBadge urgency={d.urgency} />
                      </td>
                      <td className="px-4 py-3">
                        {d.deviationType ? (
                          <div className="flex items-center gap-1 text-orange-700">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span className="text-xs capitalize">
                              {d.deviationType.replace(/_/g, " ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {renderDelete(d)}
                      </td>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function OverdueBadge() {
  const { lang } = useLang();
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white px-1.5 py-0.5 rounded">
      {t("overdue", lang)}
    </span>
  );
}

function DeliveryCard({ delivery: d, deleteSlot }: { delivery: any; deleteSlot?: ReactNode }) {
  const { lang } = useLang();
  const overdue = isOverdue(d);
  return (
    <div className={`bg-white rounded-md shadow-sm border p-3 space-y-2 ${overdue ? "border-red-400 border-2" : ""}`}>
      {/* Top row: priority badge + customer name + urgency + delete */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-start gap-1.5 min-w-0">
          <PriorityBadge priority={d.customerPriority} />
          <span className="text-sm font-medium leading-tight line-clamp-2">{d.customerName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <UrgencyBadge urgency={d.urgency} />
          {deleteSlot}
        </div>
      </div>

      {/* Driver */}
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Truck className="h-3 w-3" />
        {d.driverName ?? t("noDriver", lang)}
      </div>

      {/* Delivery # + Order # */}
      <div className="text-xs text-muted-foreground font-mono flex gap-2">
        {d.deliveryNumber && <span>{d.deliveryNumber}</span>}
        {d.orderNumber    && <span className="text-muted-foreground/70">{d.orderNumber}</span>}
      </div>

      {/* Date + overdue badge */}
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span>{formatDate(d.scheduledDate)}</span>
        {overdue && <OverdueBadge />}
      </div>

      {/* Deviation / issue note */}
      {d.deviationType && (
        <div className="flex items-start gap-1 text-orange-700 text-xs">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <div>
            <span className="truncate capitalize">{d.deviationType.replace(/_/g, " ")}</span>
            {d.deviationNote && (
              <p className="text-orange-600/80 mt-0.5 line-clamp-2">{d.deviationNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Assign driver control (unassigned only) */}
      {d.status === "unassigned" && <AssignDriverControl deliveryId={d.id} />}
    </div>
  );
}

// ── Sortable column header ─────────────────────────────────────────────────────
function SortableHeader({
  col, descVal, sortBy, setSortBy, children
}: {
  col: string;
  descVal: string;
  sortBy: string;
  setSortBy: (v: string) => void;
  children: React.ReactNode;
}) {
  const isAsc = sortBy === col;
  const isDesc = sortBy === descVal && descVal !== col;
  const isActive = isAsc || isDesc;
  function toggle() {
    if (!isActive) { setSortBy(col); return; }
    // if same column: toggle asc/desc (unless col === descVal i.e. single-value like "status")
    if (col === descVal) return;
    setSortBy(isAsc ? descVal : col);
  }
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={toggle}
    >
      <span className="flex items-center gap-1">
        {children}
        {!isActive && <ArrowUpDown className="h-3 w-3 opacity-40" />}
        {isAsc  && <ArrowUp   className="h-3 w-3 text-primary" />}
        {isDesc && <ArrowDown className="h-3 w-3 text-primary" />}
      </span>
    </th>
  );
}

function AssignDriverControl({ deliveryId, compact }: { deliveryId: number; compact?: boolean }) {
  const { toast } = useToast();
  const { lang } = useLang();
  const { data: users } = useListUsers();
  const drivers = (users ?? []).filter((u: any) => u.role === "driver" && u.active);
  const update = useUpdateDelivery({
    mutation: {
      onSuccess: () => toast({ title: t("driverAssigned", lang) }),
      onError: () => toast({ title: t("failedToAssignDriver", lang), variant: "destructive" }),
    },
  });

  return (
    <div className={compact ? "" : "pt-1 border-t"}>
      <Select
        disabled={update.isPending}
        onValueChange={(value) => update.mutate({ id: deliveryId, data: { driverId: Number(value) } })}
      >
        <SelectTrigger
          className={compact ? "h-8 text-xs" : "h-7 text-xs"}
          data-testid={`select-assign-driver-${deliveryId}`}
        >
          <div className="flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            <SelectValue placeholder={t("assignDriver", lang)} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {drivers.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("noActiveDrivers", lang)}</div>
          )}
          {drivers.map((u: any) => (
            <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
