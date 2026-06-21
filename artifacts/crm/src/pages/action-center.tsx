import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/lang-context";
import { useChannel } from "@/lib/channel-context";
import { useAuth } from "@/lib/auth-context";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  CreditCard,
  ClipboardCheck,
  AlertTriangle,
  Package,
  UserPlus,
  Truck,
  ShoppingCart,
  ArrowRight,
  Globe,
  Coffee,
  Sparkles,
} from "lucide-react";

// ── Type metadata ─────────────────────────────────────────────────────────────

type ActionType =
  | "overdue_payment"
  | "pending_approval"
  | "unresolved_issue"
  | "low_stock"
  | "high_potential_follow_up"
  | "delayed_delivery"
  | "stuck_order";

const TYPE_ICON: Record<ActionType, React.ElementType> = {
  overdue_payment:        CreditCard,
  pending_approval:       ClipboardCheck,
  unresolved_issue:       AlertTriangle,
  low_stock:              Package,
  high_potential_follow_up: UserPlus,
  delayed_delivery:       Truck,
  stuck_order:            ShoppingCart,
};

const TYPE_COLORS: Record<ActionType, { bg: string; icon: string; badge: string }> = {
  overdue_payment:          { bg: "bg-red-50",    icon: "text-red-500",    badge: "bg-red-100 text-red-700 border-red-200" },
  pending_approval:         { bg: "bg-yellow-50", icon: "text-yellow-600", badge: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  unresolved_issue:         { bg: "bg-orange-50", icon: "text-orange-500", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  low_stock:                { bg: "bg-purple-50", icon: "text-purple-500", badge: "bg-purple-100 text-purple-700 border-purple-200" },
  high_potential_follow_up: { bg: "bg-blue-50",   icon: "text-blue-500",   badge: "bg-blue-100 text-blue-700 border-blue-200" },
  delayed_delivery:         { bg: "bg-rose-50",   icon: "text-rose-500",   badge: "bg-rose-100 text-rose-700 border-rose-200" },
  stuck_order:              { bg: "bg-amber-50",  icon: "text-amber-600",  badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

// ── Priority metadata ─────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { border: string; dot: string; text: string }> = {
  critical: { border: "border-l-red-500",    dot: "bg-red-500",    text: "text-red-600 bg-red-50 border-red-200" },
  high:     { border: "border-l-orange-400", dot: "bg-orange-400", text: "text-orange-700 bg-orange-50 border-orange-200" },
  normal:   { border: "border-l-blue-400",   dot: "bg-blue-400",   text: "text-blue-700 bg-blue-50 border-blue-200" },
  low:      { border: "border-l-gray-300",   dot: "bg-gray-300",   text: "text-gray-600 bg-gray-50 border-gray-200" },
};

function priorityLabelKey(p: string): "critical" | "high" | "normal" | "low" {
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "normal";
}

function typeLabelKey(type: string) {
  const MAP: Record<string, Parameters<typeof t>[0]> = {
    overdue_payment:          "overduePayment",
    pending_approval:         "awaitingApproval",
    unresolved_issue:         "unresolvedIssue",
    low_stock:                "lowStockAlert",
    high_potential_follow_up: "highPotentialFollowUp",
    delayed_delivery:         "delayedDelivery",
    stuck_order:              "stuckOrder",
  };
  return MAP[type] ?? "type";
}

// ── Role-based type visibility ────────────────────────────────────────────────

function visibleTypes(role: string | undefined): ActionType[] | "all" {
  if (!role) return "all";
  if (["owner_admin", "general_manager"].includes(role)) return "all";
  if (role === "accounting") return ["overdue_payment", "pending_approval"];
  if (role === "channel_manager") return "all";
  if (role === "sales") return ["high_potential_follow_up", "stuck_order", "overdue_payment"];
  return "all";
}

// ── Action Item Card ──────────────────────────────────────────────────────────

function ActionItemCard({ item, lang }: { item: any; lang: Lang }) {
  const type = item.type as ActionType;
  const TypeIcon = TYPE_ICON[type] ?? Zap;
  const typeColor = TYPE_COLORS[type] ?? TYPE_COLORS.stuck_order;
  const prioStyle = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.normal;

  return (
    <Card className={cn("border-l-4 transition-shadow hover:shadow-sm", prioStyle.border)}>
      <CardContent className="p-4 flex items-start gap-4">
        {/* Type icon */}
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5", typeColor.bg)}>
          <TypeIcon className={cn("h-4.5 w-4.5", typeColor.icon)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border", prioStyle.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", prioStyle.dot)} />
              {t(priorityLabelKey(item.priority), lang)}
            </span>
            <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", typeColor.badge)}>
              {t(typeLabelKey(item.type), lang)}
            </span>
            {item.channel && item.channel !== "all" && (
              <Badge variant="outline" className="text-[11px] capitalize px-2 py-0.5">
                {item.channel === "coffee" ? (
                  <><Coffee className="h-3 w-3 mr-1" />{item.channel}</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" />{item.channel}</>
                )}
              </Badge>
            )}
          </div>

          {/* Title + customer */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm leading-snug">
              {item.title}
            </span>
            {item.customerName && item.customerName !== item.title && (
              <span className="text-muted-foreground text-sm">{item.customerName}</span>
            )}
          </div>

          {/* Reason */}
          <p className="text-xs text-muted-foreground mt-0.5 capitalize-first">{item.reason}</p>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {item.ageDays !== null && item.ageDays > 0 && (
              <span className={cn(
                "font-medium",
                item.ageDays >= 7 ? "text-red-600" : item.ageDays >= 3 ? "text-orange-600" : ""
              )}>
                {item.ageDays} {t("daysAgo", lang)}
              </span>
            )}
            {item.dueDate && (
              <span>{t("dueDateLabel", lang)}: {item.dueDate}</span>
            )}
            {item.ownerName && (
              <span>{t("assignedTo", lang)}: <span className="font-medium text-foreground">{item.ownerName}</span></span>
            )}
            {item.entityRef && item.entityRef !== item.title && (
              <span className="font-mono text-[11px]">{item.entityRef}</span>
            )}
          </div>
        </div>

        {/* View link */}
        <Link href={item.link}>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
            {t("viewRecord", lang)}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ items, lang }: { items: any[]; lang: Lang }) {
  const counts: Record<string, number> = { critical: 0, high: 0, normal: 0, low: 0 };
  for (const i of items) counts[i.priority] = (counts[i.priority] ?? 0) + 1;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {counts.critical > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
          {counts.critical} {t("critical", lang)}
        </span>
      )}
      {counts.high > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
          {counts.high} {t("high", lang)}
        </span>
      )}
      <span className="text-xs text-muted-foreground border rounded-full px-2.5 py-1">
        {items.length} {t("openItems", lang)}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionCenterPage() {
  const { lang } = useLang();
  const { channel: globalChannel } = useChannel();
  const { user } = useAuth();

  const [typeFilter, setTypeFilter]         = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [channelOverride, setChannelOverride] = useState("global");

  const channelParam = channelOverride === "global" ? globalChannel : channelOverride;
  const qs = channelParam !== "all" ? `?channel=${encodeURIComponent(channelParam)}` : "";

  const { data: rawItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["action-center", channelParam],
    queryFn: () =>
      fetch(`/api/action-center${qs}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
  });

  // Role-based visibility
  const allowedTypes = visibleTypes(user?.role);

  const roleFiltered = useMemo(() => {
    if (allowedTypes === "all") return rawItems;
    return rawItems.filter(i => (allowedTypes as string[]).includes(i.type));
  }, [rawItems, allowedTypes]);

  // Local filters
  const filtered = useMemo(() => {
    let list = roleFiltered;
    if (typeFilter !== "all") list = list.filter(i => i.type === typeFilter);
    if (priorityFilter !== "all") list = list.filter(i => i.priority === priorityFilter);
    return list;
  }, [roleFiltered, typeFilter, priorityFilter]);

  const hasFilters = typeFilter !== "all" || priorityFilter !== "all" || channelOverride !== "global";

  function clearFilters() {
    setTypeFilter("all");
    setPriorityFilter("all");
    setChannelOverride("global");
  }

  const channelLabel = (v: string) => {
    if (v === "global" || v === "all") return t("allChannels", lang);
    if (v === "coffee") return t("coffee", lang);
    return t("cosmetics", lang);
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            {t("actionCenter", lang)}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("actionCenterDesc", lang)}
          </p>
        </div>
        <SummaryBar items={roleFiltered} lang={lang} />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Type */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={t("allTypes", lang)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes", lang)}</SelectItem>
            <SelectItem value="overdue_payment">{t("overduePayment", lang)}</SelectItem>
            <SelectItem value="pending_approval">{t("awaitingApproval", lang)}</SelectItem>
            <SelectItem value="unresolved_issue">{t("unresolvedIssue", lang)}</SelectItem>
            <SelectItem value="low_stock">{t("lowStockAlert", lang)}</SelectItem>
            <SelectItem value="high_potential_follow_up">{t("highPotentialFollowUp", lang)}</SelectItem>
            <SelectItem value="delayed_delivery">{t("delayedDelivery", lang)}</SelectItem>
            <SelectItem value="stuck_order">{t("stuckOrder", lang)}</SelectItem>
          </SelectContent>
        </Select>

        {/* Priority */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("allPriorities", lang)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPriorities", lang)}</SelectItem>
            <SelectItem value="critical">{t("critical", lang)}</SelectItem>
            <SelectItem value="high">{t("high", lang)}</SelectItem>
            <SelectItem value="normal">{t("normal", lang)}</SelectItem>
            <SelectItem value="low">{t("low", lang)}</SelectItem>
          </SelectContent>
        </Select>

        {/* Channel override */}
        <Select value={channelOverride} onValueChange={setChannelOverride}>
          <SelectTrigger className="w-44">
            <Globe className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue>{channelLabel(channelOverride)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">{t("allChannels", lang)} (global)</SelectItem>
            <SelectItem value="all">{t("allChannels", lang)}</SelectItem>
            <SelectItem value="coffee">
              <span className="flex items-center gap-1.5">
                <Coffee className="h-3.5 w-3.5" />
                {t("coffee", lang)}
              </span>
            </SelectItem>
            <SelectItem value="cosmetics">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {t("cosmetics", lang)}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t("clearFilters", lang)}
          </Button>
        )}

        {/* Live count */}
        {!isLoading && filtered.length !== roleFiltered.length && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} / {roleFiltered.length} {t("records", lang)}
          </span>
        )}
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {t("loading", lang)}
        </div>
      )}

      {/* ── Empty ───────────────────────────────────────────────────────────── */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="h-14 w-14 mx-auto mb-3 opacity-15" />
          <p className="text-base font-medium">{t("noActionItems", lang)}</p>
          {hasFilters && (
            <p className="text-sm mt-1">{t("noMatchFilters", lang)}</p>
          )}
        </div>
      )}

      {/* ── Item list ───────────────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((item: any) => (
            <ActionItemCard key={item.id} item={item} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
