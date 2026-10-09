// Zona suasana (DESIGN §1): blob latar maksimal 2, judul Fraunces besar, jarak lega.
export default function Beranda() {
  return (
    <main className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-32 -right-24 size-96 rounded-full bg-clay/20 blur-3xl" />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <h1 className="text-4xl font-bold text-foreground md:text-5xl">Dashboard Penjualan MANDALIKA</h1>
      </div>
    </main>
  );
}
