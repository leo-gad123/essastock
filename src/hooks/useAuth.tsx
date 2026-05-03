import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { ref, onValue, off } from "firebase/database";
import { auth, db } from "@/lib/firebase";

type Role = "admin" | "user";

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let roleRef: ReturnType<typeof ref> | null = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (roleRef) {
        off(roleRef);
        roleRef = null;
      }
      setUser(u);
      if (u) {
        roleRef = ref(db, `roles/${u.uid}`);
        onValue(roleRef, (snap) => {
          const v = snap.val();
          setRole(v === "admin" ? "admin" : v ? "user" : "user");
          setLoading(false);
        });
      } else {
        setRole(null);
        setLoading(false);
      }
    });
    return () => {
      if (roleRef) off(roleRef);
      unsub();
    };
  }, []);

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, isAdmin: role === "admin", signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
