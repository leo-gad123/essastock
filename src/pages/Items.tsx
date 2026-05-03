import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { ref, onValue, push, set, remove, update, runTransaction, serverTimestamp } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
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
  quantity: number;
  unitPrice: number;
  minQuantity: number;
  createdAt?: number;
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  minQuantity: z.number().min(0),
});

export default function Items() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<Item | null>(null);
  const [moveType, setMoveType] = useState<"in" | "out">("out");

  useEffect(() => {
    const r = ref(db, "items");
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      const list: Item[] = Object.entries(val).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setItems(list);
    });
    return () => unsub();
  }, []);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);

  const filtered = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || i.category === filterCat;
    return matchSearch && matchCat;
  });

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      category: String(fd.get("category") || "General"),
      quantity: Number(fd.get("quantity") || 0),
      unitPrice: Number(fd.get("unit_price") || 0),
      minQuantity: Number(fd.get("min_quantity") || 5),
    };
    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    try {
      if (editing) {
        await update(ref(db, `items/${editing.id}`), { ...parsed.data, updatedAt: serverTimestamp() });
        toast.success("Item updated");
      } else {
        const newRef = push(ref(db, "items"));
        await set(newRef, { ...parsed.data, createdAt: serverTimestamp() });
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
    if (qty <= 0) return toast.error("Quantity must be positive");

    try {
      const result = await runTransaction(ref(db, `items/${moveItem.id}/quantity`), (current) => {
        const cur = Number(current || 0);
        if (moveType === "out") {
          if (cur < qty) return; // abort
          return cur - qty;
        }
        return cur + qty;
      });
      if (!result.committed) {
        return toast.error("Insufficient stock");
      }
      const moveRef = push(ref(db, "movements"));
      await set(moveRef, {
        itemId: moveItem.id,
        itemName: moveItem.name,
        type: moveType,
        quantity: qty,
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
          <h1 className="text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">Manage stock and record usage.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Add item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-3">
                <div className="space-y-2"><Label>Name</Label><Input name="name" defaultValue={editing?.name} required /></div>
                <div className="space-y-2"><Label>Category</Label><Input name="category" defaultValue={editing?.category || "General"} required /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Quantity</Label><Input name="quantity" type="number" step="0.01" min="0" defaultValue={editing?.quantity ?? 0} /></div>
                  <div className="space-y-2"><Label>Unit price</Label><Input name="unit_price" type="number" step="0.01" min="0" defaultValue={editing?.unitPrice ?? 0} /></div>
                  <div className="space-y-2"><Label>Min qty</Label><Input name="min_quantity" type="number" step="0.01" min="0" defaultValue={editing?.minQuantity ?? 5} /></div>
                </div>
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
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No items yet.</TableCell></TableRow>
              )}
              {filtered.map((i) => {
                const low = Number(i.quantity) <= Number(i.minQuantity);
                return (
                  <TableRow key={i.id} className={low ? "bg-warning/5" : ""}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {i.name}
                        {low && <Badge variant="outline" className="border-warning/50 text-warning gap-1"><AlertTriangle className="h-3 w-3" />Low</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{i.category}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{Number(i.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(i.unitPrice).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">${(Number(i.quantity) * Number(i.unitPrice)).toFixed(2)}</TableCell>
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
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}>
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
              <Label>Quantity</Label>
              <Input name="quantity" type="number" step="0.01" min="0.01" required autoFocus />
              {moveType === "out" && moveItem && (
                <p className="text-xs text-muted-foreground">Available: {Number(moveItem.quantity)}</p>
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
