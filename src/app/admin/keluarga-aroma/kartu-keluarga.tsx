"use client";

import { Archive } from "lucide-react";
import { useId, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan, type HasilSimpan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { hapusAlias, hapusSegmenKode, tambahAlias, tambahSegmenKode, ubahKeluargaAroma } from "./aksi";

export type DataKeluarga = {
  id: number;
  nama: string;
  aktif: boolean;
  alias: { id: number; alias: string }[];
  segmen: { id: number; segmen: string }[];
};

function BadgeStatusKeluarga({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted" data-status="nonaktif">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

/** Ubah nama dan status keluarga. */
function FormUbahKeluarga({ keluarga }: { keluarga: DataKeluarga }) {
  const id = useId();
  const [nama, setNama] = useState(keluarga.nama);
  const [status, setStatus] = useState(keluarga.aktif ? "aktif" : "nonaktif");
  const { tampilan, menunggu, berubah, tandaiBerubah, simpan } = usePenyimpanan("daftar keluarga aroma");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        simpan(() => ubahKeluargaAroma({ idKeluarga: keluarga.id, nama, aktif: status === "aktif" }));
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-2 font-semibold" htmlFor={`${id}-nama`}>
          Nama keluarga
          <Input
            id={`${id}-nama`}
            ukuran="tabel"
            required
            autoComplete="off"
            value={nama}
            onChange={(e) => {
              setNama(e.target.value);
              tandaiBerubah();
            }}
          />
        </label>
        <div className="flex flex-col gap-2 font-semibold">
          <span id={`${id}-status`}>Status</span>
          <Select
            value={status}
            onValueChange={(nilai) => {
              setStatus(nilai);
              tandaiBerubah();
            }}
          >
            <SelectTrigger ukuran="tabel" className="w-36" aria-labelledby={`${id}-status`}>
              <SelectValue>{status === "aktif" ? "Aktif" : "Nonaktif"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aktif">Aktif</SelectItem>
              <SelectItem value="nonaktif">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={!berubah || menunggu}>
          Simpan keluarga
        </Button>
      </div>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </form>
  );
}

type Entri = { id: number; teks: string };

/** Daftar entri (alias atau segmen kode) dengan tambah/hapus; satu pesan status untuk bagian ini. */
function BagianEntri({
  judul,
  jenis,
  labelBaru,
  keterangan,
  kosong,
  entri,
  yangDiperiksa,
  tambah,
  hapus,
}: {
  judul: string;
  /** Kata untuk label tombol, mis. "alias" atau "segmen kode". */
  jenis: string;
  labelBaru: string;
  keterangan: string;
  kosong: string;
  entri: Entri[];
  yangDiperiksa: string;
  tambah: (teks: string) => Promise<HasilSimpan>;
  hapus: (id: number) => Promise<HasilSimpan>;
}) {
  const id = useId();
  const [teks, setTeks] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan(yangDiperiksa);

  return (
    <section aria-labelledby={`${id}-judul`} className="flex flex-col gap-3">
      <h4 id={`${id}-judul`} className="font-semibold">
        {judul}
      </h4>
      {entri.length === 0 ? (
        <p className="text-muted-foreground">{kosong}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60">
          {entri.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-1">
              <span className="font-semibold">{e.teks}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={menunggu}
                aria-label={`Hapus ${jenis} ${e.teks}`}
                onClick={() => simpan(() => hapus(e.id))}
              >
                Hapus
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(() => tambah(teks), () => setTeks(""));
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-2 font-semibold" htmlFor={`${id}-baru`}>
          {labelBaru}
          <Input
            id={`${id}-baru`}
            ukuran="tabel"
            required
            autoComplete="off"
            aria-describedby={`${id}-keterangan`}
            value={teks}
            onChange={(e) => {
              setTeks(e.target.value);
              tandaiBerubah();
            }}
          />
          <span id={`${id}-keterangan`} className="text-sm font-normal text-muted-foreground">
            {keterangan}
          </span>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={menunggu}>
          Tambah {jenis}
        </Button>
      </form>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </section>
  );
}

export function KartuKeluarga({ keluarga }: { keluarga: DataKeluarga }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{keluarga.nama}</CardTitle>
        <BadgeStatusKeluarga aktif={keluarga.aktif} />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FormUbahKeluarga keluarga={keluarga} />
        <BagianEntri
          judul="Alias"
          jenis="alias"
          labelBaru="Alias baru"
          keterangan="Disimpan dalam huruf besar dengan spasi dirapikan. Satu alias hanya untuk satu keluarga."
          kosong="Belum ada alias."
          entri={keluarga.alias.map((a) => ({ id: a.id, teks: a.alias }))}
          yangDiperiksa={`alias keluarga ${keluarga.nama}`}
          tambah={(alias) => tambahAlias({ idKeluarga: keluarga.id, alias })}
          hapus={(idAlias) => hapusAlias({ idAlias })}
        />
        <BagianEntri
          judul="Segmen kode"
          jenis="segmen kode"
          labelBaru="Segmen kode baru"
          keterangan="Satu bagian kode produk di antara tanda hubung, mis. GOR. Produk yang kodenya memuat segmen ini mendapat usulan keluarga ini di halaman Pemetaan produk."
          kosong="Belum ada segmen kode."
          entri={keluarga.segmen.map((s) => ({ id: s.id, teks: s.segmen }))}
          yangDiperiksa={`segmen kode keluarga ${keluarga.nama}`}
          tambah={(segmen) => tambahSegmenKode({ idKeluarga: keluarga.id, segmen })}
          hapus={(idSegmen) => hapusSegmenKode({ idSegmen })}
        />
      </CardContent>
    </Card>
  );
}
