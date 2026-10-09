"use client";

import { useActionState, useId } from "react";

import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { masuk } from "./aksi";

export function FormMasuk() {
  const id = useId();
  const [hasil, aksi, menunggu] = useActionState(masuk, null);

  return (
    <form action={aksi} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-email`}>
        Email
        <Input
          key={hasil?.email}
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={hasil?.email}
        />
      </label>
      <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-sandi`}>
        Kata sandi
        <Input id={`${id}-sandi`} name="sandi" type="password" required autoComplete="current-password" />
      </label>
      {hasil ? <PesanStatusSimpan keadaan="gagal" pesan={hasil.pesan} /> : null}
      <Button type="submit" size="lg" disabled={menunggu} className="hover:scale-105 active:scale-95">
        {menunggu ? "Sedang masuk…" : "Masuk"}
      </Button>
    </form>
  );
}
