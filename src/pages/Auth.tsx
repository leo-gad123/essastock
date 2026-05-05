import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Boxes } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z.string().min(6, "Password must be at least 6 characters").max(72);

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const ev = emailSchema.safeParse(email);
    const pv = passwordSchema.safeParse(password);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    if (!pv.success) return toast.error(pv.error.issues[0].message);

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Welcome back!");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-subtle)] p-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">StockNova</CardTitle>
          <CardDescription>Secure your Stock.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="si-email">Email</Label>
              <Input id="si-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-pw">Password</Label>
              <Input id="si-pw" name="password" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Powered by Elonda
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
