import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { periodeSumberGudang } from "@/server/db/schema";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";

import { bacaPeriodeSumber, bacaPeriodeSumberPerhitungan, tetapkanPeriodeSumber } from "./periode-sumber";
import { idGudangUji } from "./uji-bantu";

// PRD A4 ▶ Keputusan (2026-10-10, T51): bulan periode sumber yang tidak lagi ada di bulan laporan cache aktif tidak
// ikut dipakai perhitungan; perhitungan berjalan dengan bulan yang masih ada.

/** Bulan di luar rentang tahun uji (3000–8999), jadi tidak pernah ada di cache laporan aktif. */
const BULAN_TANPA_DATA = ["2990-05", "2990-08"];

describe("bacaPeriodeSumberPerhitungan", () => {
  let idAdmin: string;
  let februari = "";

  beforeAll(async () => {
    idAdmin = (await buatPenggunaUji("admin")).id;
    [februari] = await siapkanBulanTersediaUji(idAdmin, [2]);
  }, 60_000);

  /** Menyimpan penetapan langsung (melewati pemeriksaan form) untuk meniru bulan yang datanya sudah tidak aktif. */
  async function simpanPeriode(idGudang: number, bulan: string[]) {
    const [baris] = await db
      .insert(periodeSumberGudang)
      .values({ gudangId: idGudang, bulan: [...bulan].sort(), ditetapkanOleh: idAdmin })
      .returning({ versi: periodeSumberGudang.id, ditetapkanPada: periodeSumberGudang.ditetapkanPada });
    return baris;
  }

  it("satu bulan dengan data dan satu bulan tanpa data aktif → hanya bulan yang ada dipakai, sisanya hilang", async () => {
    const bali = await idGudangUji("Gudang Bali");
    const disimpan = await simpanPeriode(bali, [februari, BULAN_TANPA_DATA[0]]);

    expect(await bacaPeriodeSumberPerhitungan(bali)).toEqual({
      versi: disimpan.versi,
      bulanDipakai: [februari],
      bulanHilang: [BULAN_TANPA_DATA[0]],
      ditetapkanOleh: "Uji admin",
      ditetapkanPada: disimpan.ditetapkanPada,
    });
    // Periode yang tersimpan tidak diubah.
    expect((await bacaPeriodeSumber(bali))?.bulan).toEqual([BULAN_TANPA_DATA[0], februari].sort());
  });

  it("semua bulan punya data → tidak ada bulan hilang", async () => {
    const bandung = await idGudangUji("Gudang Bandung");
    const hasil = await tetapkanPeriodeSumber({ idGudang: bandung, bulan: [februari], idPengguna: idAdmin });
    expect(hasil.keadaan).toBe("berhasil");

    expect(await bacaPeriodeSumberPerhitungan(bandung)).toMatchObject({ bulanDipakai: [februari], bulanHilang: [] });
  });

  it("semua bulan tanpa data aktif → bulan dipakai kosong, semua bulan hilang", async () => {
    const cibubur = await idGudangUji("Gudang Cibubur");
    await simpanPeriode(cibubur, BULAN_TANPA_DATA);

    expect(await bacaPeriodeSumberPerhitungan(cibubur)).toMatchObject({
      bulanDipakai: [],
      bulanHilang: BULAN_TANPA_DATA,
    });
  });

  it("belum ditetapkan → null", async () => {
    const jabodetabek = await idGudangUji("Gudang Jabodetabek");
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, jabodetabek));

    expect(await bacaPeriodeSumberPerhitungan(jabodetabek)).toBeNull();
  });
});
