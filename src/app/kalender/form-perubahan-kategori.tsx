"use client";

import { useId, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { daftarKategoriDasar, type KategoriDasar } from "@/domain/kalender";

import { batalkanPerubahanKategori, buatPerubahanKategori, revisiPerubahanKategori } from "./aksi";

/** Perubahan aktif yang berlaku untuk satu cakupan pada tanggal terpilih (revisi aktif terbaru), siap tampil. */
export type DataPerubahanBerlaku = {
  idToko: number | null;
  cakupan: string;
  kategoriSebelum: KategoriDasar;
  kategoriSesudah: KategoriDasar;
  alasan: string;
  revisi: number;
  /** Pelaku dan waktu, mis. `Admin Satu, Jumat, 09-10-2026 pukul 14.05 WIB`. */
  dibuat: string;
};

type Toko = { id: number; nama: string };

const SELURUH_TOKO = "seluruh";
const LABEL_SELURUH_TOKO = "Seluruh toko";
const kelasLabel = "flex flex-col gap-2 font-semibold";

function PilihKategori({ id, nilai, ubah }: { id: string; nilai: string; ubah: (nilai: string) => void }) {
  return (
    <div className={kelasLabel}>
      <span id={id}>Kategori baru</span>
      <Select value={nilai} onValueChange={ubah}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue placeholder="Pilih kategori">{nilai || undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {daftarKategoriDasar.map((k) => (
            <SelectItem key={k} value={k}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function IsianAlasan({ id, label, nilai, ubah }: { id: string; label: string; nilai: string; ubah: (nilai: string) => void }) {
  return (
    <label className={kelasLabel} htmlFor={id}>
      {label}
      <Input id={id} name="alasan" required value={nilai} onChange={(e) => ubah(e.target.value)} />
    </label>
  );
}

function kategoriSah(nilai: string): nilai is KategoriDasar {
  return (daftarKategoriDasar as readonly string[]).includes(nilai);
}

/** Mengganti kategori perubahan aktif menjadi revisi baru pada tanggal + cakupan yang sama. */
function FormRevisi({ tanggal, perubahan }: { tanggal: string; perubahan: DataPerubahanBerlaku }) {
  const id = useId();
  const [kategori, setKategori] = useState("");
  const [alasan, setAlasan] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("perubahan kategori tanggal ini");
  const sah = kategoriSah(kategori) && alasan.trim() !== "";

  return (
    <form
      className="flex flex-col gap-3"
      aria-label={`Ubah kategori ${perubahan.cakupan}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!kategoriSah(kategori)) return;
        simpan(
          () => revisiPerubahanKategori({ tanggal, idToko: perubahan.idToko, kategoriBaru: kategori, alasan }),
          () => {
            setKategori("");
            setAlasan("");
          },
        );
      }}
    >
      <PilihKategori
        id={`${id}-kategori`}
        nilai={kategori}
        ubah={(nilai) => {
          setKategori(nilai);
          tandaiBerubah();
        }}
      />
      <IsianAlasan
        id={`${id}-alasan`}
        label="Alasan"
        nilai={alasan}
        ubah={(nilai) => {
          setAlasan(nilai);
          tandaiBerubah();
        }}
      />
      <Button type="submit" variant="outline" disabled={menunggu || !sah} className="self-start active:scale-95">
        Simpan revisi
      </Button>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </form>
  );
}

/** Membatalkan seluruh perubahan aktif pada tanggal + cakupan, dengan alasan pembatalan. */
function FormBatal({ tanggal, perubahan }: { tanggal: string; perubahan: DataPerubahanBerlaku }) {
  const id = useId();
  const [alasan, setAlasan] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("perubahan kategori tanggal ini");

  return (
    <form
      className="flex flex-col gap-3"
      aria-label={`Batalkan perubahan ${perubahan.cakupan}`}
      onSubmit={(event) => {
        event.preventDefault();
        simpan(() => batalkanPerubahanKategori({ tanggal, idToko: perubahan.idToko, alasan }));
      }}
    >
      <IsianAlasan
        id={`${id}-alasan`}
        label="Alasan pembatalan"
        nilai={alasan}
        ubah={(nilai) => {
          setAlasan(nilai);
          tandaiBerubah();
        }}
      />
      <Button type="submit" variant="destructive" disabled={menunggu || alasan.trim() === ""} className="self-start active:scale-95">
        Batalkan perubahan
      </Button>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </form>
  );
}

function ItemPerubahan({ tanggal, perubahan }: { tanggal: string; perubahan: DataPerubahanBerlaku }) {
  const isian: [string, string][] = [
    ["Kategori", `${perubahan.kategoriSebelum} → ${perubahan.kategoriSesudah}`],
    ["Alasan", perubahan.alasan],
    ["Revisi", String(perubahan.revisi)],
    ["Oleh", perubahan.dibuat],
  ];
  return (
    <li
      data-perubahan-cakupan={perubahan.idToko ?? SELURUH_TOKO}
      className="flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold break-all">{perubahan.cakupan}</h4>
        <BadgeStatus status="aktif" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {isian.map(([label, nilai]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">{nilai}</dd>
          </div>
        ))}
      </dl>
      <FormRevisi tanggal={tanggal} perubahan={perubahan} />
      <FormBatal tanggal={tanggal} perubahan={perubahan} />
    </li>
  );
}

/** Membuat perubahan kategori untuk seluruh toko atau satu toko. */
function FormBuat({ tanggal, daftarToko }: { tanggal: string; daftarToko: Toko[] }) {
  const id = useId();
  const [cakupan, setCakupan] = useState(SELURUH_TOKO);
  const [kategori, setKategori] = useState("");
  const [alasan, setAlasan] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("perubahan kategori tanggal ini");
  const sah = kategoriSah(kategori) && alasan.trim() !== "";
  const labelCakupan = cakupan === SELURUH_TOKO ? LABEL_SELURUH_TOKO : daftarToko.find((t) => String(t.id) === cakupan)?.nama;

  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4"
      aria-labelledby={`${id}-judul`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!kategoriSah(kategori)) return;
        const idToko = cakupan === SELURUH_TOKO ? null : Number(cakupan);
        simpan(
          () => buatPerubahanKategori({ tanggal, idToko, kategoriBaru: kategori, alasan }),
          () => {
            setKategori("");
            setAlasan("");
          },
        );
      }}
    >
      <h4 id={`${id}-judul`} className="font-semibold">
        Buat perubahan kategori
      </h4>
      <div className={kelasLabel}>
        <span id={`${id}-cakupan`}>Cakupan</span>
        <Select
          value={cakupan}
          onValueChange={(nilai) => {
            setCakupan(nilai);
            tandaiBerubah();
          }}
        >
          <SelectTrigger aria-labelledby={`${id}-cakupan`}>
            <SelectValue>{labelCakupan}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELURUH_TOKO}>{LABEL_SELURUH_TOKO}</SelectItem>
            {daftarToko.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.nama}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PilihKategori
        id={`${id}-kategori`}
        nilai={kategori}
        ubah={(nilai) => {
          setKategori(nilai);
          tandaiBerubah();
        }}
      />
      <IsianAlasan
        id={`${id}-alasan`}
        label="Alasan"
        nilai={alasan}
        ubah={(nilai) => {
          setAlasan(nilai);
          tandaiBerubah();
        }}
      />
      <Button type="submit" disabled={menunggu || !sah} className="self-start active:scale-95">
        Simpan perubahan
      </Button>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </form>
  );
}

/**
 * Perubahan kategori manual pada tanggal terpilih (T42, PRD B4): perubahan aktif per cakupan dengan form revisi dan
 * batal, lalu form untuk membuat perubahan baru. Hanya dirender untuk admin; aksi diperiksa lagi di server.
 */
export function PerubahanKategoriTanggal({
  tanggal,
  daftarPerubahan,
  daftarToko,
}: {
  tanggal: string;
  daftarPerubahan: DataPerubahanBerlaku[];
  daftarToko: Toko[];
}) {
  const id = useId();
  return (
    <section data-perubahan-kategori={tanggal} aria-labelledby={`${id}-judul`}>
      <Card>
        <CardHeader>
          <CardTitle id={`${id}-judul`}>Perubahan kategori</CardTitle>
          <CardDescription>
            Mengganti kategori yang dipakai untuk menghitung. Bulan dan minggu laporan tetap. Setiap perubahan membuat
            laporan dihitung ulang.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {daftarPerubahan.length === 0 ? (
            <p className="text-muted-foreground">Belum ada perubahan aktif pada tanggal ini.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {daftarPerubahan.map((p) => (
                <ItemPerubahan key={p.idToko ?? SELURUH_TOKO} tanggal={tanggal} perubahan={p} />
              ))}
            </ul>
          )}
          <FormBuat tanggal={tanggal} daftarToko={daftarToko} />
        </CardContent>
      </Card>
    </section>
  );
}
