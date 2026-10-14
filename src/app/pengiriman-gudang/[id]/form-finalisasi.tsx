"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";

import { formatAngka } from "@/app/admin/impor/format";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";
import { Input } from "@/components/ui/input";
import { formatTanggal, type TanggalBisnis } from "@/domain/kalender";

import { finalisasiRencana, type HasilAksiFinalisasi } from "./aksi-final";
import { bacaIsianLokal, kunciIsianLokal, langgananIsianLokal, teksStok, uraiIsianLokal } from "./isian-lokal";

/**
 * Form finalisasi rencana satu toko (T62; PRD A7). Tampil hanya untuk operator dengan hak `finalisasi` pada toko yang
 * siap difinalisasi; server action memeriksa hak dan syaratnya lagi. `versi` = versi toko draft yang sedang dilihat, agar
 * yang difinalisasi sama dengan yang diperiksa. Selama ada isian stok toko ini yang belum disimpan (T59), finalisasi
 * ditahan karena rencana final memakai stok yang tersimpan. Toko yang sudah final (`versiFinal`) difinalisasi ulang
 * dengan alasan wajib (diperiksa lagi di server); versi baru menggantikan versi sebelumnya dan versi lama tetap tersimpan
 * (PRD A7 ▶ Keputusan 2026-10-11, T62). Setelah berhasil, layar rencana final dibuka.
 *
 * Rencana final hanya dibuat setelah dikonfirmasi di dialog konfirmasi yang meringkas toko, tanggal kirim, jumlah varian,
 * total jumlah kirim, dan peringatan yang masih tampil (DESIGN §11.3, T109).
 *
 * Form ini berada di kepala toko yang menempel (T117; DESIGN §11.4), jadi tampil ringkas dalam satu baris: alasan
 * finalisasi ulang (bila perlu), penahan stok belum disimpan, tombol, dan status. Penjelasan bahwa finalisasi bukan
 * konfirmasi pengiriman fisik tampil di dialog konfirmasi; versi yang digantikan disebut di akibat dialog.
 */
export function FormFinalisasi({
  idGudang,
  tanggalKirim,
  tokoId,
  namaToko,
  versi,
  versiFinal,
  stokTersimpan,
  ringkasan,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  tokoId: number;
  namaToko: string;
  versi: string;
  /** Versi rencana final terakhir toko ini; `null` = belum pernah final. */
  versiFinal: number | null;
  stokTersimpan: readonly { kodeProduk: string; stokAkhir: number | null }[];
  /** Isi ringkasan di dialog konfirmasi; `peringatan` = teks peringatan toko ini yang masih tampil di draft. */
  ringkasan: { jumlahVarian: number; totalJumlahKirim: number; peringatan: readonly string[] };
}) {
  const router = useRouter();
  const id = useId();
  const [alasan, setAlasan] = useState("");
  const [konfirmasiTerbuka, setKonfirmasiTerbuka] = useState(false);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilAksiFinalisasi>("rencana final toko ini");
  const ulang = versiFinal !== null;
  const kunci = kunciIsianLokal(idGudang, tanggalKirim, tokoId);
  const teksLokal = useSyncExternalStore(
    langgananIsianLokal,
    () => bacaIsianLokal(kunci),
    () => null,
  );
  const lokal = uraiIsianLokal(teksLokal, new Set(stokTersimpan.map((s) => s.kodeProduk)));
  const stokBelumDisimpan = stokTersimpan.some((s) => s.kodeProduk in lokal && lokal[s.kodeProduk] !== teksStok(s.stokAkhir));

  function finalisasi() {
    // Hasil berhasil dan tersimpan-gagal-muat-ulang sama-sama membawa id rencana final untuk layar berhasil.
    let idRencana: number | null = null;
    simpan(
      async () => {
        const hasil = await finalisasiRencana(
          ulang ? { idGudang, tanggalKirim, tokoId, versi, alasanFinalisasiUlang: alasan } : { idGudang, tanggalKirim, tokoId, versi },
        );
        if (hasil.keadaan !== "gagal") idRencana = hasil.idRencana;
        return hasil;
      },
      () => {
        if (idRencana !== null) router.push(`/pengiriman-gudang/${idGudang}/rencana-final/${idRencana}`);
      },
    );
  }

  return (
    <form
      data-finalisasi-toko={tokoId}
      data-finalisasi-ulang={ulang ? "" : undefined}
      aria-label={`Finalisasi rencana ${namaToko}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        setKonfirmasiTerbuka(true);
      }}
    >
      {ulang ? (
        <label className="flex items-center gap-2 font-semibold" htmlFor={`${id}-alasan`}>
          Alasan finalisasi ulang
          <Input
            id={`${id}-alasan`}
            name="alasan"
            required
            ukuran="tabel"
            value={alasan}
            onChange={(e) => {
              setAlasan(e.target.value);
              tandaiBerubah();
            }}
            className="w-56"
          />
        </label>
      ) : null}
      {stokBelumDisimpan ? (
        <PesanStatusSimpan
          data-finalisasi-stok-belum-disimpan
          keadaan="belumDisimpan"
          pesan="Simpan stok lebih dulu, lalu finalisasi."
        />
      ) : null}
      <Button
        type="submit"
        disabled={menunggu || stokBelumDisimpan || (ulang && alasan.trim() === "")}
        className="w-fit active:scale-95"
      >
        {ulang ? "Finalisasi ulang" : "Finalisasi rencana"}
        <span className="sr-only"> {namaToko}</span>
      </Button>
      {tampilan ? (
        <PesanStatusSimpan
          keadaan={tampilan.keadaan}
          pesan={tampilan.pesan}
          label={tampilan.keadaan === "menyimpan" ? "Sedang memfinalisasi" : undefined}
        />
      ) : null}
      <DialogKonfirmasi
        terbuka={konfirmasiTerbuka}
        ubahTerbuka={setKonfirmasiTerbuka}
        judul={ulang ? `Finalisasi ulang rencana ${namaToko}?` : `Finalisasi rencana ${namaToko}?`}
        akibat={
          ulang
            ? `Versi ${versiFinal + 1} disimpan dan menggantikan versi ${versiFinal}; versi ${versiFinal} tetap tersimpan.`
            : "Rencana kebutuhan barang toko ini disimpan sebagai rencana final dan tidak berubah oleh pembaruan data berikutnya."
        }
        labelTindakan={ulang ? "Finalisasi ulang" : "Finalisasi"}
        konfirmasi={finalisasi}
      >
        <dl data-ringkasan-finalisasi className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Toko</dt>
          <dd className="font-semibold">{namaToko}</dd>
          <dt className="text-muted-foreground">Tanggal kirim</dt>
          <dd className="font-semibold">{formatTanggal(tanggalKirim)}</dd>
          <dt className="text-muted-foreground">Jumlah varian</dt>
          <dd className="font-semibold tabular-nums">{formatAngka(ringkasan.jumlahVarian)}</dd>
          <dt className="text-muted-foreground">Total jumlah kirim</dt>
          <dd className="font-semibold tabular-nums">{formatAngka(ringkasan.totalJumlahKirim)}</dd>
        </dl>
        <p data-penjelasan-finalisasi>
          Finalisasi menyimpan rencana kebutuhan barang toko ini beserta dasar perhitungannya. Ini bukan konfirmasi
          pengiriman fisik atau penerimaan barang.
        </p>
        {ringkasan.peringatan.map((teks) => (
          <p key={teks} data-peringatan-finalisasi className="flex items-start gap-2 font-semibold">
            <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
            {teks}
          </p>
        ))}
      </DialogKonfirmasi>
    </form>
  );
}
