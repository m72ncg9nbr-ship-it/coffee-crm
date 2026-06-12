import { useState } from "react";
import {
  useGetReportsSales,
  useGetReportsProfitability,
  useGetReportsCollection,
  useGetReportsSamples,
  useGetReportsRegional,
} from "@workspace/api-client-react";
import type {
  ReportFiltersParams,
  SalesByDimensionItem,
  ProfitabilityItem,
  CollectionOrderItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { TrendingUp, DollarSign, ShoppingCart, Package, MapPin, TestTube } from "lucide-react";

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
function DateFilterBar({ filters, onChange }: {
  filters: ReportFiltersParams;
  onChange: (f: ReportFiltersParams) => void;
}) {
  return (
    <div className="flex gap-4 items-end">
      <div>
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          className="h-8 text-sm w-36"
          value={filters.dateFrom ?? ""}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value || undefined })}
        />
      </div>
      <div>
        <Label className="text-xs">To</Label>
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
function PayBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:    "bg-green-100 text-green-800 border-green-200",
    unpaid:  "bg-yellow-100 text-yellow-800 border-yellow-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge variant="outline" className={`text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ── Dimension table (Sales / Regional) ────────────────────────────────────────
function DimensionTable({ rows, title }: { rows: SalesByDimensionItem[]; title: string }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground italic">No data</p>;
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left pb-1 pr-3">{title.replace(/^By /, "")}</th>
              <th className="text-right pb-1 pr-3">Revenue</th>
              <th className="text-right pb-1 pr-3">Orders</th>
              <th className="text-right pb-1">Units</th>
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
export default function ReportsPage() {
  const [filters, setFilters] = useState<ReportFiltersParams>({});

  const { data: sales, isLoading: salesLoading, isError: salesError } = useGetReportsSales(filters);
  const { data: profit, isLoading: profitLoading, isError: profitError } = useGetReportsProfitability(filters);
  const { data: coll, isLoading: collLoading, isError: collError } = useGetReportsCollection(filters);
  const { data: samples, isLoading: samplesLoading, isError: samplesError } = useGetReportsSamples(filters);
  const { data: regional, isLoading: regionalLoading, isError: regionalError } = useGetReportsRegional(filters);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm">Approved orders only</p>
        </div>
        <DateFilterBar filters={filters} onChange={setFilters} />
      </div>

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Sales
          </TabsTrigger>
          <TabsTrigger value="profitability" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />Profitability
          </TabsTrigger>
          <TabsTrigger value="collection" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />Collection
          </TabsTrigger>
          <TabsTrigger value="samples" className="gap-1.5">
            <TestTube className="h-3.5 w-3.5" />Samples
          </TabsTrigger>
          <TabsTrigger value="regional" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />Regional
          </TabsTrigger>
        </TabsList>

        {/* ── Sales ─────────────────────────────────────────────────────── */}
        <TabsContent value="sales" className="space-y-5">
          {salesLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {salesError && <div className="text-sm text-red-600 py-4">Failed to load sales data. Please try refreshing.</div>}
          {sales && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total Revenue" value={fmt(sales.totalRevenue)} icon={DollarSign} />
                <KpiCard label="Total Orders" value={String(sales.totalOrders)} icon={ShoppingCart} />
                <KpiCard label="Units Sold" value={String(sales.totalUnits)} icon={Package} />
                <KpiCard label="Avg Order Value" value={fmt(sales.avgOrderValue)} icon={TrendingUp} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Month</CardTitle></CardHeader>
                  <CardContent>
                    <MiniBarChart data={sales.byMonth} xKey="label" yKey="revenue" color="#f97316" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Channel</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={sales.byChannel} xKey="label" yKey="revenue" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Top Products (by Revenue)</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={sales.byProduct.slice(0, 10)} xKey="label" yKey="revenue" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Order Source</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={sales.byOrderSource} xKey="label" yKey="revenue" />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DimensionTable rows={sales.byChannel} title="By Channel" />
                <DimensionTable rows={sales.bySalesperson.slice(0, 10)} title="By Salesperson" />
                <DimensionTable rows={sales.byProduct.slice(0, 10)} title="By Product (top 10)" />
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Profitability ──────────────────────────────────────────────── */}
        <TabsContent value="profitability" className="space-y-5">
          {profitLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {profitError && <div className="text-sm text-red-600 py-4">Failed to load profitability data. Please try refreshing.</div>}
          {profit && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Net Revenue" value={fmt(profit.totals.netRevenue)} />
                <KpiCard label="Gross Profit" value={fmt(profit.totals.grossProfit)} />
                <KpiCard
                  label="Gross Margin"
                  value={
                    profit.totals.netRevenue > 0 && profit.totals.grossProfit != null
                      ? fmtPct((profit.totals.grossProfit / profit.totals.netRevenue) * 100)
                      : "—"
                  }
                />
                <KpiCard label="Valor Cost" value={fmt(profit.totals.valorCost)} sub="Collection delay impact" />
              </div>

              <div className="space-y-5">
                {[
                  { label: "By Product", rows: profit.byProduct },
                  { label: "By Customer", rows: profit.byCustomer },
                  { label: "By Channel", rows: profit.byChannel },
                ].map(({ label, rows }) => (
                  <Card key={label}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left pb-1 pr-3">{label.replace("By ", "")}</th>
                              <th className="text-right pb-1 pr-3">Net Rev.</th>
                              <th className="text-right pb-1 pr-3">Cost</th>
                              <th className="text-right pb-1 pr-3">Gross Profit</th>
                              <th className="text-right pb-1 pr-3">Margin</th>
                              <th className="text-right pb-1 pr-3">Valor Cost</th>
                              <th className="text-right pb-1">Adj. Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => <ProfitRow key={i} row={r} />)}
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
          {collLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {collError && <div className="text-sm text-red-600 py-4">Failed to load collection data. Please try refreshing.</div>}
          {coll && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total Invoiced" value={fmt(coll.totalInvoiced)} />
                <KpiCard label="Collected" value={fmt(coll.totalCollected)} />
                <KpiCard label="Outstanding" value={fmt(coll.totalOutstanding)} />
                <KpiCard
                  label="Overdue"
                  value={fmt(coll.totalOverdue)}
                  sub={`${coll.overdueCount} orders`}
                />
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Orders — {coll.orders.length} records ({coll.unpaidCount} unpaid, {coll.overdueCount} overdue)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">Order</th>
                          <th className="text-left pb-1 pr-3">Customer</th>
                          <th className="text-left pb-1 pr-3">Channel</th>
                          <th className="text-right pb-1 pr-3">Amount</th>
                          <th className="text-left pb-1 pr-3">Invoice</th>
                          <th className="text-left pb-1 pr-3">Due</th>
                          <th className="text-right pb-1 pr-3">Delay (d)</th>
                          <th className="text-left pb-1">Status</th>
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
                                ? <span className="text-green-700">{Math.abs(o.delayDays)}d early</span>
                                : "—"}
                            </td>
                            <td className="py-1.5"><PayBadge status={o.paymentStatus} /></td>
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
          {samplesLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {samplesError && <div className="text-sm text-red-600 py-4">Failed to load samples data. Please try refreshing.</div>}
          {samples && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiCard label="Sample Orders" value={String(samples.totalSampleOrders)} />
                <KpiCard label="Total Units" value={String(samples.totalSampleUnits)} />
                <KpiCard label="Unique Customers" value={String(samples.uniqueCustomers)} />
              </div>

              {samples.byProduct.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Top Sampled Products</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={samples.byProduct.slice(0, 10)} xKey="label" yKey="units" />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Sample Orders</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left pb-1 pr-3">Date</th>
                          <th className="text-left pb-1 pr-3">Order</th>
                          <th className="text-left pb-1 pr-3">Customer</th>
                          <th className="text-left pb-1 pr-3">Source</th>
                          <th className="text-left pb-1 pr-3">City</th>
                          <th className="text-left pb-1 pr-3">Reason</th>
                          <th className="text-right pb-1 pr-3">Units</th>
                          <th className="text-left pb-1">Products</th>
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
                          <tr><td colSpan={8} className="py-6 text-center text-muted-foreground italic">No sample orders</td></tr>
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
          {regionalLoading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
          {regionalError && <div className="text-sm text-red-600 py-4">Failed to load regional data. Please try refreshing.</div>}
          {regional && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Region</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={regional.byRegion} xKey="region" yKey="revenue" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Top Cities by Revenue</CardTitle></CardHeader>
                  <CardContent>
                    <MultiColorBar data={regional.byCity.slice(0, 10)} xKey="city" yKey="revenue" />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">By Region</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">Region</th>
                            <th className="text-right pb-1 pr-3">Revenue</th>
                            <th className="text-right pb-1 pr-3">Orders</th>
                            <th className="text-right pb-1">Units</th>
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
                  <CardHeader className="pb-2"><CardTitle className="text-sm">By City (top 20)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left pb-1 pr-3">City</th>
                            <th className="text-left pb-1 pr-3">Region</th>
                            <th className="text-right pb-1 pr-3">Revenue</th>
                            <th className="text-right pb-1 pr-3">Orders</th>
                            <th className="text-right pb-1">Units</th>
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
      </Tabs>
    </div>
  );
}
