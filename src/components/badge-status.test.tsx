import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BadgeStatus, semuaStatus, type Status } from "./badge-status";

// Ekspektasi dari tabel DESIGN §7: token warna + ikon lucide per status.
const harapan: Record<Status, { token: string; ikon: string; teks: string }> = {
  aktif: { token: "success", ikon: "circle-check", teks: "Aktif" },
  final: { token: "success", ikon: "circle-check", teks: "Final" },
  berhasilDisimpan: { token: "success", ikon: "circle-check", teks: "Berhasil disimpan" },
  sedangDiproses: { token: "info", ikon: "loader-circle", teks: "Sedang diproses" },
  sedangMenyimpan: { token: "info", ikon: "loader-circle", teks: "Sedang menyimpan" },
  siapDitinjau: { token: "primary", ikon: "clipboard-list", teks: "Siap ditinjau" },
  draft: { token: "primary", ikon: "clipboard-list", teks: "Draft" },
  peringatanImpor: { token: "warning", ikon: "triangle-alert", teks: "Peringatan impor" },
  parsial: { token: "warning", ikon: "triangle-alert", teks: "Parsial" },
  perluDihitungUlang: { token: "warning", ikon: "triangle-alert", teks: "Perlu dihitung ulang" },
  errorImpor: { token: "destructive", ikon: "circle-x", teks: "Error impor" },
  gagal: { token: "destructive", ikon: "circle-x", teks: "Gagal" },
  stokNegatif: { token: "destructive", ikon: "circle-x", teks: "Stok negatif" },
  tersimpanGagalMuatUlang: {
    token: "warning",
    ikon: "refresh-ccw",
    teks: "Perubahan tersimpan. Muat ulang halaman untuk melihatnya.",
  },
  belumDiketahui: { token: "muted-foreground", ikon: "circle-dashed", teks: "Belum diketahui" },
  tidakTersedia: { token: "muted-foreground", ikon: "circle-dashed", teks: "Tidak tersedia" },
  manual: { token: "muted-foreground", ikon: "hand", teks: "Manual" },
  diarsipkan: { token: "muted-foreground", ikon: "archive", teks: "Diarsipkan" },
  dibatalkan: { token: "muted-foreground", ikon: "archive", teks: "Dibatalkan" },
};

function kelasBadge(html: string): string[] {
  const kelas = html.match(/^<span[^>]*class="([^"]*)"/)?.[1] ?? "";
  return kelas.replaceAll("&amp;", "&").replaceAll("&gt;", ">").split(/\s+/);
}

describe("BadgeStatus (DESIGN §7)", () => {
  it("mencakup semua status badge di tabel §7 (baris \"Belum disimpan (form)\" ditangani PesanStatusSimpan)", () => {
    expect([...semuaStatus].sort()).toEqual(Object.keys(harapan).sort());
  });

  it.each(Object.entries(harapan))("%s tampil sebagai ikon + teks dengan token yang benar", (status, h) => {
    const html = renderToStaticMarkup(<BadgeStatus status={status as Status} />);
    expect(html).toContain(`lucide-${h.ikon}`);
    expect(html).toContain(`aria-hidden="true"`);
    expect(html).toContain(`>${h.teks}</span>`);
    const kelas = kelasBadge(html);
    // DESIGN §7 (Keputusan 2026-10-09): latar 10% token status, ikon berwarna status, teks foreground.
    expect(kelas).toContain(`bg-${h.token}/10`);
    expect(kelas).toContain(`[&>svg]:text-${h.token}`);
    expect(kelas).toContain("text-foreground");
    expect(kelas).not.toContain(`text-${h.token}`);
    // DESIGN §6: ikon 20 px di zona kerja; DESIGN §3: teks dasar zona kerja text-sm.
    expect(kelas).toContain("[&>svg]:size-5");
    expect(kelas).toContain("text-sm");
  });

  it("ikon berputar hanya jika gerak diizinkan", () => {
    const html = renderToStaticMarkup(<BadgeStatus status="sedangDiproses" />);
    expect(html).toContain("motion-safe:animate-spin");
    expect(html).not.toMatch(/(?<!motion-safe:)animate-spin/);
  });
});
