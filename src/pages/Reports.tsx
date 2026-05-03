import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface MoveRow {
  id: string; type: "in" | "out"; quantity: number; note: string | null;
  created_at: string; item_id: string; user_id: string | null;
  items?: { name: string } | null;
  profiles?: { display_name: string | null; email: string } | null;
}

export default function Reports() {
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: i }, { data: p }] = await Promise.all([
        supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("items").select("*"),
        supabase.from("profiles").select("id, display_name, email"),
      ]);
      const itemMap = new Map((i || []).map((x: any) => [x.id, x]));
      const profMap = new Map((p || []).map((x: any) => [x.id, x]));
      setItems(i || []);
      setMoves(((m || []) as any[]).map((r) => ({
        ...r,
        items: itemMap.get(r.item_id) || null,
        profiles: r.user_id ? profMap.get(r.user_id) || null : null,
      })));
    })();
  }, []);

  const exportItemsCSV = () => {
    const csv = Papa.unparse(items.map((i: any) => ({
      name: i.name, category: i.category, quantity: i.quantity,
      unit_price: i.unit_price, min_quantity: i.min_quantity,
      value: Number(i.quantity) * Number(i.unit_price),
    })));
    download(csv, "items.csv");
  };

  const exportMovesCSV = () => {
    const csv = Papa.unparse(moves.map((m) => ({
      date: new Date(m.created_at).toISOString(),
      item: m.items?.name || "",
      type: m.type,
      quantity: m.quantity,
      user: m.profiles?.display_name || m.profiles?.email || "",
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
                  <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{m.items?.name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.type === "in" ? "default" : "secondary"} className={m.type === "in" ? "bg-success text-success-foreground" : "bg-destructive/10 text-destructive border-destructive/20"}>
                      {m.type === "in" ? "Stock in" : "Used"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(m.quantity)}</TableCell>
                  <TableCell className="text-sm">{m.profiles?.display_name || m.profiles?.email || "—"}</TableCell>
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
