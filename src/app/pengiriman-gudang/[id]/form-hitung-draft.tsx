"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTanggal, type TanggalBisnis } from "@/domain/kalender";
import { cn } from "@/lib/utils";

import { hitungDraft } from "./aksi-draft";
import { kelasLabel } from "./bidang-jadwal";

const urlDraft = (idGudang: number, tanggal: string) => `/pengiriman-gudang/${idGudang}?tanggal=${encodeURIComponent(tanggal)}`;

/**
 * Form memilih tanggal kirim dan membuat draft rencana (T58). Tampil hanya untuk operator dengan hak `hitung-kebutuhan`;
 * server action memeriksanya lagi. Setelah tersimpan, halaman membuka draft tanggal itu. T118 (DESIGN §11.5): saran
 * tanggal kirim (tanggal kirim toko 14 hari ke depan) berupa chip yang mengisi tanggal sekali klik; tanggal lain tetap
 * bisa diketik.
 */
export function FormHitungDraft({ idGudang, saranTanggal }: { idGudang: number; saranTanggal: readonly TanggalBisnis[] }) {
  const id = useId();
  const router = useRouter();
  const [tanggalKirim, setTanggalKirim] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar draft tersimpan");

  function pilih(tanggal: string) {
    setTanggalKirim(tanggal);
    tandaiBerubah();
  }

  return (
    <form
      aria-labelledby={`${id}-judul`}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const tanggal = tanggalKirim;
        simpan(
          () => hitungDraft({ idGudang, tanggalKirim: tanggal }),
          () => router.push(urlDraft(idGudang, tanggal)),
        );
      }}
    >
      <h3 id={`${id}-judul`} className="text-lg font-semibold">
        Hitung kebutuhan
      </h3>
      {saranTanggal.length > 0 ? (
        <div role="group" aria-labelledby={`${id}-saran`} data-saran-tanggal className="flex flex-col gap-2">
          <span id={`${id}-saran`} className="font-semibold">
            Saran tanggal kirim
          </span>
          <ul className="flex flex-wrap gap-2">
            {saranTanggal.map((tanggal) => {
              const terpilih = tanggalKirim === tanggal;
              return (
                <li key={tanggal}>
                  <button
                    type="button"
                    data-saran={tanggal}
                    aria-pressed={terpilih}
                    onClick={() => pilih(tanggal)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      terpilih ? "bg-accent text-accent-foreground" : "text-primary hover:bg-primary/10",
                    )}
                  >
                    {formatTanggal(tanggal)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-4">
        <label className={kelasLabel}>
          Tanggal kirim
          <Input
            type="date"
            required
            value={tanggalKirim}
            onChange={(event) => pilih(event.target.value)}
            className="w-auto"
          />
        </label>
        <Button type="submit" disabled={menunggu || tanggalKirim === ""} className="active:scale-95">
          Hitung kebutuhan
        </Button>
      </div>
      {tampilan ? (
        <PesanStatusSimpan
          keadaan={tampilan.keadaan}
          pesan={tampilan.pesan}
          label={tampilan.keadaan === "menyimpan" ? "Sedang menghitung" : undefined}
        />
      ) : null}
    </form>
  );
}

/**
 * Ajakan menghitung draft tanggal kirim terdekat yang belum punya draft (T118, DESIGN §11.5). Tampil hanya untuk operator
 * dengan hak `hitung-kebutuhan`; server action memeriksanya lagi.
 */
export function AjakanHitung({ idGudang, tanggalKirim }: { idGudang: number; tanggalKirim: TanggalBisnis }) {
  const router = useRouter();
  const { tampilan, menunggu, simpan } = usePenyimpanan("draft rencana tanggal ini");

  return (
    <form
      data-ajakan-hitung={tanggalKirim}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        simpan(
          () => hitungDraft({ idGudang, tanggalKirim }),
          () => router.push(urlDraft(idGudang, tanggalKirim)),
        );
      }}
    >
      <Button type="submit" disabled={menunggu} className="w-fit active:scale-95">
        {`Hitung kebutuhan untuk ${formatTanggal(tanggalKirim)}`}
      </Button>
      {tampilan ? (
        <PesanStatusSimpan
          keadaan={tampilan.keadaan}
          pesan={tampilan.pesan}
          label={tampilan.keadaan === "menyimpan" ? "Sedang menghitung" : undefined}
        />
      ) : null}
    </form>
  );
}
