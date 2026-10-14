import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// DESIGN §6. Gerak zona kerja: hanya warna dan bayangan. Scale untuk zona suasana ditambahkan lewat className.
// `buttonVariants` diekspor agar tautan (`<Link>`) bisa tampil sebagai tombol, mis. pintasan di beranda (T79).
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground shadow-soft hover:bg-secondary/90",
        outline: "border-2 border-primary bg-transparent text-primary hover:bg-primary/10",
        ghost: "text-primary hover:bg-primary/10",
        destructive: "bg-destructive text-secondary-foreground shadow-soft hover:bg-destructive/90",
        // DESIGN §11.3: tindakan merusak di setiap baris tabel/daftar memakai garis bernada destructive, bukan merah penuh.
        destructiveOutline: "border-2 border-destructive bg-transparent text-destructive hover:bg-destructive/10",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        // DESIGN §6 ▶ Revisi (2026-10-13 sore): 44 px (§9). `sm` hanya di dalam tabel dan baris filter.
        default: "h-11 px-5 text-sm",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * DESIGN §11.8: satu gaya tautan-tombol (tautan `<Link>`, `<summary>`, atau tombol bergaya tautan) untuk semua halaman.
 * - `nada`: `primary` (bawaan); `barisTerpilih` di atas latar accent (DESIGN §2: primary di atas accent < 4,5 : 1);
 *   `terpilih` untuk chip/pilihan yang sedang dipilih; `netral` untuk pilihan filter yang belum dipilih.
 * - `ukuran`: `default` target sentuh 44 px (§9); `ringkas` setinggi isian tabel (h-9) di baris tabel ringkas (§11.4).
 */
export const tautanTombolVariants = cva(
  "inline-flex w-fit items-center gap-2 rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      nada: {
        primary: "text-primary hover:bg-primary/10",
        barisTerpilih: "text-accent-foreground hover:bg-accent-foreground/10",
        terpilih: "bg-accent text-accent-foreground",
        netral: "text-foreground hover:bg-primary/10 hover:text-primary",
      },
      garisBawah: {
        true: "underline underline-offset-4",
        false: "",
      },
      ukuran: {
        default: "min-h-11",
        ringkas: "min-h-9",
      },
    },
    defaultVariants: {
      nada: "primary",
      garisBawah: false,
      ukuran: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
