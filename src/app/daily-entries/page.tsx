
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  BookOpenText, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Search,
  Filter,
  Trash2,
  AlertCircle,
  Tag,
  Loader2,
  X,
  User,
  PlusCircle,
  Calculator,
  Layers,
  Edit2,
  Save,
  Calendar,
  ChevronDown,
  ListTree,
  NotebookPen,
  Settings,
  MessageSquare,
  ChevronUp,
  CornerDownRight,
  Layout
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue,
  SelectSeparator
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn, getCurrencySymbol } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking, useUser, useDoc } from "@/firebase";
import { collection, query, orderBy, serverTimestamp, doc, where } from "firebase/firestore";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { subDays, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay, subMonths } from "date-fns";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";

const FALLBACK_CATEGORIES = ["Sales", "Expense", "Rent", "Salary", "Purchase", "Utility", "Other"];
const DEFAULT_UNITS = ["pcs", "kg", "box", "packet", "unit", "litre", "meter"];
const FALLBACK_PARTICULARS = ["Tea & Snacks", "Conveyance", "Office Cleaning", "Stationery Purchase", "Customer Refund"];

type DateFilterType = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'all';

type DraftEntry = {
  id: string;
  type: 'credit' | 'debit';
  particulars: string;
  rate: string;
  qty: string;
  unit: string;
  amount: number; 
  category: string;
  entryBy: string;
  notes: string;
};

