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
} from "@/lib/customer-options";

const IMPORTANCE_OPTIONS = [
  { value: "normal",       label: "Normal",        className: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "important",    label: "Important",     className: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "high_potential", label: "High Potential", className: "bg-purple-100 text-purple-700 border-purple-200" },
];

const REGION_OPTIONS = [
  "Oslo", "Viken", "Innlandet", "Vestfold og Telemark", "Agder",
  "Rogaland", "Vestland", "Møre og Romsdal", "Trøndelag",
  "Nordland", "Troms og Finnmark", "Other",
];

function ImportanceBadge({ importance }: { importance?: string | null }) {
  const cfg = IMPORTANCE_OPTIONS.find(o => o.value === (importance ?? "normal")) ?? IMPORTANCE_OPTIONS[0];
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${cfg.className}`}>
      {cfg.label}
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
        toast({ title: "Lead submitted successfully" });
      },
      onError: () => toast({ title: "Failed to submit lead", variant: "destructive" })
    }
  });

  const updateLead = useUpdateLead({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Lead updated" }); },
      onError: () => toast({ title: "Failed to update lead", variant: "destructive" }),
    },
  });

  const convertLead = useConvertLead({
    mutation: {
      onSuccess: (created: any) => {
        toast({ title: "Lead converted to customer", description: created?.companyName });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setConvertLeadId(null);
        setConvertForm(null);
        if (created?.id) navigate(`/customers/${created.id}`);
      },
      onError: (e: any) =>
        toast({ title: "Conversion failed", description: e?.error ?? "", variant: "destructive" }),
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
      toast({ title: "Fill in company, contact person, phone and email", variant: "destructive" });
      return;
    }
    const discount =
      convertForm.discountLevel.trim() === ""
        ? null
        : Number(convertForm.discountLevel);
    if (discount !== null && Number.isNaN(discount)) {
      toast({ title: "Discount must be a number", variant: "destructive" });
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

  // Build creator list for filter
  const creatorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of (leads ?? []) as any[]) {
      if (l.createdBy && l.createdByName) seen.set(String(l.createdBy), l.createdByName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [leads]);

  // Build region list for filter
  const regionOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const l of (leads ?? []) as any[]) {
      if (l.region) seen.add(l.region);
    }
    return Array.from(seen).sort();
  }, [leads]);

  const hasFilters = creatorFilter !== "all" || regionFilter !== "all" || importFilter !== "all" || dateFrom || dateTo;

  function clearFilters() {
    setCreatorFilter("all"); setRegionFilter("all"); setImportFilter("all");
    setDateFrom(""); setDateTo("");
  }

  const filtered = useMemo(() => {
    let list = (leads ?? []) as any[];
    if (creatorFilter !== "all") list = list.filter(l => String(l.createdBy) === creatorFilter);
    if (regionFilter  !== "all") list = list.filter(l => l.region === regionFilter);
    if (importFilter  !== "all") list = list.filter(l => (l.importance ?? "normal") === importFilter);
    if (dateFrom) list = list.filter(l => l.createdAt >= dateFrom);
    if (dateTo)   list = list.filter(l => l.createdAt <= dateTo + "T23:59:59Z");
    return list;
  }, [leads, creatorFilter, regionFilter, importFilter, dateFrom, dateTo]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">{filtered.length}{hasFilters ? ` of ${(leads ?? []).length}` : ""} lead intake records</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          {showForm ? "Cancel" : "New Lead"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              New Lead Intake
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input required value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person *</Label>
                <Input required value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Business Channel</Label>
                <Select value={form.businessChannel} onValueChange={v => setForm(p => ({ ...p, businessChannel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horeca">HoReCa</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Input placeholder="e.g. bar, hotel, coworking..." value={form.businessType} onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Consumption (kg)</Label>
                <Input type="number" value={form.estimatedMonthlyConsumption} onChange={e => setForm(p => ({ ...p, estimatedMonthlyConsumption: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.requestedPaymentTerms} onValueChange={v => setForm(p => ({ ...p, requestedPaymentTerms: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net_14">Net 14</SelectItem>
                    <SelectItem value="net_30">Net 30</SelectItem>
                    <SelectItem value="net_60">Net 60</SelectItem>
                    <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Select value={form.region || "_none"} onValueChange={v => setForm(p => ({ ...p, region: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select region..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No region —</SelectItem>
                    {REGION_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Importance</Label>
                <Select value={form.importance} onValueChange={v => setForm(p => ({ ...p, importance: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPORTANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 bg-background"
                  value={form.extraNotes}
                  onChange={e => setForm(p => ({ ...p, extraNotes: e.target.value }))}
                  placeholder="Additional information..."
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button type="submit" disabled={createLead.isPending}>
                  {createLead.isPending ? "Submitting..." : "Submit Lead"}
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
          <span>Filters</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {creatorOptions.length > 0 && (
            <Select value={creatorFilter} onValueChange={setCreatorFilter}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="All creators" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All creators</SelectItem>
                {creatorOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {regionOptions.length > 0 && (
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All regions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regionOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={importFilter} onValueChange={setImportFilter}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="All importance" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All importance</SelectItem>
              {IMPORTANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Created</span>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 text-xs w-36" />
          </div>
          {hasFilters && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>}
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
                      {isQualified ? "Auto-qualified" : "Needs review"}
                    </span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">{lead.businessChannel}</span>
                    {lead.region && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{lead.region}</span>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>{lead.contactPerson}</span>
                    {lead.phone && <span>{lead.phone}</span>}
                    {lead.email && <span>{lead.email}</span>}
                    {lead.businessType && <span className="capitalize">{lead.businessType}</span>}
                    {lead.estimatedMonthlyConsumption && <span>{lead.estimatedMonthlyConsumption} kg/mo est.</span>}
                    {lead.createdByName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {lead.createdByName}
                      </span>
                    )}
                  </div>
                  {lead.qualificationReason && (
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Scoring:</span> {lead.qualificationReason}</p>
                  )}
                  {lead.extraNotes && <p className="text-xs text-muted-foreground italic">"{lead.extraNotes}"</p>}
                  {followUpOverdue && (
                    <div className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5 border border-amber-200 inline-flex items-center gap-1.5">
                      ⏰ Follow-up due since {formatDateTime(lead.followUpDueAt)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDateTime(lead.createdAt)}</p>
                  {/* Importance edit (non-driver only) */}
                  {canEditImportance && !isConverted && (
                    <Select
                      value={lead.importance ?? "normal"}
                      onValueChange={v => updateLead.mutate({ id: lead.id, data: { importance: v } })}
                    >
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORTANCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                      Convert to Customer
                    </Button>
                  )}
                  {isConverted && (
                    <span className="text-xs text-emerald-700 font-medium">Converted</span>
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
            <p>{hasFilters ? "No leads match the current filters." : "No leads yet"}</p>
          </div>
        )}
      </div>

      <Dialog open={!!convertLeadId} onOpenChange={(open) => { if (!open) { setConvertLeadId(null); setConvertForm(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert Lead to Customer</DialogTitle>
            <DialogDescription>
              Review and adjust the values pulled from the lead, then assign a priority.
            </DialogDescription>
          </DialogHeader>
          {convertForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Company name *</Label>
                <Input
                  value={convertForm.companyName}
                  onChange={e => setConvertForm(p => p && { ...p, companyName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Contact person *</Label>
                  <Input
                    value={convertForm.contactPerson}
                    onChange={e => setConvertForm(p => p && { ...p, contactPerson: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone *</Label>
                  <Input
                    value={convertForm.phone}
                    onChange={e => setConvertForm(p => p && { ...p, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  value={convertForm.email}
                  onChange={e => setConvertForm(p => p && { ...p, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select value={convertForm.channel} onValueChange={v => setConvertForm(p => p && { ...p, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map(o => (
                        <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Segment</Label>
                  <Select value={convertForm.segment} onValueChange={v => setConvertForm(p => p && { ...p, segment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENT_OPTIONS.map(o => (
                        <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Priority class *</Label>
                  <Select
                    value={convertForm.priorityClass}
                    onValueChange={v => setConvertForm(p => p && { ...p, priorityClass: v as PriorityClass })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A — top priority</SelectItem>
                      <SelectItem value="B">B — standard</SelectItem>
                      <SelectItem value="C">C — low priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment terms</Label>
                  <Select value={convertForm.paymentTerms} onValueChange={v => setConvertForm(p => p && { ...p, paymentTerms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS_OPTIONS.map(o => (
                        <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Discount % (optional)</Label>
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
                <Label>Notes (optional)</Label>
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
              Cancel
            </Button>
            <Button onClick={submitConvert} disabled={convertLead.isPending}>
              {convertLead.isPending ? "Converting..." : "Convert to Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
