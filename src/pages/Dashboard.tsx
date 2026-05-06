import { useEffect, useMemo, useState } from "react";
import { Package, AlertTriangle, Boxes } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { unitShort, isLowStock, lowStockThreshold } from "@/lib/money";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Item {
  id: string; name: string; category: string;
  quantity: number; quantityAdded?: number; quantityUsed?: number;
  minQuantity: number; unitType?: string;
}

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    return onValue(ref(db, "items"), (snap) => {
      const val = snap.val() || {};
      setItems(Object.entries(val).map(([id, v]: any) => ({ id, ...v })));
    });
  }, []);

  const totalItems = items.length;
  const lowStock = useMemo(() => items.filter(isLowStock), [items]);

  const byUnit = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => {
      const u = unitShort(i.unitType) || "—";
      m[u] = (m[u] || 0) + Number(i.quantity || 0);
    });
    return m;
  }, [items]);

  const byCategoryQty = useMemo(() => Object.values(
    items.reduce<Record<string, { category: string; quantity: number }>>((acc, i) => {
      acc[i.category] = acc[i.category] || { category: i.category, quantity: 0 };
      acc[i.category].quantity += Number(i.quantity);
      return acc;
    }, {})
  ), [items]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(a.quantity) - Number(b.quantity)),
    [items]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Stock levels at a glance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={<Package className="h-4 w-4" />} label="Total items" value={totalItems} />
        <StatCard
          icon={<Boxes className="h-4 w-4" />}
          label="Total quantity by unit"
          value={
            Object.keys(byUnit).length
              ? <span className="text-base font-medium">{Object.entries(byUnit).map(([u, q]) => `${q} ${u}`).join("  •  ")}</span>
              : "—"
          }
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Low stock items (≤45%)"
          value={lowStock.length}
          accent={lowStock.length > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Stock quantity by category</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategoryQty}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Items overview</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No items yet.</TableCell></TableRow>
                )}
                {sortedItems.map((i) => {
                  const low = isLowStock(i);
                  return (
                    <TableRow key={i.id} className={low ? "bg-warning/5" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {i.name}
                          {low && (
                            <Badge variant="outline" className="border-warning/50 text-warning gap-1">
                              <AlertTriangle className="h-3 w-3" /> Low
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(i.quantity)}</TableCell>
                      <TableCell className="text-sm">{unitShort(i.unitType) || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> Low stock alerts (≤ 45% of added)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {lowStock.map((i) => (
              <Badge key={i.id} variant="outline" className="border-warning/40 text-foreground">
                {i.name} — {Number(i.quantity)} {unitShort(i.unitType)} left
                <span className="ml-1 text-muted-foreground">(threshold {Math.round(lowStockThreshold(i))})</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}
