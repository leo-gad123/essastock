import { useEffect, useState } from "react";
import { ref, onValue, push, set, serverTimestamp, get } from "firebase/database";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Category { id: string; name: string }

const ADD_NEW = "__add_new__";

export default function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { isAdmin } = useAuth();
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onValue(ref(db, "categories"), (snap) => {
      const v = snap.val() || {};
      const list: Category[] = Object.entries(v).map(([id, x]: any) => ({ id, name: x.name }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCats(list);
    });
  }, []);

  const handleSelect = (v: string) => {
    if (v === ADD_NEW) { setOpen(true); return; }
    onChange(v);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Category name required");
    if (cats.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      return toast.error("Category already exists");
    }
    setSaving(true);
    try {
      // Re-check server-side to be safe
      const snap = await get(ref(db, "categories"));
      const existing = snap.val() || {};
      const dup = Object.values<any>(existing).some(
        (c) => String(c?.name || "").toLowerCase() === trimmed.toLowerCase()
      );
      if (dup) { toast.error("Category already exists"); setSaving(false); return; }

      const newRef = push(ref(db, "categories"));
      await set(newRef, { name: trimmed, createdAt: serverTimestamp() });
      onChange(trimmed);
      toast.success("Category added");
      setName("");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to add category");
    } finally {
      setSaving(false);
    }
  };

  // Ensure current value is selectable even if not in list yet
  const valueInList = !value || cats.some((c) => c.name === value);

  return (
    <>
      <Select value={value || ""} onValueChange={handleSelect}>
        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
        <SelectContent>
          {!valueInList && value && <SelectItem value={value}>{value}</SelectItem>}
          {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          {isAdmin && <SelectItem value={ADD_NEW}>+ Add new category</SelectItem>}
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add category</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Category name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
