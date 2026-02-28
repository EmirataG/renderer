import { TrebleClefSpinner } from "@/components/TrebleClefSpinner";

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center">
      <TrebleClefSpinner size={72} className="text-neutral-400" />
      <p
        className="mt-6 text-xs text-neutral-500 uppercase tracking-widest"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        Loading
      </p>
    </main>
  );
}
