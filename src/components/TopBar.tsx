"use client";

import { auth } from "@/lib/firebaseClient";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function TopBar() {
  const router = useRouter();

  async function logout() {
    await signOut(auth);
    localStorage.clear();
    sessionStorage.clear();
    router.push("/login");
  }

  return (
    <div style={{
      padding: "10px 20px",
      background: "#111827",
      color: "white",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      <b>Design Appru</b>
      <button
        onClick={logout}
        style={{
          background: "#dc2626",
          color: "white",
          border: 0,
          borderRadius: 6,
          padding: "8px 12px",
          cursor: "pointer"
        }}
      >
        Logout
      </button>
    </div>
  );
}
