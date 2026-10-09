"use client";

import { Archive } from "lucide-react";
import { useId, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { hapusAlias, tambahAlias, ubahKeluargaAroma } from "./aksi";

export type DataKeluarga = { id: number; nama: string; aktif: boolean; alias: { id: number; alias: string }[] };

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

/** Daftar alias dengan tambah/hapus; satu pesan status untuk bagian alias. */
function BagianAlias({ keluarga }: { keluarga: DataKeluarga }) {
  const id = useId();
  const [alias, setAlias] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan(`alias keluarga ${keluarga.nama}`);

  return (
    <section aria-labelledby={`${id}-judul`} className="flex flex-col gap-3">
      <h4 id={`${id}-judul`} className="font-semibold">
        Alias
      </h4>
      {keluarga.alias.length === 0 ? (
        <p className="text-muted-foreground">Belum ada alias.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60">
          {keluarga.alias.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-1">
              <span className="font-semibold">{a.alias}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={menunggu}
                aria-label={`Hapus alias ${a.alias}`}
                onClick={() => simpan(() => hapusAlias({ idAlias: a.id }))}
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
          simpan(() => tambahAlias({ idKeluarga: keluarga.id, alias }), () => setAlias(""));
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-2 font-semibold" htmlFor={`${id}-alias`}>
          Alias baru
          <Input
            id={`${id}-alias`}
            ukuran="tabel"
            required
            autoComplete="off"
            aria-describedby={`${id}-alias-keterangan`}
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value);
              tandaiBerubah();
            }}
          />
          <span id={`${id}-alias-keterangan`} className="text-sm font-normal text-muted-foreground">
            Disimpan dalam huruf besar dengan spasi dirapikan. Satu alias hanya untuk satu keluarga.
          </span>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={menunggu}>
          Tambah alias
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
        <BagianAlias keluarga={keluarga} />
      </CardContent>
    </Card>
  );
}
