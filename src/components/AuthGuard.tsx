"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { homePathForRole } from "@/lib/permissions";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));

        if (!snap.exists()) {
          router.push("/login");
          return;
        }

        const user = snap.data() as any;

        if (user.status !== "active") {
          router.push("/login");
          return;
        }

        // store stable session
        localStorage.setItem("bmp_email", user.email || "");
        localStorage.setItem("bmp_role", user.role || "");
        localStorage.setItem("bmp_tenantId", user.tenantId || "");

        // route correction (fix wrong entry point)
        const correctPath = homePathForRole(user.role);
        if (window.location.pathname === "/dashboard" && correctPath !== "/dashboard") {
          router.replace(correctPath);
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error("AuthGuard error", err);
        router.push("/login");
      }
    });

    return () => unsub();
  }, [router]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading session...</div>;
  }

  return <>{children}</>;
}
