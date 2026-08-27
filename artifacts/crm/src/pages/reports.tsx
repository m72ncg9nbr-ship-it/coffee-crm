import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetReportsSales,
  useGetReportsProfitability,
  useGetReportsCollection,
} from "@workspace/api-client-react";

type ReportFiltersParams = {
  dateFrom?: string;
  dateTo?: string;
  channel?: string;
};

type SalesByDimensionItem = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  units: number;
};

type ProfitabilityItem = {
  key: string;
  label: string;
  grossRevenue: number;
  discountAmount: number;
  netRevenue: number;
  productCost?: number | null;
  grossProfit?: number | null;
  valorCost: number;
  collectionAdjustedProfit?: number | null;
};

type CollectionOrderItem = {
  orderId: number;
  orderNumber?: string | null;
  customerName: string;
  channel: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  paymentStatus: string;
  paidAt?: string | null;
  totalAmount: number;
  collectedAmount?: number | null;
  delayDays: number;
};
import { useLang } from "@/lib/lang-context";
import { t, type Lang } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, MapPin, TestTube, Globe, Coffee, Sparkles, BarChart2, Users, Clock, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// ── colour palette ─────────────────────────────────────────────────────────────
const COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#f59e0b", "#6366f1"];

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return formatCurrency(n);
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}
function KpiCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon?: React.FC<any> }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && <Icon className="h-5 w-5 text-muted-foreground opacity-50" />}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBarChart({ data, xKey, yKey, color = "#f97316" }: {
  data: any[];
  xKey: string;
  yKey: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => fmt(v)} />
        <Bar dataKey={yKey} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MultiColorBar({ data, xKey, yKey }: { data: any[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => fmt(v)} />
        <Bar dataKey={yKey} radius={[3, 3, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── date filter bar ────────────────────────────────────────────────────────────
function DateFilterBar({ filters, onChange, lang }: {
  filters: ReportFiltersParams;
  onChange: (f: ReportFiltersParams) => void;
  lang: Lang;
}) {
  return (
    <div className="flex gap-4 items-end">
      <div>
        <Label className="text-xs">{t("from", lang)}</Label>
        <Input
          type="date"
          className="h-8 text-sm w-36"
          value={filters.dateFrom ?? ""}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value || undefined })}
        />
      </div>
      <div>
        <Label className="text-xs">{t("to", lang)}</Label>
        <Input
          type="date"
          className="h-8 text-sm w-36"
          value={filters.dateTo ?? ""}
          onChange={e => onChange({ ...filters, dateTo: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

// ── Payment status badge ───────────────────────────────────────────────────────
function PayBadge({ status, lang }: { status: string; lang: Lang }) {
  const map: Record<string, string> = {
    paid:    "bg-green-100 text-green-800 border-green-200",
    unpaid:  "bg-yellow-100 text-yellow-800 border-yellow-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
  };
  const labelMap: Record<string, Parameters<typeof t>[0]> = {
    paid: "paid", unpaid: "unpaid", overdue: "overdue",
  };
  const labelKey = labelMap[status];
  return (
    <Badge variant="outline" className={`text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {labelKey ? t(labelKey, lang) : status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ── Dimension table (Sales / Regional) ────────────────────────────────────────
function DimensionTable({ rows, title, lang }: { rows: SalesByDimensionItem[]; title: string; lang: Lang }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground italic">{t("noData", lang)}</p>;
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left pb-1 pr-3">{title}</th>
              <th className="text-right pb-1 pr-3">{t("revenue", lang)}</th>
              <th className="text-right pb-1 pr-3">{t("orders", lang)}</th>
              <th className="text-right pb-1">{t("units", lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-muted/40 last:border-0">
                <td className="py-1 pr-3 font-medium max-w-[160px] truncate">{r.label}</td>
                <td className="py-1 pr-3 text-right">{fmt(r.revenue)}</td>
                <td className="py-1 pr-3 text-right">{r.orders}</td>
                <td className="py-1 text-right">{r.units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Profitability row ─────────────────────────────────────────────────────────
function ProfitRow({ row }: { row: ProfitabilityItem }) {
  const margin = row.netRevenue > 0 && row.grossProfit != null
    ? (row.grossProfit / row.netRevenue) * 100
    : null;
  return (
    <tr className="border-b border-muted/40 last:border-0 text-xs">
      <td className="py-1.5 pr-3 font-medium max-w-[160px] truncate">{row.label}</td>
      <td className="py-1.5 pr-3 text-right">{fmt(row.netRevenue)}</td>
      <td className="py-1.5 pr-3 text-right">{fmt(row.productCost)}</td>
      <td className="py-1.5 pr-3 text-right">{fmt(row.grossProfit)}</td>
      <td className="py-1.5 pr-3 text-right">{margin != null ? fmtPct(margin) : "—"}</td>
      <td className="py-1.5 pr-3 text-right text-orange-700">{fmt(row.valorCost)}</td>
      <td className="py-1.5 text-right font-semibold">{fmt(row.collectionAdjustedProfit)}</td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type ReportChannel = "all" | "coffee" | "cosmetics";

const CHANNEL_TAB_VALUES: { value: ReportChannel; labelKey: Parameters<typeof t>[0]; icon: React.ReactNode }[] = [
  { value: "all",       labelKey: "allChannels", icon: <Globe className="h-3.5 w-3.5" /> },
  { value: "coffee",    labelKey: "coffee",      icon: <Coffee className="h-3.5 w-3.5" /> },
  { value: "cosmetics", labelKey: "cosmetics",   icon: <Sparkles className="h-3.5 w-3.5" /> },
];

export default function ReportsPage() {
  const { lang } = useLang();
  const [reportChannel, setReportChannel] = useState<ReportChannel>("all");
  const [filters, setFilters] = useState<ReportFiltersParams>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [growthYear, setGrowthYear] = useState<string>(String(new Date().getFullYear()));

  const activeFilters: ReportFiltersParams = {
    ...filters,
    channel: reportChannel === "all" ? undefined : reportChannel,
  };

  function handleChannelChange(ch: ReportChannel) {
    setReportChannel(ch);
  }

  const channelQs = reportChannel !== "all" ? `&channel=${reportChannel}` : "";

  const { data: sales, isLoading: salesLoading, isError: salesError } = useGetReportsSales(activeFilters);
  const { data: profit, isLoading: profitLoading, isError: profitError } = useGetReportsProfitability(activeFilters);
  const { data: coll, isLoading: collLoading, isError: collError } = useGetReportsCollection(activeFilters);
  const { data: samples, isLoading: samplesLoading, isError: samplesError } = useQuery<any>({
    queryKey: ["reports-samples", activeFilters],
    queryFn: () => {
      const q = new URLSearchParams();
      if (activeFilters.dateFrom) q.set("dateFrom", activeFilters.dateFrom);
      if (activeFilters.dateTo) q.set("dateTo", activeFilters.dateTo);
      if (activeFilters.channel) q.set("channel", activeFilters.channel);
      const qs = q.toString();
      return fetch(`/api/reports/samples${qs ? `?${qs}` : ""}`, { credentials: "include" }).then(r => r.json());
    },
  });
  const { data: regional, isLoading: regionalLoading, isError: regionalError } = useQuery<any>({
    queryKey: ["reports-regional", activeFilters],
    queryFn: () => {
      const q = new URLSearchParams();
      if (activeFilters.dateFrom) q.set("dateFrom", activeFilters.dateFrom);
      if (activeFilters.dateTo) q.set("dateTo", activeFilters.dateTo);
      if (activeFilters.channel) q.set("channel", activeFilters.channel);
      const qs = q.toString();
      return fetch(`/api/reports/regional${qs ? `?${qs}` : ""}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const { data: growthData, isLoading: growthLoading } = useQuery<any>({
    queryKey: ["reports-growth", reportChannel, growthYear],
    queryFn: () => fetch(`/api/reports/growth?year=${growthYear}${channelQs}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: allCustomers = [] } = useQuery<any[]>({
    queryKey: ["customers-for-trend"],
    queryFn: () => fetch("/api/customers", { credentials: "include" }).then(r => r.json()),
    staleTime: 120_000,
  });

  const { data: customerTrend, isLoading: ctLoading } = useQuery<any>({
    queryKey: ["reports-customer-trend", selectedCustomerId, reportChannel],
    queryFn: () =>
      fetch(`/api/reports/customer-trend?customerId=${selectedCustomerId}${channelQs}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCustomerId,
  });

  const { data: productPerf, isLoading: ppLoading } = useQuery<any>({
    queryKey: ["reports-product-performance", reportChannel],
    queryFn: () =>
      fetch(`/api/reports/product-performance${reportChannel !== "all" ? `?channel=${reportChannel}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: leadConv, isLoading: lcLoading } = useQuery<any>({
    queryKey: ["reports-leads-conversion", reportChannel],
    queryFn: () =>
      fetch(`/api/reports/leads-conversion${reportChannel !== "all" ? `?channel=${reportChannel}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: aging, isLoading: agingLoading } = useQuery<any>({
    queryKey: ["reports-invoice-aging", reportChannel],
    queryFn: () =>
      fetch(`/api/reports/invoice-aging${reportChannel !== "all" ? `?channel=${reportChannel}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("reportsAnalytics", lang)}</h1>
          <p className="text-muted-foreground text-sm">{t("approvedOrdersOnly", lang)}</p>
        </div>
        <DateFilterBar filters={filters} onChange={setFilters} lang={lang} />
      </div>

      {/* Channel selector */}
      <div className="flex gap-1 border-b pb-0">
        {CHANNEL_TAB_VALUES.map(tab => (
          <button
            key={tab.value}
            onClick={() => handleChannelChange(tab.value)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              reportChannel === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
            )}
          >
            {tab.icon}
            {t(tab.labelKey, lang)}
          </button>
        ))}
      </div>

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />{t("sales", lang)}
          </TabsTrigger>
          <TabsTrigger value="profitability" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />{t("profitability", lang)}
          </TabsTrigger>
          <TabsTrigger value="collection" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />{t("collection", lang)}
          </TabsTrigger>
          <TabsTrigger value="samples" className="gap-1.5">
            <TestTube className="h-3.5 w-3.5" />{t("samples", lang)}
          </TabsTrigger>
          <TabsTrigger value="regional" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />{t("regional", lang)}
          </TabsTrigger>
          <TabsTrigger value="growth" className="gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />{t("growth", lang)}
          </TabsTrigger>
          <TabsTrigger value="customer-trend" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />{t("customerTrend", lang)}
          </TabsTrigger>
          <TabsTrigger value="product-performance" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />{t("productPerformance", lang)}
          </TabsTrigger>
          <TabsTrigger value="lead-conversion" className="gap-1.5">
            <Target className="h-3.5 w-3.5" />{t("leadsConversion", lang)}
          </TabsTrigger>
          <TabsTrigger value="invoice-aging" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />{t("invoiceAging", lang)}
          </TabsTrigger>
        </TabsList>

        {/* ── Sales ─────────────────────────────────────────────────────── */}
        <TabsContent value="sales" className="space-y-5">
          {salesLoading && <div className="text-sm text-muted-foreground py-4">{t("loading", lang)}</div>}
          {salesError && <div className="text-sm text-red-600 py-4">{t("loadError", lang)}</div>}
          {sales && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("totalRevenue", lang)} value={fmt(sales.totalRevenue)} icon={DollarSign} />
                <KpiCard label={t("totalOrders", lang)} value={String(sales.totalOrders)} icon={ShoppingCart} />
                <KpiCard label={t("unitsSold", lang)} value={String(sales.totalUnits)} icon={Package} />
                <KpiCard label={t("avgOrderValue", lang)} value={fmt(sales.avgOrderValue)} icon={TrendingUp} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("revenueByMonth", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MiniBarChart data={sales.byMonth} xKey="label" yKey="revenue" color="#f97316" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("revenueByChannel", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={sales.byChannel} xKey="label" yKey="revenue" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("topProductsByRevenue", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={sales.byProduct.slice(0, 10)} xKey="label" yKey="revenue" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("revenueBySource", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={sales.byOrderSource} xKey="label" yKey="revenue" />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DimensionTable rows={sales.byChannel} title={t("byChannel", lang)} lang={lang} />
                <DimensionTable rows={sales.bySalesperson.slice(0, 10)} title={t("bySalesperson", lang)} lang={lang} />
                <DimensionTable rows={sales.byProduct.slice(0, 10)} title={t("byProduct", lang)} lang={lang} />
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Profitability ──────────────────────────────────────────────── */}
        <TabsContent value="profitability" className="space-y-5">
          {profitLoading && <div className="text-sm text-muted-foreground py-4">{t("loading", lang)}</div>}
          {profitError && <div className="text-sm text-red-600 py-4">{t("loadError", lang)}</div>}
          {profit && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("netRevenue", lang)} value={fmt(profit.totals.netRevenue)} />
                <KpiCard label={t("grossProfit", lang)} value={fmt(profit.totals.grossProfit)} />
                <KpiCard
                  label={t("grossMargin", lang)}
                  value={
                    profit.totals.netRevenue > 0 && profit.totals.grossProfit != null
                      ? fmtPct((profit.totals.grossProfit / profit.totals.netRevenue) * 100)
                      : "—"
                  }
                />
                <KpiCard label={t("valorCost", lang)} value={fmt(profit.totals.valorCost)} sub={t("collectionDelayImpact", lang)} />
              </div>

              <div className="space-y-5">
                {([
                  { labelKey: "byProduct" as const, rows: profit.byProduct },
                  { labelKey: "byCustomer" as const, rows: profit.byCustomer },
                  { labelKey: "byChannel" as const, rows: profit.byChannel },
                ] as const).map(({ labelKey, rows }) => (
                  <Card key={labelKey}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{t(labelKey, lang)}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left pb-1 pr-3">{t(labelKey, lang)}</th>
                              <th className="text-right pb-1 pr-3">{t("netRevenue", lang)}</th>
                              <th className="text-right pb-1 pr-3">{t("cost", lang)}</th>
                              <th className="text-right pb-1 pr-3">{t("grossProfit", lang)}</th>
                              <th className="text-right pb-1 pr-3">{t("margin", lang)}</th>
                              <th className="text-right pb-1 pr-3">{t("valorCost", lang)}</th>
                              <th className="text-right pb-1">{t("adjProfit", lang)}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r: ProfitabilityItem, i: number) => <ProfitRow key={i} row={r} />)}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Collection ────────────────────────────────────────────────── */}
        <TabsContent value="collection" className="space-y-5">
          {collLoading && <div className="text-sm text-muted-foreground py-4">{t("loading", lang)}</div>}
          {collError && <div className="text-sm text-red-600 py-4">{t("loadError", lang)}</div>}
          {coll && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("totalInvoiced", lang)} value={fmt(coll.totalInvoiced)} />
                <KpiCard label={t("collected", lang)} value={fmt(coll.totalCollected)} />
                <KpiCard label={t("outstanding", lang)} value={fmt(coll.totalOutstanding)} />
                <KpiCard
                  label={t("overdue", lang)}
                  value={fmt(coll.totalOverdue)}
                  sub={`${coll.overdueCount} ${t("orders", lang).toLowerCase()}`}
                />
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {t("orders", lang)} — {coll.orders.length} {t("records", lang)} ({coll.unpaidCount} {t("unpaid", lang).toLowerCase()}, {coll.overdueCount} {t("overdue", lang).toLowerCase()})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">{t("order", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("customer", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("channel", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("amount", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("invoice", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("dueDateLabel", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("delayDays", lang)}</th>
                          <th className="text-left pb-1">{t("status", lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coll.orders.map((o: CollectionOrderItem) => (
                          <tr key={o.orderId} className="border-b border-muted/40 last:border-0">
                            <td className="py-1.5 pr-3 font-mono">{o.orderNumber ?? `#${o.orderId}`}</td>
                            <td className="py-1.5 pr-3 max-w-[140px] truncate">{o.customerName}</td>
                            <td className="py-1.5 pr-3 capitalize">{o.channel}</td>
                            <td className="py-1.5 pr-3 text-right font-medium">{fmt(o.totalAmount)}</td>
                            <td className="py-1.5 pr-3">{o.invoiceDate ?? "—"}</td>
                            <td className="py-1.5 pr-3">
                              <span className={o.paymentStatus !== "paid" && o.dueDate && o.dueDate < new Date().toISOString().split("T")[0] ? "text-red-600 font-medium" : ""}>
                                {o.dueDate ?? "—"}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-right">
                              {o.delayDays > 0
                                ? <span className="text-orange-700 font-semibold">{o.delayDays}d</span>
                                : o.delayDays < 0
                                ? <span className="text-green-700">{Math.abs(o.delayDays)}d {t("early", lang)}</span>
                                : "—"}
                            </td>
                            <td className="py-1.5"><PayBadge status={o.paymentStatus} lang={lang} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Samples ───────────────────────────────────────────────────── */}
        <TabsContent value="samples" className="space-y-5">
          {samplesLoading && <div className="text-sm text-muted-foreground py-4">{t("loading", lang)}</div>}
          {samplesError && <div className="text-sm text-red-600 py-4">{t("loadError", lang)}</div>}
          {samples && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiCard label={t("sampleOrders", lang)} value={String(samples.totalSampleOrders)} />
                <KpiCard label={t("totalUnits", lang)} value={String(samples.totalSampleUnits)} />
                <KpiCard label={t("uniqueCustomers", lang)} value={String(samples.uniqueCustomers)} />
              </div>

              {samples.byProduct.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("topSampledProducts", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={samples.byProduct.slice(0, 10)} xKey="label" yKey="units" />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("sampleOrders", lang)}</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">{t("date", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("order", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("customer", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("source", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("city", lang)}</th>
                          <th className="text-left pb-1 pr-3">{t("reason", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("units", lang)}</th>
                          <th className="text-left pb-1">{t("products", lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {samples.orders.map((o: any) => (
                          <tr key={o.orderId} className="border-b border-muted/40 last:border-0">
                            <td className="py-1.5 pr-3">{formatDate(o.createdAt)}</td>
                            <td className="py-1.5 pr-3 font-mono">{o.orderNumber ?? `#${o.orderId}`}</td>
                            <td className="py-1.5 pr-3 max-w-[120px] truncate">{o.customerName}</td>
                            <td className="py-1.5 pr-3 capitalize">{o.orderSource?.replace("_", " ")}</td>
                            <td className="py-1.5 pr-3">{o.city ?? "—"}</td>
                            <td className="py-1.5 pr-3 max-w-[120px] truncate">{o.sampleReason ?? "—"}</td>
                            <td className="py-1.5 pr-3 text-right">{o.totalUnits}</td>
                            <td className="py-1.5 max-w-[160px] truncate">
                              {(o.products ?? []).map((p: any) => `${p.productName} ×${p.quantity}`).join(", ")}
                            </td>
                          </tr>
                        ))}
                        {samples.orders.length === 0 && (
                          <tr><td colSpan={8} className="py-6 text-center text-muted-foreground italic">{t("noSampleOrders", lang)}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Regional ──────────────────────────────────────────────────── */}
        <TabsContent value="regional" className="space-y-5">
          {regionalLoading && <div className="text-sm text-muted-foreground py-4">{t("loading", lang)}</div>}
          {regionalError && <div className="text-sm text-red-600 py-4">{t("loadError", lang)}</div>}
          {regional && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("revenueByRegion", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={regional.byRegion} xKey="region" yKey="revenue" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("topCitiesByRevenue", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={regional.byCity.slice(0, 10)} xKey="city" yKey="revenue" />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("byRegion", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">{t("region", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("revenue", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("orders", lang)}</th>
                            <th className="text-right pb-1">{t("units", lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regional.byRegion.map((r: any, i: number) => (
                            <tr key={i} className="border-b border-muted/40 last:border-0">
                              <td className="py-1.5 pr-3 font-medium">{r.region}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.revenue)}</td>
                              <td className="py-1.5 pr-3 text-right">{r.orders}</td>
                              <td className="py-1.5 text-right">{r.units}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("byCity", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">{t("city", lang)}</th>
                            <th className="text-left pb-1 pr-3">{t("region", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("revenue", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("orders", lang)}</th>
                            <th className="text-right pb-1">{t("units", lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regional.byCity.slice(0, 20).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-muted/40 last:border-0">
                              <td className="py-1.5 pr-3 font-medium">{r.city}</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{r.region ?? "—"}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.revenue)}</td>
                              <td className="py-1.5 pr-3 text-right">{r.orders}</td>
                              <td className="py-1.5 text-right">{r.units}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
        {/* ── Growth ────────────────────────────────────────────────── */}
        <TabsContent value="growth" className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs">{t("yearLabel", lang)}</Label>
            <Select value={growthYear} onValueChange={setGrowthYear}>
              <SelectTrigger className="w-28 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3].map(offset => {
                  const y = String(new Date().getFullYear() - offset);
                  return <SelectItem key={y} value={y}>{y}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          {growthLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {growthData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label={t("sixMonthGrowth", lang)}
                  value={growthData.sixMonth.revenueGrowth != null ? `${growthData.sixMonth.revenueGrowth > 0 ? "+" : ""}${growthData.sixMonth.revenueGrowth}%` : "—"}
                  sub={`${t("currentPeriod", lang)}: ${fmt(growthData.sixMonth.current.revenue)}`}
                  icon={growthData.sixMonth.revenueGrowth >= 0 ? TrendingUp : TrendingDown}
                />
                <KpiCard
                  label={t("twelveMonthGrowth", lang)}
                  value={growthData.twelveMonth.revenueGrowth != null ? `${growthData.twelveMonth.revenueGrowth > 0 ? "+" : ""}${growthData.twelveMonth.revenueGrowth}%` : "—"}
                  sub={`${t("currentPeriod", lang)}: ${fmt(growthData.twelveMonth.current.revenue)}`}
                  icon={growthData.twelveMonth.revenueGrowth >= 0 ? TrendingUp : TrendingDown}
                />
                <KpiCard
                  label={`${t("ytdGrowth", lang)} ${growthData.ytd.year}`}
                  value={growthData.ytd.revenueGrowth != null ? `${growthData.ytd.revenueGrowth > 0 ? "+" : ""}${growthData.ytd.revenueGrowth}%` : "—"}
                  sub={`${t("currentPeriod", lang)}: ${fmt(growthData.ytd.current.revenue)}`}
                  icon={TrendingUp}
                />
                <KpiCard
                  label={`${t("calendarYear", lang)} ${growthData.calendarYear.year}`}
                  value={growthData.calendarYear.revenueGrowth != null ? `${growthData.calendarYear.revenueGrowth > 0 ? "+" : ""}${growthData.calendarYear.revenueGrowth}%` : "—"}
                  sub={`${t("currentPeriod", lang)}: ${fmt(growthData.calendarYear.current.revenue)}`}
                  icon={TrendingUp}
                />
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("revenueGrowth", lang)} — {t("byMonth", lang)}</CardTitle></CardHeader>
                <CardContent>
                  <MiniBarChart data={growthData.byMonth} xKey="month" yKey="revenue" color="#10b981" />
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {[
                  { label: t("sixMonthGrowth", lang), d: growthData.sixMonth },
                  { label: t("twelveMonthGrowth", lang), d: growthData.twelveMonth },
                  { label: `${t("ytdGrowth", lang)} ${growthData.ytd.year}`, d: growthData.ytd },
                  { label: `${t("calendarYear", lang)} ${growthData.calendarYear.year}`, d: growthData.calendarYear },
                ].map(({ label, d }) => (
                  <Card key={label}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
                    <CardContent>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3"></th>
                            <th className="text-right pb-1 pr-3">{t("revenue", lang)}</th>
                            <th className="text-right pb-1">{t("orders", lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-muted/40">
                            <td className="py-1 pr-3 font-medium">{t("currentPeriod", lang)}</td>
                            <td className="py-1 pr-3 text-right">{fmt(d.current.revenue)}</td>
                            <td className="py-1 text-right">{d.current.orders}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-3 text-muted-foreground">{t("previousPeriod", lang)}</td>
                            <td className="py-1 pr-3 text-right text-muted-foreground">{fmt(d.previous.revenue)}</td>
                            <td className="py-1 text-right text-muted-foreground">{d.previous.orders}</td>
                          </tr>
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Customer Trend ────────────────────────────────────────── */}
        <TabsContent value="customer-trend" className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs">{t("customer", lang)}</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-72 h-8 text-sm">
                <SelectValue placeholder={t("selectCustomer", lang)} />
              </SelectTrigger>
              <SelectContent>
                {allCustomers.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!selectedCustomerId && (
            <p className="text-sm text-muted-foreground italic py-4">{t("selectCustomer", lang)}</p>
          )}
          {ctLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {customerTrend && !customerTrend.error && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("totalOrders", lang)} value={String(customerTrend.totalOrders)} icon={ShoppingCart} />
                <KpiCard label={t("totalRevenue", lang)} value={fmt(customerTrend.totalRevenue)} icon={DollarSign} />
                <KpiCard
                  label={`YTD ${customerTrend.ytd?.year ?? ""}`}
                  value={fmt(customerTrend.ytd?.current?.revenue)}
                  sub={`${t("vs", lang)} ${fmt(customerTrend.ytd?.previous?.revenue)}`}
                  icon={TrendingUp}
                />
                <KpiCard label={`YTD ${t("orders", lang)}`} value={String(customerTrend.ytd?.current?.orders ?? 0)} sub={`${t("vs", lang)} ${customerTrend.ytd?.previous?.orders ?? 0}`} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("topProducts", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">{t("product", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("revenue", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("quantity", lang)}</th>
                            <th className="text-right pb-1">{t("orders", lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customerTrend.topProducts ?? []).map((p: any, i: number) => (
                            <tr key={i} className="border-b border-muted/40 last:border-0">
                              <td className="py-1.5 pr-3 font-medium max-w-[160px] truncate">{p.productName}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(p.revenue)}</td>
                              <td className="py-1.5 pr-3 text-right">{p.units}</td>
                              <td className="py-1.5 text-right">{p.orders}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("revenueGrowth", lang)} — {t("byMonth", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <MiniBarChart data={customerTrend.byMonth ?? []} xKey="month" yKey="revenue" color="#3b82f6" />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Product Performance ───────────────────────────────────── */}
        <TabsContent value="product-performance" className="space-y-5">
          {ppLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {productPerf && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("rising", lang)} value={String(productPerf.rising?.length ?? 0)} icon={TrendingUp} />
                <KpiCard label={t("stable", lang)} value={String((productPerf.products?.length ?? 0) - (productPerf.rising?.length ?? 0) - (productPerf.declining?.length ?? 0) - (productPerf.watchlist?.length ?? 0))} />
                <KpiCard label={t("declining", lang)} value={String(productPerf.declining?.length ?? 0)} icon={TrendingDown} />
                <KpiCard label={t("watchlist", lang)} value={String(productPerf.watchlist?.length ?? 0)} icon={Package} />
              </div>
              {(productPerf.watchlist?.length ?? 0) > 0 && (
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-700">{t("watchlist", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {productPerf.watchlist.map((p: any) => (
                        <Badge key={p.productId} variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{p.productName}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("productPerformance", lang)}</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">{t("product", lang)}</th>
                          <th className="text-left pb-1 pr-3">SKU</th>
                          <th className="text-right pb-1 pr-3">12m Rev</th>
                          <th className="text-right pb-1 pr-3">{t("growth6m", lang)}</th>
                          <th className="text-right pb-1 pr-3">Margin</th>
                          <th className="text-left pb-1">{t("status", lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(productPerf.products ?? []).map((p: any, i: number) => {
                          const statusStyle: Record<string, string> = {
                            rising:    "bg-green-100 text-green-800 border-green-200",
                            stable:    "bg-blue-100 text-blue-800 border-blue-200",
                            declining: "bg-orange-100 text-orange-800 border-orange-200",
                            watchlist: "bg-amber-100 text-amber-800 border-amber-200",
                          };
                          return (
                            <tr key={i} className="border-b border-muted/40 last:border-0">
                              <td className="py-1.5 pr-3 font-medium max-w-[160px] truncate">{p.productName}</td>
                              <td className="py-1.5 pr-3 font-mono text-muted-foreground">{p.sku}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(p.revenue12m)}</td>
                              <td className={cn("py-1.5 pr-3 text-right font-semibold", p.growth6m > 0 ? "text-green-700" : p.growth6m < 0 ? "text-red-700" : "")}>
                                {p.growth6m != null ? `${p.growth6m > 0 ? "+" : ""}${p.growth6m}%` : "—"}
                              </td>
                              <td className="py-1.5 pr-3 text-right">{p.margin != null ? `${p.margin}%` : "—"}</td>
                              <td className="py-1.5">
                                <Badge variant="outline" className={`text-[11px] ${statusStyle[p.status] ?? ""}`}>{p.status}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Lead Conversion ───────────────────────────────────────── */}
        <TabsContent value="lead-conversion" className="space-y-5">
          {lcLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {leadConv && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("total", lang)} value={String(leadConv.total)} icon={Users} />
                <KpiCard label={t("converted", lang)} value={String(leadConv.converted)} icon={Target} />
                <KpiCard label={t("conversionRate", lang)} value={fmtPct(leadConv.conversionRate)} icon={TrendingUp} />
                <KpiCard
                  label={t("avgConversionDays", lang)}
                  value={leadConv.avgConversionDays != null ? `${leadConv.avgConversionDays}d` : "—"}
                  icon={Clock}
                />
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("byMonth", lang)}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={leadConv.byMonth ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Total" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="converted" name="Converted" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("byChannel", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">{t("channel", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("total", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("converted", lang)}</th>
                          <th className="text-right pb-1">{t("conversionRate", lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(leadConv.byChannel ?? []).map((r: any, i: number) => (
                          <tr key={i} className="border-b border-muted/40 last:border-0">
                            <td className="py-1.5 pr-3 font-medium capitalize">{r.channel}</td>
                            <td className="py-1.5 pr-3 text-right">{r.total}</td>
                            <td className="py-1.5 pr-3 text-right">{r.converted}</td>
                            <td className="py-1.5 text-right">{fmtPct(r.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("byCreator", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">{t("user", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("total", lang)}</th>
                          <th className="text-right pb-1 pr-3">{t("converted", lang)}</th>
                          <th className="text-right pb-1">{t("conversionRate", lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(leadConv.byCreator ?? []).map((r: any, i: number) => (
                          <tr key={i} className="border-b border-muted/40 last:border-0">
                            <td className="py-1.5 pr-3 font-medium">{r.creatorName}</td>
                            <td className="py-1.5 pr-3 text-right">{r.total}</td>
                            <td className="py-1.5 pr-3 text-right">{r.converted}</td>
                            <td className="py-1.5 text-right">{fmtPct(r.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Invoice Aging ─────────────────────────────────────────── */}
        <TabsContent value="invoice-aging" className="space-y-5">
          {agingLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {aging && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard label={t("notDue", lang)} value={fmt(aging.totals.notDue.amount)} sub={`${aging.totals.notDue.count} inv.`} />
                <KpiCard label={t("days1to30", lang)} value={fmt(aging.totals.days1to30.amount)} sub={`${aging.totals.days1to30.count} inv.`} />
                <KpiCard label={t("days31to60", lang)} value={fmt(aging.totals.days31to60.amount)} sub={`${aging.totals.days31to60.count} inv.`} />
                <KpiCard label={t("days61to90", lang)} value={fmt(aging.totals.days61to90.amount)} sub={`${aging.totals.days61to90.count} inv.`} />
                <KpiCard label={t("days90plus", lang)} value={fmt(aging.totals.days90plus.amount)} sub={`${aging.totals.days90plus.count} inv.`} icon={TrendingDown} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("byChannel", lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">{t("channel", lang)}</th>
                            <th className="text-right pb-1 pr-3">{t("notDue", lang)}</th>
                            <th className="text-right pb-1 pr-3">1-30d</th>
                            <th className="text-right pb-1 pr-3">31-60d</th>
                            <th className="text-right pb-1 pr-3">61-90d</th>
                            <th className="text-right pb-1">{t("days90plus", lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(aging.byChannel ?? []).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-muted/40 last:border-0">
                              <td className="py-1.5 pr-3 font-medium capitalize">{r.channel}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.notDue.amount)}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days1to30.amount)}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days31to60.amount)}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days61to90.amount)}</td>
                              <td className="py-1.5 text-right text-red-700 font-medium">{fmt(r.days90plus.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("totalOverdue", lang)} — {t("customer", lang)} (top 30)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">{t("customer", lang)}</th>
                            <th className="text-right pb-1 pr-3">1-30d</th>
                            <th className="text-right pb-1 pr-3">31-60d</th>
                            <th className="text-right pb-1 pr-3">61-90d</th>
                            <th className="text-right pb-1 pr-3">90d+</th>
                            <th className="text-right pb-1">{t("totalOverdue", lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(aging.byCustomer ?? []).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-muted/40 last:border-0">
                              <td className="py-1.5 pr-3 font-medium max-w-[130px] truncate">{r.customerName}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days1to30.amount)}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days31to60.amount)}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days61to90.amount)}</td>
                              <td className="py-1.5 pr-3 text-right">{fmt(r.days90plus.amount)}</td>
                              <td className="py-1.5 text-right font-semibold text-red-700">{fmt(r.totalOverdue.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
