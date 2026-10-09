# AGENTS.md — Dashboard Penjualan MANDALIKA

Aplikasi web internal: impor penjualan Excel → laporan rata-rata bertahap → rencana jumlah kirim gudang ke toko. Antarmuka berbahasa Indonesia.

## Sumber kebenaran

- Ketika menyentuh aturan bisnis atau rumus: `docs/PRD.md` adalah satu-satunya sumber. Blok `▶ Revisi` dan `▶ Keputusan` mengalahkan teks di atasnya.
- Ketika menamai sesuatu (kode, test, issue, PR): pakai istilah `CONTEXT.md`.
- Ketika bekerja di sebuah area: baca ADR terkait di `docs/adr/`.
- Ketika tiket menyentuh hal yang belum diputuskan: lihat `docs/OPEN-DECISIONS.md`.
- Ketika menulis kode: ikuti `CODING_STANDARDS.md`.
- Ketika membuat atau mengubah tampilan: ikuti `docs/DESIGN.md`.
- Contoh hitungan yang benar: `tests/golden/` (hanya-baca).

## Cara kerja: otomatis

Tiket dikerjakan tanpa menunggu manusia, lewat skill proyek `jalankan-tiket`: koordinator → subagent `pelaksana` → subagent `peninjau` → PR → CI → merge. Pemilik produk melakukan UAT di akhir.

Satu tiket selesai = semua kriteria penerimaan tercentang, `pnpm verify` hijau, `peninjau` memberi `LULUS`, dan CI hijau. Tidak ada tambahan setelah itu.

### Ketidakjelasan

- **Teknis** (struktur kode, pola, cara menguji): putuskan, lalu catat di PR sebagai `Keputusan teknis: <apa> — <alasan> — <risiko jika salah>`.
- **Bisnis** (rumus, angka, kewenangan, apa yang dilihat pengguna, perilaku di luar issue/PRD) atau aturan yang tidak jelas/bertentangan: **jangan diputuskan.** Menebak dianggap gagal. Parkir tiket dengan label `needs-info` dan pertanyaan untuk pemilik, lalu lanjut ke tiket lain.
- **Detail visual kecil** yang tidak diatur `docs/DESIGN.md` (warna, ikon, atau jarak untuk satu elemen) adalah keputusan **teknis**. Putuskan dengan token dan ikon yang sudah ada, lalu catat sebagai keputusan teknis. Tetap parkir jika menyangkut kontras di bawah standar `docs/DESIGN.md` atau menambah elemen/perilaku baru.

## Batas scope (pagar keras)

Hasil kerja = persis isi "Dalam scope" issue:

- Tambahkan fitur, halaman, endpoint, tabel, kolom, env var, opsi, dan abstraksi **hanya** jika issue menyebutnya.
- Dependency hanya dari `.github/dependency-allowlist.txt`. Di luar daftar itu → parkir tiket.
- Refactor terbatas pada berkas yang memang diperlukan issue.
- Rumus diimplementasikan persis seperti PRD, termasuk pembulatan per tahap, walaupun terlihat bisa disederhanakan.
- Berkas terlindungi hanya diubah atas instruksi eksplisit pemilik: `docs/PRD.md`, `docs/DESIGN.md`, `docs/adr/`, `docs/OPEN-DECISIONS.md`, `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `src/domain/AGENTS.md`, `tests/golden/`, `.github/`, `.claude/`.
- Test yang merah diperbaiki di kode, bukan di fixture golden.
- Perubahan masuk ke `main` hanya lewat PR dengan CI hijau. Label `disetujui-pemilik` adalah milik pemilik. Force-push adalah tindakan manusia.

## Lingkungan

- Lokal: `docker compose up -d` (PostgreSQL + MinIO). Docker Desktop harus menyala.
- CI menyediakan PostgreSQL di `localhost:5432` (user `mandalika`, sandi `mandalika`, db `mandalika_test`) dan MinIO di `localhost:9000` (`minioadmin` / `minioadmin`). Variabel lingkungan untuk test ditulis di `.env.ci` (tanpa rahasia asli); CI memuatnya otomatis.
- CI menjalankan `pnpm verify`, lalu `pnpm test:e2e` jika skripnya ada.

## Perintah

`pnpm verify` adalah gerbang wajib. Perintah lain: lihat `package.json`.

## Agent skills

### Issue tracker

GitHub Issues di repo ini, diakses dengan `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Lima label kanonik bawaan. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` dan `docs/adr/` di root. See `docs/agents/domain.md`.
