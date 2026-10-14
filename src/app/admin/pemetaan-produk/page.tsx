import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatAngka } from "@/app/admin/impor/format";
import {
  cocokCari,
  KotakCari,
  NavigasiHalaman,
  nomorHalaman,
  potongHalaman,
  teksParameter,
  urlDaftar,
  type ParameterUrl,
} from "@/components/daftar-berhalaman";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WaktuSingkat } from "@/components/waktu-singkat";
import { cn } from "@/lib/utils";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { daftarStatusKeluargaAroma, type StatusKeluargaAroma } from "@/server/db/schema";
import { BATAS_RIWAYAT, muatPemetaanProduk } from "@/server/keluarga-aroma/pemetaan";

import { DaftarUsulan } from "./daftar-usulan";
import { FormPemetaan } from "./form-pemetaan";
import { BadgeStatusPemetaan, BadgeUsulan, daftarFilterStatus, labelPemetaan } from "./status-pemetaan";

export const metadata: Metadata = {
  title: "Pemetaan produk — Dashboard Penjualan MANDALIKA",
};

const PATH_HALAMAN = "/admin/pemetaan-produk";

const kelasTautan =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function bacaStatus(nilai: string | string[] | undefined): StatusKeluargaAroma | null {
  const teks = Array.isArray(nilai) ? nilai[0] : nilai;
  return daftarStatusKeluargaAroma.find((s) => s === teks) ?? null;
}

