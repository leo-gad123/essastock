import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { ref, onValue, push, set, remove, update, runTransaction, serverTimestamp } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatRWF, toRWF, UNIT_OPTIONS, unitShort, UnitType, isLowStock } from "@/lib/money";
import CategorySelect from "@/components/CategorySelect";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface Item {
  id: string;
  name: string;
  category: string;
  quantity: number;          // current stock = quantityAdded - quantityUsed
  quantityAdded?: number;
  quantityUsed?: number;
  unitType?: UnitType;
  unitPriceRwf?: number;
  unitPrice?: number;        // legacy, treated as RWF
  minQuantity: number;
  supplierId?: string | null;
  createdAt?: number;
}

interface Supplier {
  id: string; name: string; phone?: string; email?: string; address?: string;
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  unitType: z.enum(["kg", "liters", "pieces"]),
  quantity: z.number().min(0),
  unitPriceRwf: z.number().min(0),
  minQuantity: z.number().min(0),
  supplierId: z.string().nullable().optional(),
});

export default function Items() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const [supplierField, setSupplierField] = useState<string>("none");
  const [unitTypeField, setUnitTypeField] = useState<UnitType>("pieces");
  const [currencyField, setCurrencyField] = useState<"RWF" | "USD">("RWF");
  const [categoryField, setCategoryField] = useState<string>("General");
  const [moveItem, setMoveItem] = useState<Item | null>(null);
  const [moveType, setMoveType] = useState<"in" | "out">("out");

  useEffect(() => {
    return onValue(ref(db, "items"), (snap) => {
      const val = snap.val() || {};
      const list: Item[] = Object.entries(val).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setItems(list);
    });
  }, []);

  useEffect(() => {
    return onValue(ref(db, "suppliers"), (snap) => {
      const val = snap.val() || {};
      const list: Supplier[] = Object.entries(val).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setSuppliers(list);
    });
  }, []);

  const supplierMap = useMemo(() => {
    const m: Record<string, Supplier> = {};
    suppliers.forEach((s) => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);

  const filtered = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || i.category === filterCat;
    const matchSup = filterSupplier === "all" || (i.supplierId || "none") === filterSupplier;
    return matchSearch && matchCat && matchSup;
  });

  const openEdit = (item: Item | null) => {
    setEditing(item);
    setSupplierField(item?.supplierId || "none");
    setUnitTypeField((item?.unitType as UnitType) || "pieces");
    setCurrencyField("RWF");
    setCategoryField(item?.category || "General");
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rawPrice = Number(fd.get("unit_price") || 0);
    const priceRwf = toRWF(rawPrice, currencyField);
    const quantity = Number(fd.get("quantity") || 0);

    const payload = {
      name: String(fd.get("name") || ""),
      category: categoryField || "General",
      unitType: unitTypeField,
      quantity,
      unitPriceRwf: priceRwf,
      minQuantity: Number(fd.get("min_quantity") || 5),
      supplierId: supplierField === "none" ? null : supplierField,
    };
    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    try {
      if (editing) {
        await update(ref(db, `items/${editing.id}`), {
          ...parsed.data,
          updatedAt: serverTimestamp(),
        });
        toast.success("Item updated");
      } else {
        const newRef = push(ref(db, "items"));
        await set(newRef, {
          ...parsed.data,
          quantityAdded: quantity, // initial stock counts as added
          quantityUsed: 0,
          createdAt: serverTimestamp(),
        });
        toast.success("Item added");
      }
      setOpen(false);
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      await remove(ref(db, `items/${id}`));
      toast.success("Item deleted");
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  const handleMove = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!moveItem) return;
    const fd = new FormData(e.currentTarget);
    const qty = Number(fd.get("quantity") || 0);
    const note = String(fd.get("note") || "");
    if (!(qty > 0)) return toast.error("Quantity must be a positive number");

    try {
      const result = await runTransaction(ref(db, `items/${moveItem.id}/quantity`), (current) => {
        const cur = Number(current || 0);
        if (moveType === "out") {
          if (cur < qty) return; // abort
          return cur - qty;
        }
        return cur + qty;
      });
      if (!result.committed) return toast.error("Insufficient stock");

      // Update aggregate counters on the item
      const counterField = moveType === "in" ? "quantityAdded" : "quantityUsed";
      await runTransaction(ref(db, `items/${moveItem.id}/${counterField}`), (current) => {
        return Number(current || 0) + qty;
      });

      const unitPriceRwf = Number(moveItem.unitPriceRwf ?? moveItem.unitPrice ?? 0);
      const moveRef = push(ref(db, "movements"));
      await set(moveRef, {
        itemId: moveItem.id,
        itemName: moveItem.name,
        unitType: moveItem.unitType || "pieces",
        type: moveType,
        quantity: qty,
        unitPriceRwf,
        valueRwf: qty * unitPriceRwf,
        note,
        userId: auth.currentUser?.uid || null,
        userEmail: auth.currentUser?.email || null,
        userName: auth.currentUser?.displayName || null,
        createdAt: serverTimestamp(),
      });
      toast.success(moveType === "in" ? "Stock added" : "Stock recorded as used");
      setMoveItem(null);
    } catch (err: any) {
      toast.error(err?.message || "Movement failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">Manage stock and record usage. All prices in RWF.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setSupplierField("none"); } }}>
            <DialogTrigger asChild>
              <Button onClick={() => openEdit(null)}><Plus className="mr-1 h-4 w-4" /> Add item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-3">
                <div className="space-y-2"><Label>Name</Label><Input name="name" defaultValue={editing?.name} required /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <CategorySelect value={categoryField} onChange={setCategoryField} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit type</Label>
                    <Select value={unitTypeField} onValueChange={(v) => setUnitTypeField(v as UnitType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNIT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={supplierField} onValueChange={setSupplierField}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-muted-foreground">No suppliers yet. Add one in the Suppliers page.</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Quantity ({unitShort(unitTypeField)})</Label>
                    <Input name="quantity" type="number" step="0.01" min="0" defaultValue={editing?.quantity ?? 0} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit price</Label>
                    <Input
                      name="unit_price" type="number" step="0.01" min="0"
                      defaultValue={editing?.unitPriceRwf ?? editing?.unitPrice ?? 0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={currencyField} onValueChange={(v) => setCurrencyField(v as "RWF" | "USD")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RWF">RWF</SelectItem>
                        <SelectItem value="USD">USD → RWF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Min qty ({unitShort(unitTypeField)})</Label>
                  <Input name="min_quantity" type="number" step="0.01" min="0" defaultValue={editing?.minQuantity ?? 5} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Stored as RWF only. USD entries are converted automatically.
                </p>
                <DialogFooter><Button type="submit">{editing ? "Save" : "Add"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                <SelectItem value="none">No supplier</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Added</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No items yet.</TableCell></TableRow>
              )}
              {filtered.map((i) => {
                const low = isLowStock(i);
                const sup = i.supplierId ? supplierMap[i.supplierId] : null;
                const u = unitShort(i.unitType);
                return (
                  <TableRow key={i.id} className={low ? "bg-warning/5" : ""}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {i.name}
                        {low && <Badge variant="outline" className="border-warning/50 text-warning gap-1"><AlertTriangle className="h-3 w-3" />Low</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{i.category}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {sup ? <span title={[sup.phone, sup.email, sup.address].filter(Boolean).join(" • ")}>{sup.name}</span>
                           : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{u || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(i.quantityAdded ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(i.quantityUsed ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{Number(i.quantity)} {u}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setMoveItem(i); setMoveType("in"); }} title="Add stock">
                          <ArrowDownToLine className="h-4 w-4 text-success" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setMoveItem(i); setMoveType("out"); }} title="Record usage">
                          <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(i)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(i.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!moveItem} onOpenChange={(o) => { if (!o) setMoveItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moveType === "in" ? "Add stock" : "Record usage"} — {moveItem?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMove} className="space-y-3">
            <div className="space-y-2">
              <Label>Quantity ({unitShort(moveItem?.unitType)})</Label>
              <Input name="quantity" type="number" step="0.01" min="0.01" required autoFocus />
              {moveType === "out" && moveItem && (
                <p className="text-xs text-muted-foreground">Available: {Number(moveItem.quantity)} {unitShort(moveItem.unitType)}</p>
              )}
            </div>
            <div className="space-y-2"><Label>Note (optional)</Label><Input name="note" maxLength={200} /></div>
            <DialogFooter><Button type="submit">{moveType === "in" ? "Add" : "Record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
