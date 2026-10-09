import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StatusCacheLaporan as Status } from "@/server/laporan/cache";

import { StatusCacheLaporan } from "./status-cache-laporan";

// DESIGN §7: ikon + teks; token warna sesuai status domain (Aktif / Sedang diproses / Perlu dihitung ulang / Gagal).
const harapan: Record<Status, { token: string; ikon: string; teks: string }> = {
  terbaru: { token: "success", ikon: "circle-check", teks: "Terbaru" },
  "sedang-dihitung": { token: "info", ikon: "loader-circle", teks: "Sedang dihitung" },
  "perlu-dihitung-ulang": { token: "warning", ikon: "triangle-alert", teks: "Perlu dihitung ulang" },
  gagal: { token: "destructive", ikon: "circle-x", teks: "Gagal" },
};

describe("StatusCacheLaporan", () => {
  for (const [status, { token, ikon, teks }] of Object.entries(harapan) as [Status, (typeof harapan)[Status]][]) {
    it(`${status}: ikon ${ikon} + teks "${teks}" dengan token ${token}`, () => {
      const html = renderToStaticMarkup(<StatusCacheLaporan status={status} />);
      expect(html).toContain("Hasil hitung laporan");
      const badge = html.match(/<span[^>]*data-status-cache="([^"]*)"[^>]*>(.*?)<\/span>/);
      expect(badge?.[1]).toBe(status);
      expect(badge?.[0]).toContain(`bg-${token}/10`);
      expect(badge?.[0]).toContain("text-foreground");
      expect(badge?.[2]).toContain(`lucide-${ikon}`);
      expect(badge?.[2]).toContain(teks);
    });
  }

  it("sedang dihitung berputar hanya jika gerak tidak dikurangi", () => {
    expect(renderToStaticMarkup(<StatusCacheLaporan status="sedang-dihitung" />)).toContain("motion-safe:animate-spin");
  });
});
