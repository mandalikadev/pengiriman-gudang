import { randomUUID } from "node:crypto";

import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buatPenggunaUji, emailUnik, masukUji, sandiUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { gudang, penugasanOperator, periodeSumberGudang, user } from "@/server/db/schema";

import { daftarHakTindakan } from "./hak-tindakan";
import { punyaHakTindakan } from "./penugasan";
import { adminPertama } from "./seed-hubungan-jadwal";
import { OPERATOR_UAT, PERIODE_UAT, seedUat } from "./seed-uat";

// Seed UAT (T89, PRD A3 ▶ Keputusan 2026-10-12, UAT kedua, butir "Seed UAT"). Test memakai gudang dan email uji
// sendiri (nama unik) supaya periode sumber dan penugasan gudang master milik berkas test lain tidak tersentuh.

const PESAN_TANPA_SANDI = "UAT_SANDI_OPERATOR belum diisi di .env; akun operator tidak dibuat.";

type GudangUji = { gudang: string; nama: string; email: string; id: number };
let daftarUji: GudangUji[] = [];
/** Gudang uji yang sudah punya periode sumber sebelum seed. */
let gudangBerperiode: { id: number; nama: string };

async function buatGudangUji(awalan: string) {
  const [baris] = await db
    .insert(gudang)
    .values({ nama: `UJI-${awalan}-${randomUUID()}` })
    .returning({ id: gudang.id, nama: gudang.nama });
  return baris;
}

const idSemuaGudang = () => [...daftarUji.map((g) => g.id), gudangBerperiode.id];

async function periodeUji() {
  return db
    .select()
    .from(periodeSumberGudang)
    .where(inArray(periodeSumberGudang.gudangId, idSemuaGudang()))
    .orderBy(asc(periodeSumberGudang.id));
}

async function akunUji() {
  return db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role, updatedAt: user.updatedAt })
    .from(user)
    .where(inArray(user.email, daftarUji.map((g) => g.email)))
    .orderBy(asc(user.email));
}

async function penugasanUji() {
  return db
    .select()
    .from(penugasanOperator)
    .where(inArray(penugasanOperator.gudangId, idSemuaGudang()))
    .orderBy(asc(penugasanOperator.gudangId));
}

/** Data seed untuk gudang uji, bentuknya sama dengan `OPERATOR_UAT`. */
const dataSeedUji = () => [
  ...daftarUji.map(({ gudang, nama, email }) => ({ gudang, nama, email })),
  { gudang: gudangBerperiode.nama, nama: "Operator Berperiode", email: emailBerperiode },
];
let emailBerperiode = "";

beforeAll(async () => {
  await buatPenggunaUji("admin");
  daftarUji = [];
  for (const kota of ["cibubur", "bali", "bandung"]) {
    const g = await buatGudangUji(kota);
    daftarUji.push({ gudang: g.nama, nama: `Operator ${kota}`, email: emailUnik(`operator-${kota}`), id: g.id });
  }
  gudangBerperiode = await buatGudangUji("berperiode");
  emailBerperiode = emailUnik("operator-berperiode");
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
  await db.insert(periodeSumberGudang).values({ gudangId: gudangBerperiode.id, bulan: ["2990-05"], ditetapkanOleh: admin.id });
});

afterAll(async () => {
  await db.delete(periodeSumberGudang).where(inArray(periodeSumberGudang.gudangId, idSemuaGudang()));
  await db.delete(user).where(inArray(user.email, [...daftarUji.map((g) => g.email), emailBerperiode]));
  await db.delete(gudang).where(inArray(gudang.id, idSemuaGudang()));
});

describe("data seed UAT", () => {
  it("periode Juni–Agustus 2026 dan tiga operator persis isi issue T89", () => {
    expect(PERIODE_UAT).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(OPERATOR_UAT).toEqual([
      { gudang: "Gudang Cibubur", nama: "Operator Cibubur", email: "operator.cibubur@example.com" },
      { gudang: "Gudang Bali", nama: "Operator Bali", email: "operator.bali@example.com" },
      { gudang: "Gudang Bandung", nama: "Operator Bandung", email: "operator.bandung@example.com" },
    ]);
  });
});

