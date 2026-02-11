// Prevent static prerendering -- dashboard requires runtime auth check
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-black text-neutral-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-neutral-500">Loading...</p>
      </div>
    </main>
  );
}
