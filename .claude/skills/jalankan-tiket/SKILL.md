---
name: jalankan-tiket
description: Kerjakan semua tiket siap di GitHub Issues secara otomatis sampai habis — pelaksana, peninjau, PR, CI, merge — satu tiket per putaran, tanpa menunggu manusia.
disable-model-invocation: true
---

# Jalankan tiket otomatis

Kamu adalah **koordinator**. Kamu tidak menulis kode aplikasi. Tugasmu: memilih tiket, mengirim subagent `pelaksana` dan `peninjau`, membuka PR, menunggu CI, dan me-merge. Kerjakan terus-menerus tanpa bertanya ke manusia dan tanpa ringkasan kemajuan di tengah jalan. Berhenti hanya karena alasan di bagian **Berhenti**.

Keadaan pekerjaan tersimpan di GitHub (issue terbuka/tertutup, label, PR). Jadi menjalankan ulang skill ini setelah terputus akan melanjutkan dari tempat terakhir.

## Putaran — ulangi sampai frontier kosong

1. **Sinkron.** Jalankan `git checkout main && git pull --ff-only`. Working tree harus bersih.
2. **Pilih tiket.** Frontier = issue terbuka berlabel `ready-for-agent` tanpa label `needs-info`, yang setiap tiket di bagian "Blocked by"-nya sudah tertutup. Cocokkan `[Txx]` dengan judul issue, lalu cek statusnya. Ambil nomor T terkecil. Jika sudah ada branch `t<nn>-…` atau PR terbuka untuk tiket itu, lanjutkan dari sana. Jika frontier kosong, lompat ke **Laporan akhir**.
3. **Mulai.** Buat branch `t<nn>-<slug>` dari `main`. Beri komentar di issue: "Mulai dikerjakan otomatis."
4. **Pelaksana.** Kirim subagent `pelaksana` dengan: nomor issue, isi lengkap beserta komentarnya (`gh issue view <n> --comments`), dan nama branch. Hasilnya salah satu dari:
   - `SELESAI` → langkah 5.
   - `PERLU-KEPUTUSAN` → **Parkir**.
   - `GAGAL` → **Parkir**.
5. **Peninjau.** Kirim subagent `peninjau` yang baru (konteks bersih) dengan: nomor issue, branch, dan basis `main`.
   - `LULUS` → langkah 6.
   - `PERBAIKI` → kirim temuannya ke `pelaksana`, lalu tinjau ulang dengan `peninjau` baru. Maksimal 3 putaran; masih `PERBAIKI` → **Parkir**.
6. **PR.** Push branch, lalu `gh pr create` dengan template. Isi: `Closes #<n>`, kriteria yang dicentang, bagian "Keputusan teknis" dari pelaksana, dan ringkasan hasil peninjau.
   - **PR sudah ada (diparkir atau masih draft):** jangan edit deskripsi PR. Push branch, lalu tulis pembaruannya sebagai komentar PR (`gh pr comment <pr> --body-file <berkas>`): keputusan pemilik yang diterapkan, keputusan teknis baru atau yang tidak berlaku lagi, dan hasil peninjau terbaru. Setelah itu jadikan siap dengan perintah tunggal `gh pr ready <pr>`.
7. **CI.** Jalankan `gh pr checks <pr> --watch`.
   - Hijau → langkah 8.
   - Merah karena test, lint, atau build → ambil log (`gh run view <run> --log-failed`), kirim ke `pelaksana`, lalu push perbaikan dan pantau lagi. Maksimal 2 putaran; masih merah → **Parkir**.
   - Merah karena **berkas terlindungi** atau **dependency di luar daftar izin** → **Parkir**. Itu keputusan pemilik.
8. **Merge.** Jalankan `gh pr merge <pr> --squash --delete-branch`. Komentari issue dengan ringkasan: apa yang dibangun, test yang ditambahkan, dan keputusan teknis. Kembali ke langkah 1.

## Parkir

Beri label `needs-info` pada issue. Tulis komentar dalam bahasa Indonesia sederhana untuk pemilik: apa yang ditanyakan atau apa yang macet, beserta pilihan jawabannya jika ada. Jika sudah ada PR, ubah menjadi draft (`gh pr ready <pr> --undo`). Kembali ke `main`, lalu lanjutkan langkah 1: tiket lain mungkin masih bisa dikerjakan.

## Berhenti

- Frontier kosong → **Laporan akhir**.
- Akses atau kuota habis → ceritakan keadaan terakhir. Menjalankan ulang `/jalankan-tiket` akan melanjutkan.

## Laporan akhir (untuk pemilik, bahasa sederhana)

- Tiket yang selesai: judul + link PR.
- Tiket yang diparkir: pertanyaan untuk pemilik, satu per tiket.
- Langkah berikutnya: jawab pertanyaan, lalu jalankan `/jalankan-tiket` lagi; atau, jika semua tiket tertutup, rencanakan tahap berikutnya.

## Pagar

- Satu tiket dalam satu waktu. `main` selalu bergerak lurus.
- Perubahan masuk ke `main` hanya lewat PR yang CI-nya hijau.
- Berkas terlindungi (daftar di AGENTS.md) dan `.github/dependency-allowlist.txt` tidak diubah. Label `disetujui-pemilik` adalah milik pemilik.
- Issue tertutup lewat merge PR (`Closes #n`), bukan ditutup manual.
- Jalankan perintah `gh` satu per satu; jangan digabung dalam satu baris (`&&`, `;`, atau pipa).
