import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { gudang, penugasanOperator, periodeSumberGudang, user } from "@/server/db/schema";

import { daftarHakTindakan } from "./hak-tindakan";
import { tugaskanOperator } from "./penugasan";
import { adminPertama, PESAN_TANPA_ADMIN } from "./seed-hubungan-jadwal";

// Seed UAT (T89, PRD A3 ▶ Keputusan 2026-10-12, UAT kedua, butir "Seed UAT"): hanya dijalankan `pnpm uat`, bukan
// instalasi produksi. Periode sumber Juni–Agustus 2026 untuk Gudang Cibubur, Bali, Bandung, dan akun operator viewer
// yang ditugaskan ke gudangnya dengan kelima hak tindakan. Pusat dan Gudang Jabodetabek dibiarkan kosong (A3–A5).

/** Bulan laporan periode sumber UAT, urut naik (bentuk sama dengan penetapan di halaman admin, T51). */
export const PERIODE_UAT = ["2026-06", "2026-07", "2026-08"] as const;

type OperatorUat = { gudang: string; nama: string; email: string };

/** Gudang yang di-seed beserta akun operatornya. */
export const OPERATOR_UAT: readonly OperatorUat[] = [
  { gudang: "Gudang Cibubur", nama: "Operator Cibubur", email: "operator.cibubur@example.com" },
  { gudang: "Gudang Bali", nama: "Operator Bali", email: "operator.bali@example.com" },
  { gudang: "Gudang Bandung", nama: "Operator Bandung", email: "operator.bandung@example.com" },
];

const PESAN_TANPA_SANDI = "UAT_SANDI_OPERATOR belum diisi di .env; akun operator tidak dibuat.";

/** Kosong atau tidak ada = belum diisi; selain itu minimal 8 karakter (batas kata sandi Better Auth, sama dengan seed admin). */
const skemaSandi = z.union([z.literal("").transform(() => undefined), z.string().min(8)]).optional();

type HasilSeedUat =
  | {
      keadaan: "berhasil";
      periodeDibuat: number;
      akunDibuat: number;
      penugasanDibuat: number;
      /** Peringatan untuk ditampilkan skrip (mis. akun dilewati karena sandi belum diisi), atau `null`. */
      peringatan: typeof PESAN_TANPA_SANDI | null;
    }
  | { keadaan: "gagal"; pesan: typeof PESAN_TANPA_ADMIN };

async function idGudangMenurutNama(nama: readonly string[]) {
  const baris = await db.select({ id: gudang.id, nama: gudang.nama }).from(gudang).where(inArray(gudang.nama, [...nama]));
  const peta = new Map(baris.map((b) => [b.nama, b.id]));
  const hilang = nama.filter((n) => !peta.has(n));
  if (hilang.length > 0) throw new Error(`Gudang belum ada di master: ${hilang.join(", ")}. Jalankan pnpm db:seed-master dulu.`);
  return peta;
}

/** Periode sumber `PERIODE_UAT` untuk setiap gudang yang belum punya periode sumber, atas nama admin pertama. */
async function seedPeriode(idGudang: readonly number[]) {
  return db.transaction(async (tx) => {
    const idAdmin = await adminPertama(tx);
    if (idAdmin === null) return null;
    let dibuat = 0;
    for (const id of idGudang) {
      // Mengunci baris gudang seperti `tetapkanPeriodeSumber`, agar tidak bersamaan dengan penetapan admin.
      await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, id)).for("update");
      const ada = await tx
        .select({ id: periodeSumberGudang.id })
        .from(periodeSumberGudang)
        .where(eq(periodeSumberGudang.gudangId, id))
        .limit(1);
      if (ada.length > 0) continue;
      await tx.insert(periodeSumberGudang).values({ gudangId: id, bulan: [...PERIODE_UAT], ditetapkanOleh: idAdmin });
      dibuat += 1;
    }
    return dibuat;
  });
}

/**
 * Menyiapkan data UAT (lihat komentar berkas). Idempoten dan tidak mengubah yang sudah ada:
 * 1. periode sumber hanya untuk gudang yang belum punya periode sumber (bulan tanpa data aktif boleh, T51);
 * 2. akun (peran viewer, lewat Better Auth seperti seed admin) hanya jika emailnya belum terdaftar, dengan kata sandi
 *    `UAT_SANDI_OPERATOR`; tanpa sandi, akun dan penugasannya dilewati dengan peringatan;
 * 3. penugasan kelima hak tindakan lewat `tugaskanOperator`, hanya jika akun itu belum ditugaskan di gudangnya.
 * Tanpa admin aktif → gagal tanpa menulis apa pun. `daftar` hanya diganti oleh test.
 */
export async function seedUat(
  env: Record<string, string | undefined>,
  daftar: readonly OperatorUat[] = OPERATOR_UAT,
): Promise<HasilSeedUat> {
  const sandi = skemaSandi.safeParse(env.UAT_SANDI_OPERATOR);
  if (!sandi.success) throw new Error("UAT_SANDI_OPERATOR di .env minimal 8 karakter.");

  const idGudang = await idGudangMenurutNama(daftar.map((o) => o.gudang));
  const periodeDibuat = await seedPeriode(daftar.map((o) => idGudang.get(o.gudang)!));
  if (periodeDibuat === null) return { keadaan: "gagal", pesan: PESAN_TANPA_ADMIN };

  if (sandi.data === undefined) {
    return { keadaan: "berhasil", periodeDibuat, akunDibuat: 0, penugasanDibuat: 0, peringatan: PESAN_TANPA_SANDI };
  }

  let akunDibuat = 0;
  let penugasanDibuat = 0;
  for (const operator of daftar) {
    const email = operator.email.toLowerCase();
    let [akun] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!akun) {
      const hasil = await auth.api.createUser({
        body: { name: operator.nama, email, password: sandi.data, role: "viewer" },
      });
      akun = { id: hasil.user.id };
      akunDibuat += 1;
    }

    const idTujuan = idGudang.get(operator.gudang)!;
    const sudah = await db
      .select({ userId: penugasanOperator.userId })
      .from(penugasanOperator)
      .where(and(eq(penugasanOperator.userId, akun.id), eq(penugasanOperator.gudangId, idTujuan)));
    if (sudah.length > 0) continue;
    const penugasan = await tugaskanOperator({ idPengguna: akun.id, idGudang: idTujuan, hakTindakan: daftarHakTindakan });
    if (penugasan.keadaan === "gagal") throw new Error(`Penugasan ${operator.nama} gagal: ${penugasan.pesan}`);
    penugasanDibuat += 1;
  }
  return { keadaan: "berhasil", periodeDibuat, akunDibuat, penugasanDibuat, peringatan: null };
}
