"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SEMUA } from "./filter";

function Pilihan({
  label,
  name,
  terapan,
  opsi,
}: {
  label: string;
  name: string;
  terapan: string;
  opsi: readonly { nilai: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-56 flex-col gap-2 font-semibold">
      <span id={id}>{label}</span>
      <Select name={name} defaultValue={terapan}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue>{opsi.find((o) => o.nilai === terapan)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {opsi.map((o) => (
            <SelectItem key={o.nilai} value={o.nilai}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Filter riwayat rencana final (T63): tanggal kirim dan toko, ditambah cari nama toko (T119). Terapkan menulis pilihan
 * ke URL (`?tanggal=YYYY-MM-DD&toko=<id>&cari=`) dan kembali ke halaman 1; halaman menyaring di server.
 */
export function FilterRencanaFinal({
  action,
  tanggalKirim,
  toko,
  terapan,
}: {
  action: string;
  /** Tanggal kirim yang punya rencana final, beserta teks tampilnya. */
  tanggalKirim: readonly { nilai: string; label: string }[];
  toko: readonly { id: number; nama: string }[];
  terapan: { tanggal: string; toko: string; cari: string };
}) {
  const idCari = useId();
  return (
    <Form action={action} data-filter-rencana-final className="flex flex-wrap items-end gap-4">
      <Pilihan label="Tanggal kirim" name="tanggal" terapan={terapan.tanggal} opsi={[{ nilai: SEMUA, label: "Semua tanggal kirim" }, ...tanggalKirim]} />
      <Pilihan
        label="Toko"
        name="toko"
        terapan={terapan.toko}
        opsi={[{ nilai: SEMUA, label: "Semua toko" }, ...toko.map((t) => ({ nilai: String(t.id), label: t.nama }))]}
      />
      <div className="flex min-w-56 flex-col gap-2 font-semibold">
        <label htmlFor={idCari}>Cari toko</label>
        <div className="flex items-center gap-2">
          <Search aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
          <Input id={idCari} type="search" name="cari" autoComplete="off" placeholder="Nama toko" defaultValue={terapan.cari} />
        </div>
      </div>
      <Button type="submit" className="active:scale-95">
        Terapkan
      </Button>
    </Form>
  );
}
