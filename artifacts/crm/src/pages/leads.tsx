import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLeads,
  useCreateLead,
  useUpdateLead,
  useConvertLead,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { StatusBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils";
import { Plus, X, UserPlus, ArrowRightCircle, SlidersHorizontal, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  SEGMENT_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  CHANNEL_OPTIONS,
  type PriorityClass,
  inferSegment,
  normalisePaymentTerms,
  normaliseChannel,
  segmentDisplayLabel,
  channelDisplayLabel,
  paymentTermsDisplayLabel,
  regionDisplayLabel,
} from "@/lib/customer-options";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";

const IMPORTANCE_OPTIONS = [
  { value: "normal",         labelKey: "normal"        as const, className: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "important",      labelKey: "important"     as const, className: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "high_potential", labelKey: "highPotential" as const, className: "bg-purple-100 text-purple-700 border-purple-200" },
];

const REGION_OPTIONS = [
  "Oslo", "Viken", "Innlandet", "Vestfold og Telemark", "Agder",
  "Rogaland", "Vestland", "Møre og Romsdal", "Trøndelag",
  "Nordland", "Troms og Finnmark", "Other",
];

function ImportanceBadge({ importance }: { importance?: string | null }) {
  const { lang } = useLang();
  const cfg = IMPORTANCE_OPTIONS.find(o => o.value === (importance ?? "normal")) ?? IMPORTANCE_OPTIONS[0];
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${cfg.className}`}>
      {t(cfg.labelKey, lang)}
    </Badge>
  );
}

type ConvertForm = {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  channel: string;
  segment: string;
  priorityClass: PriorityClass;
  paymentTerms: string;
  discountLevel: string;
  notes: string;
};

export default function LeadsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: leads, isLoading, refetch } = useListLeads();
  const { toast } = useToast();
  const { user } = useAuth();
  const { channel } = useChannel();
  const { lang } = useLang();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    companyName: "", contactPerson: "", phone: "", email: "",
    businessChannel: "horeca", businessType: "", estimatedMonthlyConsumption: "",
    preferredCoffeeType: "", requestedPaymentTerms: "net_30", extraNotes: "",
    region: "", importance: "normal",
  });

  // Filters
  const [creatorFilter, setCreatorFilter]   = useState("all");
  const [regionFilter,  setRegionFilter]    = useState("all");
  const [importFilter,  setImportFilter]    = useState("all");
  const [dateFrom,      setDateFrom]        = useState("");
  const [dateTo,        setDateTo]          = useState("");

  const [convertLeadId, setConvertLeadId] = useState<number | null>(null);
  const [convertForm, setConvertForm] = useState<ConvertForm | null>(null);

  // Only non-drivers can edit importance
  const canEditImportance = !!user && user.role !== "driver";

  const createLead = useCreateLead({
    mutation: {
      onSuccess: () => {
        refetch();
        setShowForm(false);
        setForm({ companyName: "", contactPerson: "", phone: "", email: "", businessChannel: "horeca", businessType: "", estimatedMonthlyConsumption: "", preferredCoffeeType: "", requestedPaymentTerms: "net_30", extraNotes: "", region: "", importance: "normal" });
        toast({ title: t("leadSubmittedSuccess", lang) });
      },
      onError: () => toast({ title: t("failedToSubmitLead", lang), variant: "destructive" })
    }
  });

  const updateLead = useUpdateLead({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: t("leadUpdated", lang) }); },
      onError: () => toast({ title: t("failedToUpdateLead", lang), variant: "destructive" }),
    },
  });

  const convertLead = useConvertLead({
    mutation: {
      onSuccess: (created: any) => {
        toast({ title: t("leadConvertedToCustomer", lang), description: created?.companyName });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setConvertLeadId(null);
        setConvertForm(null);
        if (created?.id) navigate(`/customers/${created.id}`);
      },
      onError: (e: any) =>
        toast({ title: t("conversionFailed", lang), description: e?.error ?? "", variant: "destructive" }),
    },
  });

  const openConvert = (lead: any) => {
    setConvertLeadId(lead.id);
    setConvertForm({
      companyName: lead.companyName ?? "",
      contactPerson: lead.contactPerson ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      channel: normaliseChannel(lead.businessChannel),
      segment: inferSegment(lead.businessType),
      priorityClass: lead.qualificationResult === "auto_qualified" ? "B" : "C",
      paymentTerms: normalisePaymentTerms(lead.requestedPaymentTerms),
      discountLevel: "",
      notes: lead.extraNotes ?? "",
    });
  };

  const submitConvert = () => {
    if (!convertLeadId || !convertForm) return;
    if (
      convertForm.companyName.trim().length < 2 ||
      convertForm.contactPerson.trim().length < 2 ||
      convertForm.phone.trim().length < 4 ||
      convertForm.email.trim().length < 3
    ) {
      toast({ title: t("fillRequiredConvertFields", lang), variant: "destructive" });
      return;
    }
    const discount =
      convertForm.discountLevel.trim() === ""
        ? null
        : Number(convertForm.discountLevel);
    if (discount !== null && Number.isNaN(discount)) {
      toast({ title: t("discountMustBeNumber", lang), variant: "destructive" });
      return;
    }
    convertLead.mutate({
      id: convertLeadId,
      data: {
        companyName: convertForm.companyName.trim(),
        contactPerson: convertForm.contactPerson.trim(),
        phone: convertForm.phone.trim(),
        email: convertForm.email.trim(),
        customerChannel: convertForm.channel,
        businessChannel: convertForm.channel,
        segment: convertForm.segment,
        priorityClass: convertForm.priorityClass,
        paymentTerms: convertForm.paymentTerms,
        discountLevel: discount,
        notes: convertForm.notes.trim() || null,
      } as any,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLead.mutate({ data: { ...form, estimatedMonthlyConsumption: form.estimatedMonthlyConsumption || undefined } as any });
  };

  // Build creator list for filter (id "unknown" = leads with no createdBy)
  const creatorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    let hasUnknown = false;
    for (const l of (leads ?? []) as any[]) {
      if (l.createdBy && l.createdByName) seen.set(String(l.createdBy), l.createdByName);
      else if (!l.createdBy) hasUnknown = true;
    }
    const opts = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
    if (hasUnknown) opts.push({ id: "unknown", name: "Unknown / System" });
    return opts;
  }, [leads]);

  // Build region list — static REGION_OPTIONS + any extra values from actual data
  const regionOptions = useMemo(() => {
    const seen = new Set<string>(REGION_OPTIONS);
    for (const l of (leads ?? []) as any[]) {
      if (l.region) seen.add(l.region);
    }
    return Array.from(seen);
  }, [leads]);

  const hasFilters = creatorFilter !== "all" || regionFilter !== "all" || importFilter !== "all" || dateFrom || dateTo;

  function clearFilters() {
    setCreatorFilter("all"); setRegionFilter("all"); setImportFilter("all");
    setDateFrom(""); setDateTo("");
  }

  const filtered = useMemo(() => {
    let list = (leads ?? []) as any[];
    // Global channel filter
    if (channel !== "all") {
      if (channel === "cosmetics") list = list.filter(l => l.businessChannel === "cosmetics");
      else list = list.filter(l => l.businessChannel !== "cosmetics");
    }
    if (creatorFilter !== "all") {
      if (creatorFilter === "unknown") list = list.filter(l => !l.createdBy);
      else list = list.filter(l => String(l.createdBy) === creatorFilter);
    }
    if (regionFilter !== "all") {
      const rf = regionFilter.toLowerCase();
      list = list.filter(l => (l.region ?? "").toLowerCase() === rf);
    }
    if (importFilter  !== "all") list = list.filter(l => (l.importance ?? "normal") === importFilter);
    if (dateFrom) list = list.filter(l => l.createdAt >= dateFrom);
    if (dateTo)   list = list.filter(l => l.createdAt <= dateTo + "T23:59:59Z");
    return list;
  }, [leads, channel, creatorFilter, regionFilter, importFilter, dateFrom, dateTo]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("leads", lang)}</h1>
          <p className="text-muted-foreground text-sm">{filtered.length}{hasFilters ? ` ${t("ofLabel", lang)} ${(leads ?? []).length}` : ""} {t("leadIntakeSubtitle", lang)}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          {showForm ? t("cancel", lang) : t("newLead", lang)}
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {t("newLeadIntake", lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("companyNameReq", lang)}</Label>
                <Input required value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("contactPersonReq", lang)}</Label>
                <Input required value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("phone", lang)}</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("emailLabel", lang)}</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("businessChannelLabel", lang)}</Label>
                <Select value={form.businessChannel} onValueChange={v => setForm(p => ({ ...p, businessChannel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horeca">{channelDisplayLabel("horeca", lang)}</SelectItem>
                    <SelectItem value="office">{channelDisplayLabel("office", lang)}</SelectItem>
                    <SelectItem value="retail">{channelDisplayLabel("retail", lang)}</SelectItem>
                    <SelectItem value="cosmetics">{channelDisplayLabel("cosmetics", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("businessTypeLabel", lang)}</Label>
                <Input placeholder="e.g. bar, hotel, coworking..." value={form.businessType} onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("monthlyConsumptionLabel", lang)}</Label>
                <Input type="number" value={form.estimatedMonthlyConsumption} onChange={e => setForm(p => ({ ...p, estimatedMonthlyConsumption: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("paymentTermsLabel", lang)}</Label>
                <Select value={form.requestedPaymentTerms} onValueChange={v => setForm(p => ({ ...p, requestedPaymentTerms: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net_14">{paymentTermsDisplayLabel("net_14", lang)}</SelectItem>
                    <SelectItem value="net_30">{paymentTermsDisplayLabel("net_30", lang)}</SelectItem>
                    <SelectItem value="net_60">{paymentTermsDisplayLabel("net_60", lang)}</SelectItem>
                    <SelectItem value="cash_on_delivery">{paymentTermsDisplayLabel("cash_on_delivery", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("region", lang)}</Label>
                <Select value={form.region || "_none"} onValueChange={v => setForm(p => ({ ...p, region: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={t("selectRegionPlaceholder", lang)} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— {t("noRegionOption", lang)} —</SelectItem>
                    {REGION_OPTIONS.map(r => <SelectItem key={r} value={r}>{regionDisplayLabel(r, lang)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("importance", lang)}</Label>
                <Select value={form.importance} onValueChange={v => setForm(p => ({ ...p, importance: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPORTANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{t(o.labelKey, lang)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>{t("notes", lang)}</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 bg-background"
                  value={form.extraNotes}
                  onChange={e => setForm(p => ({ ...p, extraNotes: e.target.value }))}
                  placeholder="Additional information..."
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button type="submit" disabled={createLead.isPending}>
                  {createLead.isPending ? t("submitting", lang) : t("submitLead", lang)}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-muted/20 border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{t("filters", lang)}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={creatorFilter} onValueChange={setCreatorFilter}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder={t("allCreators", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allCreators", lang)}</SelectItem>
              {creatorOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder={t("allRegions", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allRegions", lang)}</SelectItem>
              {regionOptions.map(r => <SelectItem key={r} value={r}>{regionDisplayLabel(r, lang)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={importFilter} onValueChange={setImportFilter}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder={t("allImportance", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allImportance", lang)}</SelectItem>
              {IMPORTANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{t(o.labelKey, lang)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("createdDate", lang)}</span>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 text-xs w-36" />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X className="h-3.5 w-3.5" />
            {t("clearFilters", lang)}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">{t("loading", lang)}</div>}
        {!isLoading && filtered.map((lead: any) => {
          const isQualified = lead.qualificationResult === "auto_qualified";
          const followUpOverdue = lead.followUpDueAt && !lead.followUpCompletedAt && new Date(lead.followUpDueAt).getTime() <= Date.now();
          const isConverted = lead.status === "converted_to_customer";
          return (
          <Card key={lead.id} className={followUpOverdue ? "border-amber-300" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{lead.companyName}</span>
                    <StatusBadge status={lead.status} />
                    <ImportanceBadge importance={lead.importance} />
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${isQualified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {isQualified ? t("autoQualified", lang) : t("statusManualReview", lang)}
                    </span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{channelDisplayLabel(lead.businessChannel ?? "", lang)}</span>
                    {lead.region && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{regionDisplayLabel(lead.region, lang)}</span>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>{lead.contactPerson}</span>
                    {lead.phone && <span>{lead.phone}</span>}
                    {lead.email && <span>{lead.email}</span>}
                    {lead.businessType && <span>{segmentDisplayLabel(lead.businessType, lang)}</span>}
                    {lead.estimatedMonthlyConsumption && <span>{lead.estimatedMonthlyConsumption} {t("kgPerMonth", lang)}</span>}
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {lead.createdByName ?? t("unknown", lang)}
                    </span>
                  </div>
                  {lead.qualificationReason && (
                    <p className="text-xs text-muted-foreground"><span className="font-medium">{t("scoringLabel", lang)}:</span> {lead.qualificationReason}</p>
                  )}
                  {lead.extraNotes && <p className="text-xs text-muted-foreground italic">"{lead.extraNotes}"</p>}
                  {followUpOverdue && (
                    <div className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5 border border-amber-200 inline-flex items-center gap-1.5">
                      ⏰ {t("followUpDueSince", lang)} {formatDateTime(lead.followUpDueAt)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDateTime(lead.createdAt)}</p>
                  {/* Importance edit (non-driver only) */}
                  {canEditImportance && !isConverted && (
                    <Select
                      value={lead.importance ?? "normal"}
                      onValueChange={v => updateLead.mutate({ id: lead.id, data: { importance: v } as any })}
                    >
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORTANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{t(o.labelKey, lang)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {!isConverted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openConvert(lead)}
                      data-testid={`button-convert-lead-${lead.id}`}
                    >
                      <ArrowRightCircle className="h-4 w-4 mr-1.5" />
                      {t("convertToCustomer", lang)}
                    </Button>
                  )}
                  {isConverted && (
                    <span className="text-xs text-emerald-700 font-medium">{t("convertedLabel", lang)}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>{hasFilters ? t("noLeadsMatchFilters", lang) : t("noLeads", lang)}</p>
          </div>
        )}
      </div>

      <Dialog open={!!convertLeadId} onOpenChange={(open) => { if (!open) { setConvertLeadId(null); setConvertForm(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("convertLeadTitle", lang)}</DialogTitle>
            <DialogDescription>
              {t("convertLeadDesc", lang)}
            </DialogDescription>
          </DialogHeader>
          {convertForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("companyNameReq", lang)}</Label>
                <Input
                  value={convertForm.companyName}
                  onChange={e => setConvertForm(p => p && { ...p, companyName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("contactPersonReq", lang)}</Label>
                  <Input
                    value={convertForm.contactPerson}
                    onChange={e => setConvertForm(p => p && { ...p, contactPerson: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("phoneReq", lang)}</Label>
                  <Input
                    value={convertForm.phone}
                    onChange={e => setConvertForm(p => p && { ...p, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("emailReq", lang)}</Label>
                <Input
                  value={convertForm.email}
                  onChange={e => setConvertForm(p => p && { ...p, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("channel", lang)}</Label>
                  <Select value={convertForm.channel} onValueChange={v => setConvertForm(p => p && { ...p, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{channelDisplayLabel(o, lang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("segment", lang)}</Label>
                  <Select value={convertForm.segment} onValueChange={v => setConvertForm(p => p && { ...p, segment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENT_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{segmentDisplayLabel(o, lang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("priorityClassLabel", lang)}</Label>
                  <Select
                    value={convertForm.priorityClass}
                    onValueChange={v => setConvertForm(p => p && { ...p, priorityClass: v as PriorityClass })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">{t("priorityALabel", lang)}</SelectItem>
                      <SelectItem value="B">{t("priorityBLabel", lang)}</SelectItem>
                      <SelectItem value="C">{t("priorityCLabel", lang)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("paymentTermsLabel", lang)}</Label>
                  <Select value={convertForm.paymentTerms} onValueChange={v => setConvertForm(p => p && { ...p, paymentTerms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{paymentTermsDisplayLabel(o, lang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("discountOptional", lang)}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={convertForm.discountLevel}
                  onChange={e => setConvertForm(p => p && { ...p, discountLevel: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("notesOptional", lang)}</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 bg-background"
                  value={convertForm.notes}
                  onChange={e => setConvertForm(p => p && { ...p, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvertLeadId(null); setConvertForm(null); }}>
              {t("cancel", lang)}
            </Button>
            <Button onClick={submitConvert} disabled={convertLead.isPending}>
              {convertLead.isPending ? t("converting", lang) : t("convertToCustomer", lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
