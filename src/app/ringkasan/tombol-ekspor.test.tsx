import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { bacaJawabanEkspor, StatusEkspor, TombolEkspor } from "./tombol-ekspor";

describe("TombolEkspor", () => {
  it("tombol Ekspor membawa URL ekspor; belum ada pesan keadaan sebelum ditekan", () => {
    const html = renderToStaticMarkup(<TombolEkspor url="/ringkasan/ekspor?bulan=2026-06" />);
    expect(html).toMatch(/<button[^>]*data-ekspor-url="\/ringkasan\/ekspor\?bulan=2026-06"[^>]*>.*Ekspor \(\.xlsx\)<\/button>/);
    expect(html).not.toContain("data-keadaan-ekspor");
  });
});

describe("StatusEkspor (DESIGN §7: ikon + teks)", () => {
  it("sedang mengekspor: LoaderCircle info yang berputar hanya jika gerak tidak dikurangi", () => {
    const html = renderToStaticMarkup(<StatusEkspor keadaan={{ keadaan: "mengekspor" }} />);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<svg[^>]*lucide-loader-circle[^>]*text-info[^>]*motion-safe:animate-spin/);
    expect(html).toContain("Sedang mengekspor");
    expect(html).toContain("text-foreground");
  });

  it("gagal: CircleX destructive + teks dan pesan alasannya", () => {
    const html = renderToStaticMarkup(<StatusEkspor keadaan={{ keadaan: "gagal", pesan: "Sesi berakhir." }} />);
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<svg[^>]*lucide-circle-x[^>]*text-destructive/);
    expect(html).toContain("Gagal mengekspor");
    expect(html).toContain("Sesi berakhir.");
  });

  it("siap: tidak menampilkan apa pun", () => {
    expect(renderToStaticMarkup(<StatusEkspor keadaan={{ keadaan: "siap" }} />)).toBe("");
  });
});

describe("bacaJawabanEkspor", () => {
  it("berhasil: berkas dan nama dari Content-Disposition", async () => {
    const hasil = await bacaJawabanEkspor(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Disposition": 'attachment; filename="ringkasan-2026-06.xlsx"' } }),
    );
    expect(hasil).toMatchObject({ keadaan: "berhasil", namaBerkas: "ringkasan-2026-06.xlsx" });
    if (hasil.keadaan === "berhasil") expect(hasil.berkas.size).toBe(3);
  });

  it("ditolak server: pesan dari server", async () => {
    expect(await bacaJawabanEkspor(Response.json({ pesan: "Anda belum masuk." }, { status: 401 }))).toEqual({
      keadaan: "gagal",
      pesan: "Anda belum masuk.",
    });
  });

  it("jawaban gagal yang bukan JSON: pesan dengan kode status", async () => {
    expect(await bacaJawabanEkspor(new Response("<html>", { status: 500 }))).toEqual({
      keadaan: "gagal",
      pesan: "Server menolak ekspor (kode 500).",
    });
  });
});
