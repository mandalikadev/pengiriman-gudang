import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { BadgeStatusPengiriman, TabelRiwayatPengiriman, teksJenis, teksTanggalKirim } from "@/app/usulan-jadwal/tampilan-pengiriman";
import { FormBatalkanPengiriman } from "@/app/usulan-jadwal/tindakan-pengiriman";
import { KeadaanKosong } from "@/components/keadaan-kosong";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggal } from "@/domain/kalender";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import {
  bisaDibatalkan,
  daftarUsulanMenungguPersetujuan,
  riwayatKeputusanPengirimanDiLuarJadwal,
  type UsulanMenungguPersetujuan,
} from "@/server/gudang/pengiriman-di-luar-jadwal";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";

import { TindakanUsulan } from "./tindakan-usulan";

export const metadata: Metadata = {
  title: "Persetujuan jadwal — Dashboard Penjualan MANDALIKA",
};

/** Jadwal tetap toko saat ini sebagai pembanding usulan. */
function JadwalTetap({ usulan }: { usulan: UsulanMenungguPersetujuan }) {
  const j = usulan.jadwalTetap;
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]" aria-label={`Jadwal tetap ${usulan.toko}`}>
      <dt className="font-semibold">Jadwal tetap</dt>
      <dd>
        {j === null
          ? "Tidak ada jadwal tetap aktif"
          : `${labelPola[j.pola]}: ${labelHariKirim(j.hariKirim)}${j.tanggalJangkar ? `, jangkar ${formatTanggal(j.tanggalJangkar)}` : ""}`}
      </dd>
      <dt className="font-semibold">Usulan</dt>
      <dd>
        {teksJenis(usulan)} → {teksTanggalKirim(usulan)}
      </dd>
      <dt className="font-semibold">Alasan</dt>
      <dd>{usulan.alasan}</dd>
    </dl>
  );
}

/**
 * Zona kerja (DESIGN §1). Persetujuan jadwal (T113, PRD A5 ▶ Revisi 2026-10-13): usulan pengiriman di luar jadwal yang
 * menunggu beserta jadwal tetap toko sebagai pembanding, lalu Setujui/Tolak; di bawahnya riwayat keputusan (terbaru
 * dulu) dengan "Batalkan" untuk pengiriman berlaku yang tanggalnya belum lewat dan belum final. Hanya admin; selain admin
 * mendapat 404.
 */
export default async function HalamanPersetujuanJadwal() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const hariIni = tanggalWib(new Date());
  const [daftarUsulan, riwayat] = await Promise.all([daftarUsulanMenungguPersetujuan(), riwayatKeputusanPengirimanDiLuarJadwal()]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Persetujuan jadwal</h1>
      <p className="text-muted-foreground">
        Usulan pengiriman di luar jadwal dari operator gudang selain Pusat. Jadwal tetap toko tidak berubah.
      </p>

      <h2 className="text-xl font-semibold">Usulan menunggu</h2>
      {daftarUsulan.length === 0 ? (
        <KeadaanKosong
          ikon={Inbox}
          judul="Tidak ada usulan pengiriman di luar jadwal yang menunggu persetujuan."
          langkah="Usulan baru dari operator gudang akan muncul di sini untuk disetujui atau ditolak."
        />
      ) : (
        <ul className="flex flex-col gap-6" aria-label="Usulan pengiriman di luar jadwal menunggu persetujuan">
          {daftarUsulan.map((u) => (
            <li key={u.id} data-usulan={u.id}>
              <Card>
                <CardHeader className="flex flex-col gap-2">
                  <CardTitle>
                    {u.toko}
                    <span className="font-normal text-muted-foreground"> · {u.gudang}</span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3">
                    <BadgeStatusPengiriman status="menunggu" />
                    <span className="font-semibold">
                      {teksJenis(u)} · {teksTanggalKirim(u)}
                    </span>
                  </div>
                  <CardDescription>
                    Diusulkan {u.pengusul}, {formatWaktu(u.diusulkanPada)}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <JadwalTetap usulan={u} />
                  <TindakanUsulan id={u.id} toko={u.toko} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-xl font-semibold">Riwayat keputusan</h2>
      <TabelRiwayatPengiriman
        label="Riwayat keputusan pengiriman di luar jadwal"
        daftar={riwayat}
        tampilkanGudang
        tindakan={(e) =>
          bisaDibatalkan(e, hariIni) ? (
            <FormBatalkanPengiriman id={e.id} idGudang={null} toko={e.toko} tanggal={teksTanggalKirim(e)} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        kosong="Belum ada keputusan pengiriman di luar jadwal."
      />
    </main>
  );
}
