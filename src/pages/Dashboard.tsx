import { useEffect, useState } from "react";
import { Package, DollarSign, AlertTriangle, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Item { id: string; name: string; category: string; quantity: number; unit_price: number; min_quantity: number; }
interface Movement { id: string; type: "in" | "out"; quantity: number; created_at: string; item_id: string; }

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: m }] = await Promise.all([
        supabase.from("items").select("*"),
        supabase.from("stock_movements").select("*").order("created_at", { ascending: true }),
      ]);
      setItems(i || []);
      setMoves((m || []) as Movement[]);
    })();
  }, []);

  const totalItems = items.length;
  const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.min_quantity));
  const totalUsed = moves.filter((m) => m.type === "out").reduce((s, m) => s + Number(m.quantity), 0);

  const byCategory = Object.values(
    items.reduce<Record<string, { category: string; quantity: number }>>((acc, i) => {
      acc[i.category] = acc[i.category] || { category: i.category, quantity: 0 };
      acc[i.category].quantity += Number(i.quantity);
      return acc;
    }, {})
  );

  const usageByDay = (() => {
    const map = new Map<string, { date: string; in: number; out: number }>();
    moves.forEach((m) => {
      const d = new Date(m.created_at).toISOString().slice(0, 10);
      const e = map.get(d) || { date: d, in: 0, out: 0 };
      e[m.type] += Number(m.quantity);
      map.set(d, e);
    });
    return Array.from(map.values()).slice(-14);
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your household inventory.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Package className="h-4 w-4" />} label="Total items" value={totalItems} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total stock value" value={`$${totalValue.toFixed(2)}`} />
        <StatCard icon={<TrendingDown className="h-4 w-4" />} label="Total used" value={totalUsed} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Low stock" value={lowStock.length} accent={lowStock.length > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Stock by category</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
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
          <CardHeader><CardTitle>Usage trend (last 14 days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={usageByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="in" stroke="hsl(var(--success))" strokeWidth={2} />
                <Line type="monotone" dataKey="out" stroke="hsl(var(--destructive))" strokeWidth={2} />
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
                {i.name} — {Number(i.quantity)} left
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
