import { useEffect, useState } from "react";
import { Shield, User as UserIcon, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { ref, onValue, set, remove, serverTimestamp, get } from "firebase/database";
import { createUserWithEmailAndPassword, signOut as fbSignOut, updateProfile } from "firebase/auth";
import { db, secondaryAuth } from "@/lib/firebase";
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
import { useAuth } from "@/hooks/useAuth";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  createdAt?: number;
  role: "admin" | "user";
}

const createSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
  displayName: z.string().trim().max(60).optional(),
  role: z.enum(["admin", "user"]),
});

export default function Users() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setRoleField] = useState<"admin" | "user">("user");

  useEffect(() => {
    const profilesRef = ref(db, "profiles");
    const rolesRef = ref(db, "roles");
    let profiles: any = {};
    let roles: any = {};
    const merge = () => {
      const ids = new Set([...Object.keys(profiles), ...Object.keys(roles)]);
      const list: UserRow[] = Array.from(ids).map((id) => {
        const p = profiles[id] || {};
        return {
          id,
          email: p.email || "—",
          displayName: p.displayName ?? null,
          createdAt: p.createdAt,
          role: roles[id] === "admin" ? "admin" : "user",
        };
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRows(list);
    };
    const u1 = onValue(profilesRef, (s) => { profiles = s.val() || {}; merge(); });
    const u2 = onValue(rolesRef, (s) => { roles = s.val() || {}; merge(); });
    return () => { u1(); u2(); };
  }, []);

  const setUserRole = async (userId: string, r: "admin" | "user") => {
    try {
      await set(ref(db, `roles/${userId}`), r);
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err?.message || "Update failed");
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
      displayName: String(fd.get("displayName") || "").trim() || undefined,
      role,
    };
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setBusy(true);
    try {
      // Use secondary auth instance so the admin's session is preserved
      const cred = await createUserWithEmailAndPassword(secondaryAuth, parsed.data.email, parsed.data.password);
      if (parsed.data.displayName) {
        try { await updateProfile(cred.user, { displayName: parsed.data.displayName }); } catch {}
      }

      await set(ref(db, `profiles/${cred.user.uid}`), {
        email: parsed.data.email,
        displayName: parsed.data.displayName ?? null,
        createdAt: serverTimestamp(),
      });
      await set(ref(db, `roles/${cred.user.uid}`), parsed.data.role);

      // Sign out of secondary session immediately
      await fbSignOut(secondaryAuth);

      toast.success("User created");
      setOpen(false);
      setRoleField("user");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: UserRow) => {
    if (row.id === me?.uid) return toast.error("You cannot delete your own account");
    if (!confirm(`Remove ${row.email} from the system? This revokes their access. (Auth account must be removed manually in Firebase Console.)`)) return;
    try {
      await Promise.all([
        remove(ref(db, `roles/${row.id}`)),
        remove(ref(db, `profiles/${row.id}`)),
      ]);
      toast.success("User removed");
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Admin-only: create accounts and manage roles.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Create user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="space-y-2"><Label>Display name</Label><Input name="displayName" maxLength={60} /></div>
              <div className="space-y-2"><Label>Email *</Label><Input name="email" type="email" required /></div>
              <div className="space-y-2"><Label>Password *</Label><Input name="password" type="password" required minLength={6} /></div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={role} onValueChange={(v) => setRoleField(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Standard User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create user"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No users yet.</TableCell></TableRow>
              )}
              {rows.map((r) => {
                const isAdmin = r.role === "admin";
                const isMe = r.id === me?.uid;
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
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={isMe} onClick={() => setUserRole(r.id, isAdmin ? "user" : "admin")}>
                          Make {isAdmin ? "user" : "admin"}
                        </Button>
                        <Button size="icon" variant="ghost" disabled={isMe} onClick={() => handleDelete(r)} title="Remove user">
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
