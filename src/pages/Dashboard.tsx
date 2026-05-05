import { useEffect, useMemo, useState } from "react";
import { Package, Wallet, AlertTriangle, TrendingDown, ShoppingCart, Boxes } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { formatRWF, unitShort } from "@/lib/money";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Item {
  id: string; name: string; category: string;
  quantity: number; quantityAdded?: number; quantityUsed?: number;
  unitPriceRwf?: number; unitPrice?: number;
  minQuantity: number; unitType?: string;
}
interface Movement {
  id: string; type: "in" | "out"; quantity: number; createdAt: number;
  itemId: string; valueRwf?: number; unitPriceRwf?: number;
}

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);

  useEffect(() => {
    const u1 = onValue(ref(db, "items"), (snap) => {
      const val = snap.val() || {};
      setItems(Object.entries(val).map(([id, v]: any) => ({ id, ...v })));
    });
    const u2 = onValue(ref(db, "movements"), (snap) => {
      const val = snap.val() || {};
      const list: Movement[] = Object.entries(val).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMoves(list);
    });
    return () => { u1(); u2(); };
  }, []);

  const itemMap = useMemo(() => {
    const m: Record<string, Item> = {};
    items.forEach((i) => { m[i.id] = i; });
    return m;
  }, [items]);

  const totalItems = items.length;
  const remainingValue = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.unitPriceRwf ?? i.unitPrice ?? 0), 0
  );
  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.minQuantity));

  // Cost analytics: prefer movement.valueRwf; fall back to item price × movement qty
  const moveValue = (m: Movement) => {
    if (typeof m.valueRwf === "number") return Number(m.valueRwf);
    const it = itemMap[m.itemId];
    const p = Number(it?.unitPriceRwf ?? it?.unitPrice ?? m.unitPriceRwf ?? 0);
    return Number(m.quantity) * p;
  };

  const purchaseCost = moves.filter((m) => m.type === "in").reduce((s, m) => s + moveValue(m), 0)
    // include initial stock loaded as quantityAdded if no "in" movement exists
    + items.reduce((s, i) => {
        const added = Number(i.quantityAdded ?? 0);
        const fromMoves = moves.filter((m) => m.itemId === i.id && m.type === "in")
          .reduce((a, m) => a + Number(m.quantity), 0);
        const initial = Math.max(added - fromMoves, 0);
        return s + initial * Number(i.unitPriceRwf ?? i.unitPrice ?? 0);
      }, 0);

  const usageCost = moves.filter((m) => m.type === "out").reduce((s, m) => s + moveValue(m), 0);

  const byCategoryQty = Object.values(
    items.reduce<Record<string, { category: string; quantity: number }>>((acc, i) => {
      acc[i.category] = acc[i.category] || { category: i.category, quantity: 0 };
      acc[i.category].quantity += Number(i.quantity);
      return acc;
    }, {})
  );

  const valueByDay = (() => {
    const map = new Map<string, { date: string; purchase: number; usage: number }>();
    moves.forEach((m) => {
      if (!m.createdAt) return;
      const d = new Date(m.createdAt).toISOString().slice(0, 10);
      const e = map.get(d) || { date: d, purchase: 0, usage: 0 };
      const v = moveValue(m);
      if (m.type === "in") e.purchase += v; else e.usage += v;
      map.set(d, e);
    });
    return Array.from(map.values()).slice(-14);
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Inventory overview — all values in RWF.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={<Package className="h-4 w-4" />} label="Total items" value={totalItems} />
        <StatCard icon={<Boxes className="h-4 w-4" />} label="Remaining stock value" value={formatRWF(remainingValue)} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Low stock" value={lowStock.length} accent={lowStock.length > 0} />
        <StatCard icon={<ShoppingCart className="h-4 w-4" />} label="Total purchase cost" value={formatRWF(purchaseCost)} />
        <StatCard icon={<TrendingDown className="h-4 w-4" />} label="Total consumed value" value={formatRWF(usageCost)} />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Net stock on hand" value={formatRWF(remainingValue)} />
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
          <CardHeader><CardTitle>Purchase vs usage cost (last 14 days, RWF)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={valueByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => formatRWF(v)}
                />
                <Legend />
                <Line type="monotone" dataKey="purchase" stroke="hsl(var(--success))" strokeWidth={2} />
                <Line type="monotone" dataKey="usage" stroke="hsl(var(--destructive))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> Low stock alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {lowStock.map((i) => (
              <Badge key={i.id} variant="outline" className="border-warning/40 text-foreground">
                {i.name} — {Number(i.quantity)} {unitShort(i.unitType)} left
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
