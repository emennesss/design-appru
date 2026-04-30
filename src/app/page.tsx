import Link from "next/link";
import { APP_NAME } from "@/lib/appConfig";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <div className="mb-4 text-sm uppercase tracking-[0.3em] text-slate-400">
          Multi-tenant design approval system
        </div>

        <h1 className="text-5xl font-bold tracking-tight mb-6">{APP_NAME}</h1>

        <p className="text-lg text-slate-300 mb-8">
          Upload designs, collect approvals, track revisions, and lock final files
          before production starts.
        </p>

        <Link
          href="/login"
          className="inline-flex rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-200"
        >
          Start
        </Link>
      </div>
    </main>
  );
}
