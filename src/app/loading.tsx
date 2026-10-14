/**
 * Kerangka memuat area konten (DESIGN §11.7): sidebar tetap tampil karena berada di layout. Blok `bg-muted` bersudut
 * sesuai §4; denyut hanya jika gerak tidak dikurangi (§5).
 */
export default function Memuat() {
  return (
    <main
      role="status"
      aria-live="polite"
      data-memuat
      className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8"
    >
      <span className="sr-only">Memuat halaman…</span>
      <div aria-hidden className="flex flex-col gap-6 motion-safe:animate-pulse">
        <div className="h-9 w-64 max-w-full rounded-full bg-muted" />
        <div className="h-32 rounded-3xl bg-muted" />
        <div className="h-64 rounded-2xl bg-muted" />
      </div>
    </main>
  );
}
