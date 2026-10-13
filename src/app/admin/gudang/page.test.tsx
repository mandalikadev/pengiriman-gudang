import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, periodeSumberGudang } from "@/server/db/schema";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanGudang from "./page";

let cibubur: number;

beforeAll(async () => {
  cibubur = await idGudangUji("Gudang Cibubur");
});

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/gudang", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat lima gudang, master toko dengan status dan gudangnya, dan tombol tambah massal", async () => {
    const terhubung = await buatTokoUji();
    const nonaktif = await buatTokoUji({ aktif: false });
    await db.insert(hubunganTokoGudang).values({ tokoId: terhubung.id, gudangId: cibubur });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = renderToStaticMarkup(await HalamanGudang());
    for (const nama of ["Pusat", "Gudang Bali", "Gudang Bandung", "Gudang Cibubur", "Gudang Jabodetabek"]) {
      expect(html).toContain(nama);
    }
    expect(html).toContain("PMS");
    expect(html).toContain("TSM CBB");
    expect(html).toContain(terhubung.nama);
    expect(html).toContain(nonaktif.nama);
    expect(html).toContain('data-status="aktif"');
    expect(html).toContain("Nonaktif");
    expect(html).toContain("Belum terhubung");
    expect(html).toContain("Tambahkan toko terpilih");
    // T111: tombol status toko pindah ke halaman Toko; halaman Gudang tetap menampilkan status toko.
    expect(html).not.toContain(`aria-label="Nonaktifkan ${terhubung.nama}"`);
    expect(html).not.toContain(`aria-label="Aktifkan ${nonaktif.nama}"`);
    const barisNonaktif = new RegExp(`<tr[^>]*>(?:(?!</tr>).)*${nonaktif.nama}(?:(?!</tr>).)*</tr>`).exec(html)?.[0] ?? "";
    expect(barisNonaktif).toContain("Nonaktif");
    expect(barisNonaktif).not.toContain("<button");
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});

describe("/admin/gudang: periode sumber", () => {
  it("admin melihat periode berlaku per gudang (siapa, kapan), gudang yang belum ditetapkan, dan bulan tersedia sebagai pilihan", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const [agustus, november] = await siapkanBulanTersediaUji(admin.id, [8, 11]);
    const bali = await idGudangUji("Gudang Bali");
    const bandung = await idGudangUji("Gudang Bandung");
    await tetapkanPeriodeSumber({ idGudang: bali, bulan: [november, agustus], idPengguna: admin.id });
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, bandung));
    kepala.cookie = admin.cookie;

    const html = renderToStaticMarkup(await HalamanGudang());
    const tahun = agustus.slice(0, 4);
    const barisBali = new RegExp(`<tr[^>]*data-periode-gudang="${bali}"[^>]*>(.*?)</tr>`).exec(html)?.[1] ?? "";
    expect(barisBali).toContain(`Agustus ${tahun}, November ${tahun}`);
    expect(barisBali).toMatch(/Uji admin, \w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB/);
    const barisBandung = new RegExp(`<tr[^>]*data-periode-gudang="${bandung}"[^>]*>(.*?)</tr>`).exec(html)?.[1] ?? "";
    expect(barisBandung).toContain('data-status="periodeBelumDitetapkan"');
    expect(barisBandung).toContain("Belum ditetapkan");
    expect(html).toContain(`value="${agustus}"`);
    expect(html).toContain(`value="${november}"`);
    expect(html).toContain("Pilih 1–12 bulan, boleh tidak berurutan.");
    expect(html).toContain("Simpan periode sumber");
  });
});
