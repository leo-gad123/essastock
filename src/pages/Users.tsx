import { useEffect, useState } from "react";
import { Trash2, Shield, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface ProfileRow {
  id: string; email: string; display_name: string | null; created_at: string;
  roles: ("admin" | "user")[];
}

export default function Users() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<ProfileRow[]>([]);

  const load = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const byUser: Record<string, ("admin" | "user")[]> = {};
    (roles || []).forEach((r: any) => {
      byUser[r.user_id] = byUser[r.user_id] || [];
      byUser[r.user_id].push(r.role);
    });
    setRows(((profiles || []) as any[]).map((p) => ({ ...p, roles: byUser[p.id] || [] })));
  };

  useEffect(() => { load(); }, []);

  const setRole = async (userId: string, role: "admin" | "user") => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    load();
  };

  const removeUser = async (userId: string) => {
    if (userId === me?.id) return toast.error("You can't delete yourself");
    if (!confirm("Remove this user's profile and roles? Their auth account will remain but they'll lose access.")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) return toast.error(error.message);
    await supabase.from("user_roles").delete().eq("user_id", userId);
    toast.success("User removed");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Admin-only: manage roles and access.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isAdmin = r.roles.includes("admin");
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.display_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={isAdmin ? "default" : "secondary"} className="gap-1">
                        {isAdmin ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                        {isAdmin ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRole(r.id, isAdmin ? "user" : "admin")}>
                          Make {isAdmin ? "user" : "admin"}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => removeUser(r.id)} disabled={r.id === me?.id}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
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
