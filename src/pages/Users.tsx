import { useEffect, useState } from "react";
import { Shield, User as UserIcon } from "lucide-react";
import { ref, onValue, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface ProfileRow {
  id: string;
  email: string;
  displayName: string | null;
  createdAt?: number;
  role: "admin" | "user";
}

export default function Users() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<ProfileRow[]>([]);

  useEffect(() => {
    const profilesRef = ref(db, "profiles");
    const rolesRef = ref(db, "roles");
    let profiles: any = {};
    let roles: any = {};
    const merge = () => {
      const list: ProfileRow[] = Object.entries(profiles).map(([id, p]: any) => ({
        id,
        email: p.email,
        displayName: p.displayName ?? null,
        createdAt: p.createdAt,
        role: roles[id] === "admin" ? "admin" : "user",
      }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRows(list);
    };
    const u1 = onValue(profilesRef, (s) => { profiles = s.val() || {}; merge(); });
    const u2 = onValue(rolesRef, (s) => { roles = s.val() || {}; merge(); });
    return () => { u1(); u2(); };
  }, []);

  const setRole = async (userId: string, role: "admin" | "user") => {
    try {
      await set(ref(db, `roles/${userId}`), role);
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err?.message || "Update failed");
    }
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
                const isAdmin = r.role === "admin";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.displayName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={isAdmin ? "default" : "secondary"} className="gap-1">
                        {isAdmin ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                        {isAdmin ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={r.id === me?.uid}
                        onClick={() => setRole(r.id, isAdmin ? "user" : "admin")}
                      >
                        Make {isAdmin ? "user" : "admin"}
                      </Button>
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
