import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileText } from "lucide-react";
import { generateInventoryPDF } from "@/lib/pdfReport";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { formatRWF, unitShort } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface MoveRow {
  id: string;
  type: "in" | "out";
  quantity: number;
  note: string | null;
  createdAt: number;
  itemId: string;
  itemName?: string;
  unitType?: string;
  valueRwf?: number;
  unitPriceRwf?: number;
  userEmail?: string | null;
  userName?: string | null;
}

interface Item {
  id: string; name: string; category: string;
  quantity: number; quantityAdded?: number; quantityUsed?: number;
  unitType?: string; unitPriceRwf?: number; unitPrice?: number;
}

export default function Reports() {
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, { id: string; name: string }>>({});

  useEffect(() => {
    const u1 = onValue(ref(db, "movements"), (snap) => {
      const val = snap.val() || {};
      const list: MoveRow[] = Object.entries(val).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMoves(list);
    });
    const u2 = onValue(ref(db, "items"), (snap) => {
      const val = snap.val() || {};
      setItems(Object.entries(val).map(([id, v]: any) => ({ id, ...v })));
    });
    const u3 = onValue(ref(db, "suppliers"), (snap) => {
      const val = snap.val() || {};
      const map: Record<string, { id: string; name: string }> = {};
      Object.entries(val).forEach(([id, v]: any) => { map[id] = { id, name: v.name }; });
      setSuppliers(map);
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const itemMap = useMemo(() => {
    const m: Record<string, Item> = {};
    items.forEach((i) => { m[i.id] = i; });
    return m;
  }, [items]);

  // Per-item analytics (RWF)
  const perItem = useMemo(() => {
    return items.map((i) => {
      const price = Number(i.unitPriceRwf ?? i.unitPrice ?? 0);
      const itemMoves = moves.filter((m) => m.itemId === i.id);
      const addedQty = itemMoves.filter((m) => m.type === "in").reduce((s, m) => s + Number(m.quantity), 0);
      const usedQty = itemMoves.filter((m) => m.type === "out").reduce((s, m) => s + Number(m.quantity), 0);
      const totalAdded = Math.max(Number(i.quantityAdded ?? Math.max(addedQty, Number(i.quantity) + usedQty)), addedQty);
      const totalUsed = Number(i.quantityUsed ?? usedQty);
      return {
        id: i.id,
        name: i.name,
        category: i.category,
        unit: unitShort(i.unitType),
        remainingQty: Number(i.quantity),
        addedQty: totalAdded,
        usedQty: totalUsed,
        purchaseCost: totalAdded * price,
        usageCost: totalUsed * price,
        remainingValue: Number(i.quantity) * price,
        unitPriceRwf: price,
      };
    });
  }, [items, moves]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { category: string; purchase: number; usage: number; remaining: number }>();
    perItem.forEach((r) => {
      const e = map.get(r.category) || { category: r.category, purchase: 0, usage: 0, remaining: 0 };
      e.purchase += r.purchaseCost;
      e.usage += r.usageCost;
      e.remaining += r.remainingValue;
      map.set(r.category, e);
    });
    return Array.from(map.values()).sort((a, b) => b.usage - a.usage);
  }, [perItem]);

  const mostConsumed = useMemo(() => {
    return [...perItem].filter((r) => r.usedQty > 0).sort((a, b) => b.usageCost - a.usageCost).slice(0, 10);
  }, [perItem]);

  const exportItemsCSV = () => {
    const csv = Papa.unparse(perItem.map((r) => ({
      name: r.name, category: r.category, unit: r.unit,
      remaining_qty: r.remainingQty, added_qty: r.addedQty, used_qty: r.usedQty,
      unit_price_rwf: r.unitPriceRwf,
      purchase_cost_rwf: Math.round(r.purchaseCost),
      usage_cost_rwf: Math.round(r.usageCost),
      remaining_value_rwf: Math.round(r.remainingValue),
    })));
    download(csv, "items_cost_analytics.csv");
  };

  const exportMovesCSV = () => {
    const csv = Papa.unparse(moves.map((m) => {
      const it = itemMap[m.itemId];
      const price = Number(m.unitPriceRwf ?? it?.unitPriceRwf ?? it?.unitPrice ?? 0);
      const value = typeof m.valueRwf === "number" ? m.valueRwf : Number(m.quantity) * price;
      return {
        date: m.createdAt ? new Date(m.createdAt).toISOString() : "",
        item: m.itemName || it?.name || "",
        type: m.type,
        unit: unitShort(m.unitType || it?.unitType),
        quantity: m.quantity,
        unit_price_rwf: price,
        value_rwf: Math.round(value),
        user: m.userName || m.userEmail || "",
        note: m.note || "",
      };
    }));
    download(csv, "stock_movements.csv");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Cost analytics and movement history (RWF).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => generateInventoryPDF({ items: items as any, suppliers })}>
            <FileText className="mr-1 h-4 w-4" /> Download PDF report
          </Button>
          <Button variant="outline" onClick={exportItemsCSV}><Download className="mr-1 h-4 w-4" /> Items CSV</Button>
          <Button variant="outline" onClick={exportMovesCSV}><Download className="mr-1 h-4 w-4" /> Movements CSV</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Cost breakdown per item</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Added</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Purchase cost</TableHead>
                <TableHead className="text-right">Usage cost</TableHead>
                <TableHead className="text-right">Remaining value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perItem.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No items yet.</TableCell></TableRow>
              )}
              {perItem.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{r.category}</Badge></TableCell>
                  <TableCell className="text-sm">{r.unit || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.addedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.usedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.remainingQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRWF(r.purchaseCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRWF(r.usageCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRWF(r.remainingValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cost by category</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCategory.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No data.</TableCell></TableRow>
                )}
                {byCategory.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell><Badge variant="secondary">{c.category}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(c.purchase)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(c.usage)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(c.remaining)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Most consumed items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Used qty</TableHead>
                  <TableHead className="text-right">Usage cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostConsumed.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No usage recorded yet.</TableCell></TableRow>
                )}
                {mostConsumed.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.usedQty} {r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(r.usageCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent stock movements</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No movements yet.</TableCell></TableRow>
              )}
              {moves.slice(0, 200).map((m) => {
                const it = itemMap[m.itemId];
                const price = Number(m.unitPriceRwf ?? it?.unitPriceRwf ?? it?.unitPrice ?? 0);
                const value = typeof m.valueRwf === "number" ? m.valueRwf : Number(m.quantity) * price;
                const u = unitShort(m.unitType || it?.unitType);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm text-muted-foreground">{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="font-medium">{m.itemName || it?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === "in" ? "default" : "secondary"} className={m.type === "in" ? "bg-success text-success-foreground" : "bg-destructive/10 text-destructive border-destructive/20"}>
                        {m.type === "in" ? "Stock in" : "Used"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(m.quantity)} {u}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRWF(value)}</TableCell>
                    <TableCell className="text-sm">{m.userName || m.userEmail || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.note || ""}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function download(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
