import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Download } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
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
  userEmail?: string | null;
  userName?: string | null;
}

interface Item { id: string; name: string; category: string; quantity: number; unitPrice: number; minQuantity: number; }

export default function Reports() {
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const u1 = onValue(ref(db, "movements"), (snap) => {
      const val = snap.val() || {};
      const list: MoveRow[] = Object.entries(val).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMoves(list.slice(0, 200));
    });
    const u2 = onValue(ref(db, "items"), (snap) => {
      const val = snap.val() || {};
      setItems(Object.entries(val).map(([id, v]: any) => ({ id, ...v })));
    });
    return () => { u1(); u2(); };
  }, []);

  const exportItemsCSV = () => {
    const csv = Papa.unparse(items.map((i) => ({
      name: i.name, category: i.category, quantity: i.quantity,
      unit_price: i.unitPrice, min_quantity: i.minQuantity,
      value: Number(i.quantity) * Number(i.unitPrice),
    })));
    download(csv, "items.csv");
  };

  const exportMovesCSV = () => {
    const csv = Papa.unparse(moves.map((m) => ({
      date: m.createdAt ? new Date(m.createdAt).toISOString() : "",
      item: m.itemName || "",
      type: m.type,
      quantity: m.quantity,
      user: m.userName || m.userEmail || "",
      note: m.note || "",
    })));
    download(csv, "stock_movements.csv");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Activity log and CSV export.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportItemsCSV}><Download className="mr-1 h-4 w-4" /> Items CSV</Button>
          <Button variant="outline" onClick={exportMovesCSV}><Download className="mr-1 h-4 w-4" /> Movements CSV</Button>
        </div>
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
                <TableHead>By</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No movements yet.</TableCell></TableRow>
              )}
              {moves.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm text-muted-foreground">{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</TableCell>
                  <TableCell className="font-medium">{m.itemName || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.type === "in" ? "default" : "secondary"} className={m.type === "in" ? "bg-success text-success-foreground" : "bg-destructive/10 text-destructive border-destructive/20"}>
                      {m.type === "in" ? "Stock in" : "Used"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(m.quantity)}</TableCell>
                  <TableCell className="text-sm">{m.userName || m.userEmail || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.note || ""}</TableCell>
                </TableRow>
              ))}
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
