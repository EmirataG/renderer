import { TrebleClefSpinner } from "@/components/TrebleClefSpinner";

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-canvas flex flex-col items-center justify-center">
      <TrebleClefSpinner size={72} className="text-fg-muted" />
      <p
        className="mt-6 text-xs text-fg-subtle uppercase tracking-widest"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        Loading
      </p>
    </main>
  );
}
