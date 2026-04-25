import { useState } from "react";
import { Link } from "wouter";
import { useListCustomers, useCheckCustomerDuplicates } from "@workspace/api-client-react";
import { PriorityBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, AlertTriangle } from "lucide-react";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeForm, setDupeForm] = useState({ companyName: "", phone: "", email: "" });
  const [dupeMatches, setDupeMatches] = useState<any[]>([]);
  const [dupeChecked, setDupeChecked] = useState(false);

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (priority !== "all") params.priority = priority;
  if (activeFilter !== "all") params.active = activeFilter;

  const { data: customers, isLoading } = useListCustomers(params as any);

  const checkDupes = useCheckCustomerDuplicates({
    mutation: {
      onSuccess: (res: any) => {
        setDupeMatches(res?.matches ?? []);
        setDupeChecked(true);
      },
    },
  });

  const runDupeCheck = () => {
    setDupeChecked(false);
    checkDupes.mutate({ data: dupeForm });
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">{customers?.length ?? 0} records</p>
        </div>
        <Button size="sm" onClick={() => { setDupeOpen(true); setDupeChecked(false); setDupeMatches([]); setDupeForm({ companyName: "", phone: "", email: "" }); }}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Customer
        </Button>
      </div>

      <Dialog open={dupeOpen} onOpenChange={setDupeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Customer — Duplicate Check</DialogTitle>
            <DialogDescription>
              Enter at least one identifier and we'll check whether a similar customer already exists.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input value={dupeForm.companyName} onChange={e => setDupeForm({ ...dupeForm, companyName: e.target.value })} placeholder="e.g. Bean & Brew" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={dupeForm.phone} onChange={e => setDupeForm({ ...dupeForm, phone: e.target.value })} placeholder="+1 555 ..." />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={dupeForm.email} onChange={e => setDupeForm({ ...dupeForm, email: e.target.value })} placeholder="contact@..." />
              </div>
            </div>

            {dupeChecked && dupeMatches.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {dupeMatches.length} possible duplicate{dupeMatches.length === 1 ? "" : "s"} found
                </div>
                <div className="space-y-1">
                  {dupeMatches.slice(0, 5).map(m => (
                    <Link key={m.id} href={`/customers/${m.id}`}>
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-100 cursor-pointer">
                        <PriorityBadge priority={m.priorityClass} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.companyName}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.contactPerson} · {m.phone} · {m.email}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <p className="text-xs text-amber-800">
                  Review existing records before creating a new one.
                </p>
              </div>
            )}
            {dupeChecked && dupeMatches.length === 0 && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                No similar customers found. Safe to create.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupeOpen(false)}>Cancel</Button>
            <Button onClick={runDupeCheck} disabled={checkDupes.isPending || (!dupeForm.companyName && !dupeForm.phone && !dupeForm.email)}>
              {checkDupes.isPending ? "Checking..." : "Check for duplicates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="A">Priority A</SelectItem>
            <SelectItem value="B">Priority B</SelectItem>
            <SelectItem value="C">Priority C</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Segment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading...</td></tr>
              )}
              {!isLoading && (customers ?? []).map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <PriorityBadge priority={c.priorityClass} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`}>
                      <span className="text-sm font-medium text-primary hover:underline cursor-pointer">{c.companyName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{c.contactPerson}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize">{c.customerChannel}</td>
                  <td className="px-4 py-3 text-sm capitalize">{c.segment.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-sm">{c.paymentTerms}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && (customers ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No customers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