/** Chip filter status. Berpindah filter mempertahankan pencarian dan kembali ke halaman 1 (T119). */
function FilterStatus({
  aktif,
  jumlahPerStatus,
  parameter,
}: {
  aktif: StatusKeluargaAroma | null;
  jumlahPerStatus: Record<StatusKeluargaAroma, number>;
  parameter: ParameterUrl;
}) {
  const total = daftarStatusKeluargaAroma.reduce((jumlah, s) => jumlah + jumlahPerStatus[s], 0);
  const pilihan = [
    { status: null, label: "Semua", jumlah: total, href: urlDaftar(PATH_HALAMAN, parameter, { status: undefined, halaman: undefined }) },
    ...daftarFilterStatus.map((f) => ({
      ...f,
      jumlah: jumlahPerStatus[f.status],
      href: urlDaftar(PATH_HALAMAN, parameter, { status: f.status, halaman: undefined }),
    })),
  ];
  return (
    <nav aria-label="Filter status keluarga aroma">
      <ul className="flex flex-wrap gap-2">
        {pilihan.map((p) => {
          const terpilih = p.status === aktif;
          return (
            <li key={p.label}>
              <Link
                href={p.href}
                aria-current={terpilih ? "page" : undefined}
                className={cn(
                  kelasTautan,
                  terpilih ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-primary/10 hover:text-primary",
                )}
              >
                {p.label}
                <span className="tabular-nums">({formatAngka(p.jumlah)})</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Zona kerja (DESIGN §1). Hanya admin; selain admin mendapat 404 agar halaman admin tidak terungkap. */
export default async function HalamanPemetaanProduk({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const parameter = await searchParams;
  const filterStatus = bacaStatus(parameter.status);
  const data = await muatPemetaanProduk(filterStatus);
  // Keadaan tiap daftar di URL (T119): `cari`/`halaman` untuk daftar produk, `cariUsulan`/`halamanUsulan` untuk usulan.
  const keadaan = {
    status: filterStatus ?? "",
    cari: teksParameter(parameter.cari),
    halaman: String(nomorHalaman(parameter.halaman)),
    cariUsulan: teksParameter(parameter.cariUsulan),
    halamanUsulan: String(nomorHalaman(parameter.halamanUsulan)),
  };
  const produkTampil = potongHalaman(
    data.produk.filter((p) => cocokCari(keadaan.cari, p.kode, p.nama)),
    nomorHalaman(parameter.halaman),
  );
  const usulanTampil = potongHalaman(
    data.usulan.filter((u) => cocokCari(keadaan.cariUsulan, u.kode, u.nama)),
    nomorHalaman(parameter.halamanUsulan),
  );
  // Kotak cari satu daftar mengirim ulang keadaan daftar lainnya; halaman daftarnya sendiri kembali ke 1.
  const selainDaftarProduk = { status: keadaan.status, cariUsulan: keadaan.cariUsulan, halamanUsulan: keadaan.halamanUsulan };
  const selainUsulan = { status: keadaan.status, cari: keadaan.cari, halaman: keadaan.halaman };

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Pemetaan produk</h1>

      <DaftarUsulan
        // Pilihan centang hanya berlaku untuk halaman yang tampil; berpindah halaman atau pencarian mengosongkannya.
        key={`${keadaan.cariUsulan}|${usulanTampil.halaman}`}
        usulan={usulanTampil.baris.map((u) => ({ kode: u.kode, nama: u.nama, usulan: u.usulan }))}
        adaPencarian={keadaan.cariUsulan !== ""}
        kotakCari={
          <KotakCari
            action={PATH_HALAMAN}
            name="cariUsulan"
            nilai={keadaan.cariUsulan}
            label="Cari kode atau nama produk di daftar usulan"
            pertahankan={selainUsulan}
          />
        }
        navigasi={
          <NavigasiHalaman
            potongan={usulanTampil}
            label="Halaman daftar usulan"
            url={(halaman) => urlDaftar(PATH_HALAMAN, keadaan, { halamanUsulan: halaman })}
          />
        }
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar produk</h2>
        <FilterStatus aktif={filterStatus} jumlahPerStatus={data.jumlahPerStatus} parameter={keadaan} />
        <KotakCari
          action={PATH_HALAMAN}
          name="cari"
          nilai={keadaan.cari}
          label="Cari kode atau nama produk"
          pertahankan={selainDaftarProduk}
        />
        {produkTampil.jumlahBaris === 0 ? (
          <p className="text-muted-foreground">
            {keadaan.cari === "" ? "Tidak ada produk dengan status ini." : "Tidak ada produk yang cocok dengan pencarian ini."}
          </p>
        ) : (
          <>
            <Table aria-label="Daftar produk" panjang>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode produk</TableHead>
                  <TableHead>Nama produk</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Keluarga aroma</TableHead>
                  <TableHead>Konfirmasi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produkTampil.baris.map((p) => (
                  <TableRow key={p.kode} data-produk={p.kode}>
                    <TableCell className="font-semibold">{p.kode}</TableCell>
                    <TableCell className="whitespace-normal">{p.nama}</TableCell>
                    <TableCell>{p.kategori}</TableCell>
                    <TableCell>
                      <BadgeStatusPemetaan status={p.pemetaan.status} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {p.pemetaan.keluarga ? (
                        p.pemetaan.keluarga.nama
                      ) : p.usulan ? (
                        <BadgeUsulan nama={p.usulan.nama} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <FormPemetaan kode={p.kode} pemetaan={p.pemetaan} keluarga={data.keluarga} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <NavigasiHalaman
              potongan={produkTampil}
              label="Halaman daftar produk"
              url={(halaman) => urlDaftar(PATH_HALAMAN, keadaan, { halaman })}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Riwayat pemetaan</h2>
          <p className="text-muted-foreground">Perubahan terbaru di atas, paling banyak {BATAS_RIWAYAT} perubahan.</p>
        </div>
        {data.riwayat.length === 0 ? (
          <p className="text-muted-foreground">Belum ada riwayat pemetaan.</p>
        ) : (
          <Table aria-label="Riwayat pemetaan">
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Oleh</TableHead>
                <TableHead>Kode produk</TableHead>
                <TableHead>Dari</TableHead>
                <TableHead>Ke</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.riwayat.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <WaktuSingkat waktu={r.terjadiPada} />
                  </TableCell>
                  <TableCell>{r.pelaku}</TableCell>
                  <TableCell className="font-semibold">{r.kodeProduk}</TableCell>
                  <TableCell className="whitespace-normal">{labelPemetaan(r.dari)}</TableCell>
                  <TableCell className="whitespace-normal">{labelPemetaan(r.ke)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