describe("seedUat", () => {
  it("tanpa UAT_SANDI_OPERATOR → periode tetap di-seed, akun dilewati dengan peringatan", async () => {
    await expect(seedUat({}, dataSeedUji())).resolves.toEqual({
      keadaan: "berhasil",
      periodeDibuat: 3,
      akunDibuat: 0,
      penugasanDibuat: 0,
      peringatan: PESAN_TANPA_SANDI,
    });
    expect(await akunUji()).toEqual([]);
    expect(await penugasanUji()).toEqual([]);

    const idAdmin = await db.transaction((tx) => adminPertama(tx));
    const periode = await periodeUji();
    for (const g of daftarUji) {
      const milikGudang = periode.filter((p) => p.gudangId === g.id);
      expect(milikGudang, g.gudang).toHaveLength(1);
      expect(milikGudang[0]).toMatchObject({ bulan: ["2026-06", "2026-07", "2026-08"], ditetapkanOleh: idAdmin });
    }
  });

  it("gudang yang sudah punya periode sumber tidak diubah", async () => {
    const milikGudang = (await periodeUji()).filter((p) => p.gudangId === gudangBerperiode.id);
    expect(milikGudang).toHaveLength(1);
    expect(milikGudang[0].bulan).toEqual(["2990-05"]);
  });

  it("UAT_SANDI_OPERATOR kosong diperlakukan sama dengan belum diisi", async () => {
    await expect(seedUat({ UAT_SANDI_OPERATOR: "" }, dataSeedUji())).resolves.toMatchObject({
      akunDibuat: 0,
      peringatan: PESAN_TANPA_SANDI,
    });
    expect(await akunUji()).toEqual([]);
  });

  it("dengan UAT_SANDI_OPERATOR → akun viewer bisa masuk dan punya kelima hak di gudangnya", async () => {
    const periodeSebelum = await periodeUji();

    await expect(seedUat({ UAT_SANDI_OPERATOR: sandiUji }, dataSeedUji())).resolves.toEqual({
      keadaan: "berhasil",
      periodeDibuat: 0,
      akunDibuat: 4,
      penugasanDibuat: 4,
      peringatan: null,
    });
    expect(await periodeUji()).toEqual(periodeSebelum);

    for (const g of daftarUji) {
      const [akun] = await db.select().from(user).where(eq(user.email, g.email));
      expect(akun, g.email).toMatchObject({ name: g.nama, role: "viewer", banned: false });
      await expect(masukUji(g.email)).resolves.toContain("session_token");

      const penugasan = await db.select().from(penugasanOperator).where(eq(penugasanOperator.userId, akun.id));
      expect(penugasan).toEqual([expect.objectContaining({ gudangId: g.id, hakTindakan: [...daftarHakTindakan] })]);
      for (const hak of daftarHakTindakan) expect(await punyaHakTindakan(akun.id, g.id, hak), hak).toBe(true);
    }
  });

  it("seed kedua tidak menambah atau mengubah apa pun", async () => {
    const periodeSebelum = await periodeUji();
    const akunSebelum = await akunUji();
    const penugasanSebelum = await penugasanUji();

    await expect(seedUat({ UAT_SANDI_OPERATOR: "sandi-lain-yang-berbeda" }, dataSeedUji())).resolves.toEqual({
      keadaan: "berhasil",
      periodeDibuat: 0,
      akunDibuat: 0,
      penugasanDibuat: 0,
      peringatan: null,
    });

    expect(await periodeUji()).toEqual(periodeSebelum);
    expect(await akunUji()).toEqual(akunSebelum);
    expect(await penugasanUji()).toEqual(penugasanSebelum);
    await expect(masukUji(daftarUji[0].email)).resolves.toContain("session_token");
  });

  it("penugasan yang sudah ada dengan hak lain tidak diubah", async () => {
    const [akun] = await db.select({ id: user.id }).from(user).where(eq(user.email, daftarUji[1].email));
    await db
      .update(penugasanOperator)
      .set({ hakTindakan: ["ekspor"] })
      .where(eq(penugasanOperator.userId, akun.id));

    await expect(seedUat({ UAT_SANDI_OPERATOR: sandiUji }, dataSeedUji())).resolves.toMatchObject({ penugasanDibuat: 0 });

    const penugasan = await db.select().from(penugasanOperator).where(eq(penugasanOperator.userId, akun.id));
    expect(penugasan.map((p) => p.hakTindakan)).toEqual([["ekspor"]]);
  });
});