export default function DailyEntriesPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  // Dynamic Business Resolution
  const userProfileRef = useMemoFirebase(() => 
    !isUserLoading && user?.uid && !user.isAnonymous ? doc(firestore, 'users', user.uid) : null
  , [firestore, user?.uid, isUserLoading, user?.isAnonymous]);
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<any>(userProfileRef);
  const businessId = userProfile?.businessId;

  const businessRef = useMemoFirebase(() => 
    businessId ? doc(firestore, 'businesses', businessId) : null
  , [firestore, businessId]);
  const { data: business } = useDoc<any>(businessRef);
  
  const currencySymbol = getCurrencySymbol(business?.currency);
  const dynamicUnits = business?.baseUnits || DEFAULT_UNITS;
  const dynamicCategories = business?.cashbookCategories || FALLBACK_CATEGORIES;
  const dynamicParticulars = business?.commonParticulars || FALLBACK_PARTICULARS;

  const isPinned = useMemo(() => {
    const layout = (userProfile?.dashboardLayout as any[]) || [];
    return layout.find(w => w.id === 'pulse')?.enabled ?? true;
  }, [userProfile]);

  const toggleDashboardPin = () => {
    if (!userProfileRef || !userProfile) return;
    const currentLayout = [...(userProfile.dashboardLayout || [])];
    const newLayout = currentLayout.map(w => w.id === 'pulse' ? { ...w, enabled: !w.enabled } : w);
    updateDocumentNonBlocking(userProfileRef, { dashboardLayout: newLayout });
    toast({ title: isPinned ? "Unpinned" : "Pinned", description: `Daily Pulse widget ${isPinned ? 'removed from' : 'added to'} Dashboard.` });
  };

  const staffQuery = useMemoFirebase(() => 
    businessId ? query(collection(firestore, 'users'), where('businessId', '==', businessId)) : null
  , [firestore, businessId]);
  const { data: staffListData } = useCollection<any>(staffQuery);
  const staffList = staffListData || [];

  // Real-time Firestore Connection
  const entriesQuery = useMemoFirebase(() => {
    if (!businessId) return null;
    return query(
      collection(firestore, 'businesses', businessId, 'cashbook'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, businessId]);
  const { data: entriesData, isLoading: isEntriesLoading } = useCollection<any>(entriesQuery);
  const entries = entriesData || [];

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  
  const [commonDate, setCommonDate] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedReportRows, setExpandedReportRows] = useState<Record<string, boolean>>({});
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([
    { id: '1', type: 'credit', particulars: '', rate: '', qty: '', unit: dynamicUnits[0] || 'pcs', amount: 0, category: dynamicCategories[0] || 'Sales', entryBy: 'Owner', notes: '' }
  ]);

  useEffect(() => {
    setCommonDate(new Date().toISOString().split('T')[0]);
  }, []);

  const isDateInRange = (dateStr: string, range: DateFilterType) => {
    if (!dateStr) return false;
    const entryDate = parseISO(dateStr);
    const now = new Date();
    
    switch (range) {
      case 'today':
        return dateStr === now.toISOString().split('T')[0];
      case 'yesterday':
        const yesterday = subDays(now, 1).toISOString().split('T')[0];
        return dateStr === yesterday;
      case 'last7':
        return isWithinInterval(entryDate, { start: startOfDay(subDays(now, 7)), end: endOfDay(now) });
      case 'last30':
        return isWithinInterval(entryDate, { start: startOfDay(subDays(now, 30)), end: endOfDay(now) });
      case 'thisMonth':
        return isWithinInterval(entryDate, { start: startOfMonth(now), end: endOfMonth(now) });
      case 'lastMonth':
        return isWithinInterval(entryDate, { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) });
      case 'all':
        return true;
      default:
        return true;
    }
  };

  const batchStats = useMemo(() => {
    const credit = draftEntries
      .filter(e => e.type === 'credit')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const debit = draftEntries
      .filter(e => e.type === 'debit')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    return { credit, debit, net: credit - debit };
  }, [draftEntries]);

  const filteredEntries = useMemo(() => {
    const list = entries || [];
    return list.filter(e => {
      const matchesSearch = e.category?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           e.particulars?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           e.entryBy?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = isDateInRange(e.date, dateFilter);
      return matchesSearch && matchesDate;
    });
  }, [entries, searchTerm, dateFilter]);

  const stats = useMemo(() => {
    const list = entries || [];
    const periodEntries = list.filter(e => isDateInRange(e.date, dateFilter));
    
    const credit = periodEntries
      .filter(e => e.type === 'credit')
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    const debit = periodEntries
      .filter(e => e.type === 'debit')
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    return {
      periodCredit: credit,
      periodDebit: debit,
      netBalance: credit - debit
    };
  }, [entries, dateFilter]);

  const addRow = () => {
    setDraftEntries([...draftEntries, { 
      id: Date.now().toString(), 
      type: 'credit', 
      particulars: '', 
      rate: '', 
      qty: '', 
      unit: dynamicUnits[0] || 'pcs', 
      amount: 0, 
      category: dynamicCategories[0] || 'Sales', 
      entryBy: 'Owner',
      notes: ''
    }]);
  };

  const removeRow = (id: string) => {
    if (draftEntries.length === 1) return;
    setDraftEntries(draftEntries.filter(e => e.id !== id));
  };

  const updateRow = (id: string, key: keyof DraftEntry, value: any) => {
    setDraftEntries(draftEntries.map(e => {
      if (e.id === id) {
        const updated = { ...e, [key]: value };
        if (key === 'rate' || key === 'qty') {
          const r = parseFloat(key === 'rate' ? value : e.rate) || 0;
          const q = parseFloat(key === 'qty' ? value : e.qty) || 0;
          updated.amount = r * q;
        }
        return updated;
      }
      return e;
    }));
  };

  const toggleRowNote = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleReportNote = (id: string) => {
    setExpandedReportRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveBatch = () => {
    if (!businessId) return;
    const validEntries = draftEntries.filter(e => e.amount > 0 && e.particulars);
    if (validEntries.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Please fill at least one complete entry." });
      return;
    }

    const entriesRef = collection(firestore, 'businesses', businessId, 'cashbook');
    
    validEntries.forEach(entry => {
      addDocumentNonBlocking(entriesRef, {
        businessId,
        type: entry.type,
        particulars: entry.particulars,
        rate: parseFloat(entry.rate) || 0,
        qty: parseFloat(entry.qty) || 0,
        unit: entry.unit,
        amount: entry.amount,
        category: entry.category,
        entryBy: entry.entryBy,
        notes: entry.notes || "",
        date: commonDate,
        createdAt: serverTimestamp()
      });
    });

    setIsAddOpen(false);
    resetForm();
    toast({ title: "Batch Recorded", description: `Added ${validEntries.length} entries.` });
  };

  const resetForm = () => {
    setDraftEntries([{ id: '1', type: 'credit', particulars: '', rate: '', qty: '', unit: dynamicUnits[0] || 'pcs', amount: 0, category: dynamicCategories[0] || 'Sales', entryBy: 'Owner', notes: '' }]);
    setExpandedRows({});
  };

  const getDateLabel = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'today': return now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      case 'yesterday': return 'Yesterday';
      case 'last7': return 'Last 7 Days';
      case 'last30': return 'Last 30 Days';
      case 'thisMonth': return 'This Month';
      case 'lastMonth': return 'Last Month';
      case 'all': return 'Full History';
      default: return 'Filter Date';
    }
  };

  if (isProfileLoading || isUserLoading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 md:space-y-8 pb-10">
      {/* Page Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-inner">
            <BookOpenText className="h-7 w-7 md:h-8 md:w-8 text-primary" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 leading-none">Daily Cash Book</h2>
              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border shadow-sm shrink-0">
                <Layout className="h-3 w-3 text-muted-foreground" />
                <Switch checked={isPinned} onCheckedChange={toggleDashboardPin} className="scale-[0.6] data-[state=checked]:bg-primary" />
              </div>
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground uppercase font-black tracking-widest mt-1">Multi-Line Inflow & Outflow</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-3 flex-1 sm:flex-none">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none h-11 px-4 font-black text-[10px] uppercase tracking-wider bg-white shadow-sm border-primary/10 text-primary rounded-xl">
                    <Calendar className="mr-2 h-3.5 w-3.5" /> {getDateLabel()} <ChevronDown className="ml-auto h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl border-none shadow-2xl p-1">
                  <DropdownMenuLabel className="text-[8px] font-black uppercase tracking-widest p-2 opacity-40">Select Window</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setDateFilter('today')} className="text-xs font-bold uppercase p-3 cursor-pointer rounded-xl">Today</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('yesterday')} className="text-xs font-bold uppercase p-3 cursor-pointer rounded-xl">Yesterday</DropdownMenuItem>
                  <Separator className="my-1" />
                  <DropdownMenuItem onClick={() => setDateFilter('all')} className="text-xs font-bold uppercase p-3 cursor-pointer text-primary rounded-xl">Full History</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 shadow-xl h-11 px-6 font-black uppercase text-[10px] tracking-[0.1em] rounded-xl text-white">
                    <Plus className="mr-2 h-4 w-4" /> Batch Entry
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] lg:max-w-[1400px] rounded-[2rem] md:rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden flex flex-col h-[90vh]">
                  <DialogHeader className="p-4 md:p-6 bg-primary text-white shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0 shadow-inner">
                          <Layers className="h-5 w-5 md:h-6 md:w-6" />
                        </div>
                        <div>
                          <DialogTitle className="text-lg md:text-xl font-bold">Record Cash Entries</DialogTitle>
                          <DialogDescription className="text-white/70 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-1">Multi-row rate × quantity booking</DialogDescription>
                        </div>
                      </div>
                      <div className="space-y-1.5 w-full md:w-auto">
                        <Label className="text-[9px] md:text-[10px] font-bold uppercase text-white/70 ml-1">Entry Date</Label>
                        <input type="date" value={commonDate} onChange={(e) => setCommonDate(e.target.value)} className="h-9 w-full md:w-40 bg-white/10 border border-white/20 rounded-xl px-3 text-white text-xs font-bold outline-none focus:bg-white/20" />
                      </div>
                    </div>
                  </DialogHeader>
                  
                  <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="p-4 lg:p-0 min-h-full pb-10">
                      <div className="hidden lg:grid grid-cols-[100px_1fr_120px_100px_120px_140px_140px_140px_100px] gap-2 p-4 bg-muted/50 sticky top-0 z-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                        <div>Type</div>
                        <div>Particulars</div>
                        <div className="text-center">Rate ({currencySymbol})</div>
                        <div className="text-center">Qty</div>
                        <div>Unit</div>
                        <div className="text-center">Total ({currencySymbol})</div>
                        <div>Category</div>
                        <div>By</div>
                        <div>Actions</div>
                      </div>

                      <div className="divide-y divide-border">
                        {draftEntries.map((entry, idx) => (
                          <div key={entry.id} className="group/row">
                            <div className="p-4 lg:p-3 lg:grid lg:grid-cols-[100px_1fr_120px_100px_120px_140px_140px_140px_100px] lg:gap-2 items-center hover:bg-muted/5 transition-all">
                              <div className="lg:hidden flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[8px] font-black uppercase bg-primary/10 text-primary border-none h-4">Entry #{idx + 1}</Badge>
                                  <div className={cn("h-1.5 w-1.5 rounded-full", entry.type === 'credit' ? "bg-green-500" : "bg-red-500")} />
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/40 hover:text-destructive hover:bg-destructive/5 rounded-full" onClick={() => removeRow(entry.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-2 lg:contents gap-x-3 gap-y-4">
                                <div className="col-span-2 lg:col-span-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Flow Type</Label>
                                  <Select value={entry.type} onValueChange={(v: any) => updateRow(entry.id, 'type', v)}>
                                    <SelectTrigger className={cn("h-10 border-none shadow-sm text-[10px] font-black uppercase rounded-xl", entry.type === 'credit' ? "text-green-600 bg-green-50" : "text-destructive bg-red-50")}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-none shadow-2xl">
                                      <SelectItem value="credit" className="text-[10px] font-bold uppercase text-green-600">Credit (+)</SelectItem>
                                      <SelectItem value="debit" className="text-[10px] font-bold uppercase text-destructive">Debit (-)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="col-span-2 lg:col-span-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Particulars</Label>
                                  <div className="relative">
                                    <Input 
                                      placeholder="Description..." 
                                      value={entry.particulars} 
                                      onChange={(e) => updateRow(entry.id, 'particulars', e.target.value)}
                                      className="h-10 text-xs border-none bg-muted/20 font-bold rounded-xl pr-10 shadow-inner"
                                    />
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 absolute right-1 top-1 opacity-40 hover:opacity-100">
                                          <NotebookPen className="h-3.5 w-3.5 text-primary" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-none shadow-2xl p-1">
                                        <DropdownMenuLabel className="text-[8px] font-black uppercase tracking-widest p-2 opacity-40">Quick Selection</DropdownMenuLabel>
                                        <ScrollArea className="h-48">
                                          {(dynamicParticulars || []).map((p: string) => (
                                            <DropdownMenuItem key={p} onClick={() => updateRow(entry.id, 'particulars', p)} className="text-xs font-bold uppercase p-2.5 rounded-xl cursor-pointer">
                                              {p}
                                            </DropdownMenuItem>
                                          ))}
                                        </ScrollArea>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem asChild className="p-0">
                                          <Link href="/settings?tab=master" className="flex items-center gap-2 p-2.5 text-[10px] font-black uppercase text-primary hover:bg-primary/5 cursor-pointer">
                                            <Settings className="h-3 w-3" /> Manage Particulars
                                          </Link>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Rate ({currencySymbol})</Label>
                                  <Input type="number" placeholder="0" value={entry.rate} onChange={(e) => updateRow(entry.id, 'rate', e.target.value)} className="h-10 text-sm font-black border-none bg-primary/5 text-primary text-center rounded-xl shadow-inner" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Qty</Label>
                                  <Input type="number" placeholder="0" value={entry.qty} onChange={(e) => updateRow(entry.id, 'qty', e.target.value)} className="h-10 text-sm font-black border-none bg-muted/20 text-center rounded-xl shadow-inner" />
                                </div>

                                <div className="space-y-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Unit</Label>
                                  <Select value={entry.unit} onValueChange={(v) => updateRow(entry.id, 'unit', v)}>
                                    <SelectTrigger className="h-10 text-[10px] font-black uppercase border-none bg-muted/20 rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                      {(dynamicUnits || []).map((u: string) => <SelectItem key={u} value={u} className="text-[10px] uppercase font-bold">{u}</SelectItem>)}
                                      <SelectSeparator />
                                      <div className="p-1">
                                        <Button asChild variant="ghost" className="w-full h-8 justify-start gap-2 text-[9px] font-black uppercase text-primary hover:bg-primary/5">
                                          <Link href="/settings?tab=master"><Settings className="h-3 w-3 mr-1" /> Manage Units</Link>
                                        </Button>
                                      </div>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Total ({currencySymbol})</Label>
                                  <div className="h-10 flex items-center justify-center text-xs font-black bg-primary/10 rounded-xl text-primary border border-primary/10 shadow-inner">
                                    {currencySymbol}{entry.amount.toLocaleString()}
                                  </div>
                                </div>

                                <div className="col-span-1 lg:col-span-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">Category</Label>
                                  <Select value={entry.category} onValueChange={(v) => updateRow(entry.id, 'category', v)}>
                                    <SelectTrigger className="h-10 text-[10px] font-bold uppercase border-none bg-muted/20 rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                      {(dynamicCategories || []).map((cat: string) => <SelectItem key={cat} value={cat} className="text-[10px] uppercase font-bold">{cat}</SelectItem>)}
                                      <SelectSeparator />
                                      <div className="p-1">
                                        <Button asChild variant="ghost" className="w-full h-8 justify-start gap-2 text-[9px] font-black uppercase text-primary hover:bg-primary/5">
                                          <Link href="/settings?tab=master"><Settings className="h-3 w-3 mr-1" /> Manage Categories</Link>
                                        </Button>
                                      </div>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="col-span-1 lg:col-span-1">
                                  <Label className="lg:hidden text-[9px] font-black uppercase text-muted-foreground mb-1 block">By</Label>
                                  <Select value={entry.entryBy} onValueChange={(v) => updateRow(entry.id, 'entryBy', v)}>
                                    <SelectTrigger className="h-10 text-[10px] font-bold uppercase border-none bg-muted/20 rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                      <SelectItem value="Owner" className="text-[10px] uppercase font-bold">Owner</SelectItem>
                                      {(staffList || []).map((staff: any) => (
                                        <SelectItem key={staff.id} value={staff.name} className="text-[10px] uppercase font-bold">{staff.name}</SelectItem>
                                      ))}
                                      <SelectSeparator />
                                      <div className="p-1">
                                        <Button asChild variant="ghost" className="w-full h-8 justify-start gap-2 text-[9px] font-black uppercase text-primary hover:bg-primary/5">
                                          <Link href="/settings?tab=users"><Settings className="h-3 w-3 mr-1" /> Manage Team</Link>
                                        </Button>
                                      </div>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="flex items-center justify-center gap-2 col-span-2 lg:col-span-1">
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    onClick={() => toggleRowNote(entry.id)}
                                    className={cn("h-9 w-9 rounded-xl border-none shadow-sm", expandedRows[entry.id] ? "bg-primary text-white" : "bg-muted/30 text-muted-foreground")}
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="hidden lg:flex h-9 w-9 text-destructive/40 hover:text-destructive hover:bg-destructive/5 rounded-xl opacity-0 group-hover/row:opacity-100 transition-all" onClick={() => removeRow(entry.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {expandedRows[entry.id] && (
                              <div className="px-4 lg:px-8 py-4 bg-muted/10 animate-in slide-in-from-top-2 duration-200">
                                <div className="space-y-2">
                                  <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Internal Note / Remark (Optional)</Label>
                                  <Textarea 
                                    placeholder="Type any extra details or remarks here..." 
                                    value={entry.notes}
                                    onChange={(e) => updateRow(entry.id, 'notes', e.target.value)}
                                    className="h-20 rounded-xl bg-white border-none shadow-inner text-xs font-bold p-4"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="p-6 border-t bg-muted/5 flex justify-center">
                        <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest border-primary/20 text-primary shadow-sm hover:bg-primary/5" onClick={addRow}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Add Row
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>

                  <div className="bg-muted/30 p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4 border-t shrink-0 z-20">
                    <div className="flex gap-6 md:gap-10 overflow-x-auto scrollbar-hide w-full sm:w-auto px-2">
                      <div className="space-y-0.5 shrink-0">
                        <p className="text-[8px] md:text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Batch Credit</p>
                        <p className="text-lg md:text-xl font-black text-green-600">{currencySymbol}{batchStats.credit.toLocaleString()}</p>
                      </div>
                      <div className="space-y-0.5 shrink-0">
                        <p className="text-[8px] md:text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Batch Debit</p>
                        <p className="text-lg md:text-xl font-black text-destructive">{currencySymbol}{batchStats.debit.toLocaleString()}</p>
                      </div>
                      <div className="space-y-0.5 shrink-0">
                        <p className="text-[8px] md:text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Net Total</p>
                        <p className={cn("text-lg md:text-xl font-black", batchStats.net >= 0 ? "text-primary" : "text-destructive")}>{currencySymbol}{batchStats.net.toLocaleString()}</p>
                      </div>
                    </div>
                    <Button className="h-12 w-full md:w-auto px-12 bg-primary font-black uppercase text-xs tracking-widest shadow-xl rounded-2xl active:scale-95 transition-all" onClick={handleSaveBatch}>
                      Post Batch Entries
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search descriptions..." className="h-11 pl-10 text-xs bg-white border-none shadow-inner rounded-xl w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-none shadow-sm bg-white rounded-2xl p-6 border-l-4 border-l-green-500 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><TrendingUp className="h-10 w-10 text-green-600" /></div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Period Cash In</p>
          <div className="text-2xl md:text-3xl font-black text-green-600">{currencySymbol}{stats.periodCredit.toLocaleString()}</div>
        </Card>
        
        <Card className="border-none shadow-sm bg-white rounded-2xl p-6 border-l-4 border-l-destructive relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><TrendingDown className="h-10 w-10 text-destructive" /></div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Period Cash Out</p>
          <div className="text-2xl md:text-3xl font-black text-destructive">{currencySymbol}{stats.periodDebit.toLocaleString()}</div>
        </Card>
        
        <Card className={cn(
          "p-6 rounded-2xl border-l-4 shadow-sm relative overflow-hidden group",
          stats.netBalance >= 0 ? "border-l-primary bg-primary/5" : "border-l-destructive bg-destructive/5"
        )}>
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Wallet className="h-10 w-10 text-primary" /></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Net Balance</p>
          <div className={cn("text-2xl md:text-3xl font-black", stats.netBalance >= 0 ? "text-primary" : "text-destructive")}>
            {currencySymbol}{stats.netBalance.toLocaleString()}
          </div>
        </Card>
      </div>

      <Card className="border-none shadow-md overflow-hidden bg-white rounded-[2rem] border">
        <div className="hidden md:block">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-muted/10">
                <TableHead className="text-[10px] font-black uppercase pl-8 h-12">Date</TableHead>
                <TableHead className="text-[10px] font-black uppercase h-12">Particulars</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-center h-12">Rate × Qty</TableHead>
                <TableHead className="text-[10px] font-black uppercase h-12">Category</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase h-12">Inflow (+)</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase pr-8 h-12">Outflow (-)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEntriesLoading ? (
                <TableRow><TableCell colSpan={6} className="h-40 text-center opacity-40"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filteredEntries.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-40 text-center opacity-40 uppercase text-[10px] font-black italic tracking-widest">No entries found for this window.</TableCell></TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <TableRow 
                      className="group hover:bg-muted/5 transition-colors cursor-pointer"
                      onClick={() => toggleReportNote(entry.id)}
                    >
                      <TableCell className="pl-8 py-5 text-[10px] font-black text-slate-400 uppercase">{new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{entry.particulars}</span>
                            {entry.notes && <Badge variant="secondary" className="h-3 text-[6px] font-black uppercase px-1">Note</Badge>}
                          </div>
                          <span className="text-[8px] font-black text-muted-foreground uppercase opacity-60">By: {entry.entryBy || 'Owner'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium text-slate-500">
                        {currencySymbol}{entry.rate?.toLocaleString()} × {entry.qty} {entry.unit}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1.5 border-primary/10 text-primary bg-primary/5">{entry.category}</Badge></TableCell>
                      <TableCell className="text-right font-black text-sm text-green-600">{entry.type === 'credit' ? `${currencySymbol}${entry.amount.toLocaleString()}` : '-'}</TableCell>
                      <TableCell className="text-right font-black text-sm text-destructive pr-8">{entry.type === 'debit' ? `${currencySymbol}${entry.amount.toLocaleString()}` : '-'}</TableCell>
                    </TableRow>
                    {expandedReportRows[entry.id] && entry.notes && (
                      <TableRow className="bg-muted/5 animate-in slide-in-from-top-1">
                        <TableCell colSpan={6} className="pl-12 py-4">
                          <div className="flex items-start gap-3">
                            <CornerDownRight className="h-4 w-4 text-primary/40 mt-0.5" />
                            <div className="p-4 bg-white rounded-2xl border shadow-sm max-w-2xl">
                              <p className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Entry Remark</p>
                              <p className="text-xs font-bold text-slate-600 leading-relaxed italic">"{entry.notes}"</p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden divide-y divide-border">
          {isEntriesLoading ? (
            <div className="p-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-20 text-center opacity-30 text-[10px] font-black uppercase italic tracking-widest">No matching records</div>
          ) : (
            filteredEntries.map((entry) => (
              <div 
                key={entry.id} 
                className="p-5 space-y-4 hover:bg-muted/5 transition-colors cursor-pointer"
                onClick={() => toggleReportNote(entry.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
                      entry.type === 'credit' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                    )}>
                      {entry.type === 'credit' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate">{entry.particulars}</p>
                        {entry.notes && <Badge variant="secondary" className="h-3 text-[6px] font-black px-1 uppercase">Note</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-black text-muted-foreground uppercase">{new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                        <Separator orientation="vertical" className="h-2" />
                        <span className="text-[9px] font-black text-muted-foreground uppercase">{entry.category}</span>
                      </div>
                    </div>
                  </div>
                  <p className={cn("text-lg font-black", entry.type === 'credit' ? "text-green-600" : "text-destructive")}>
                    {entry.type === 'credit' ? '+' : '-'} {currencySymbol}{entry.amount.toLocaleString()}
                  </p>
                </div>
                
                {expandedReportRows[entry.id] && entry.notes && (
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 animate-in zoom-in-95">
                    <p className="text-[8px] font-black uppercase text-primary mb-1 tracking-widest">Remark</p>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed">"{entry.notes}"</p>
                  </div>
                )}

                <div className="flex items-center justify-between bg-muted/20 p-2.5 rounded-xl border border-transparent">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Rate: {currencySymbol}{entry.rate} × {entry.qty} {entry.unit}</span>
                  <span className="text-[9px] font-black text-slate-400 uppercase">By: {entry.entryBy || 'Owner'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
