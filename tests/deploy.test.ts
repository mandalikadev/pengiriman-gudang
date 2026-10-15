import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pagar statis untuk berkas deploy produksi (T130). Uji asap sungguhan (compose menyala, Caddy, unggahan, worker)
// dijalankan lokal dengan Docker; caranya dicatat di PR T130.

const akar = process.cwd();
const baca = (path: string) => readFileSync(join(akar, path), "utf8");

const compose = baca("deploy/compose.prod.yml");
const komposeProxy = baca("deploy/proxy/compose.yml");
const situs = baca("deploy/drp.caddy");
const envContoh = baca("deploy/.env.produksi.example");
const workflow = baca(".github/workflows/deploy.yml");
const migrasi = baca("deploy/migrasi.sh");
const bootstrap = baca("deploy/bootstrap-vps.sh");
const deploySh = baca("deploy/deploy.sh");
const backupLuar = baca("deploy/backup-luar.sh");

// Blok satu layanan di compose.prod.yml (dari `  <nama>:` sampai layanan atau blok tingkat atas berikutnya).
const blokLayanan = (nama: string) => compose.match(new RegExp(`^ {2}${nama}:\\n(?: {4}.*\\n|\\s*#.*\\n|\\n)*`, "m"))?.[0] ?? "";

const tanpaKomentar = (isi: string) =>
  isi
    .split("\n")
    .filter((baris) => !/^\s*#/.test(baris))
    .join("\n");

describe("deploy/compose.prod.yml", () => {
  it("tidak memublikasikan port ke host", () => {
    expect(tanpaKomentar(compose)).not.toMatch(/^\s*(ports|expose)\s*:/m);
  });

  it("nama compose project drp, image dan alias network berawalan drp", () => {
    expect(compose).toMatch(/^name: drp$/m);
    for (const [, image] of compose.matchAll(/^\s*image:\s*(\S+)/gm)) {
      if (image.startsWith("postgres:") || image.startsWith("pgsty/minio:") || image.startsWith("rclone/rclone:")) continue;
      expect(image).toMatch(/^drp-/);
    }
    const alias = [...compose.matchAll(/aliases:\n\s*- (\S+)/g)].map(([, nama]) => nama);
    expect(alias).toEqual(["drp-minio", "drp-app"]);
    expect(compose).not.toMatch(/container_name:/);
  });

  it("network proxy eksternal; app dan worker menunggu migrasi selesai sukses", () => {
    expect(compose).toMatch(/^ {2}proxy:\n {4}external: true$/m);
    expect(compose.match(/condition: service_completed_successfully/g)).toHaveLength(2);
  });

  it("memakai image MinIO yang sama dengan docker-compose.yml pengembangan", () => {
    const imageDev = baca("docker-compose.yml").match(/image:\s*(pgsty\/minio:\S+)/)?.[1];
    expect(imageDev).toBeDefined();
    expect(compose).toContain(`image: ${imageDev}`);
  });
});

describe("layanan backup-luar (T131, T132)", () => {
  const blok = blokLayanan("backup-luar");

  it("image resmi rclone/rclone dengan versi dipatok", () => {
    expect(blok).toMatch(/^ {4}image: rclone\/rclone:\d+\.\d+\.\d+$/m);
  });

  it("membaca dump dan folder token hanya-baca, token dari /opt/drp/rahasia di luar repo", () => {
    expect(blok).toContain("- /opt/drp/backup:/backup:ro");
    expect(blok).toContain("- /opt/drp/rahasia:/rahasia:ro");
    expect(blok).toContain("init: true");
  });

  it("remote gdrive: drive dengan scope drive.file, tanpa service account, team drive, atau client sendiri", () => {
    const gdrive = blok
      .split("\n")
      .filter((baris) => /^\s*RCLONE_CONFIG_GDRIVE_/.test(baris))
      .map((baris) => baris.trim());
    expect(gdrive).toEqual(["RCLONE_CONFIG_GDRIVE_TYPE: drive", "RCLONE_CONFIG_GDRIVE_SCOPE: drive.file"]);
    for (const isi of [compose, backupLuar]) {
      expect(isi).not.toMatch(/service_account|SERVICE_ACCOUNT|team_drive|TEAM_DRIVE|CLIENT_ID|CLIENT_SECRET/);
    }
  });

  it("konfigurasi rclone sementara di tmpfs, sehingga berkas token tidak pernah ditulis", () => {
    expect(blok).toContain("RCLONE_CONFIG: /tmp/rclone.conf");
    expect(blok).toMatch(/^ {4}tmpfs:\n {6}- \/tmp$/m);
  });

  it("membaca MinIO lewat network internal, hanya network default", () => {
    expect(blok).toContain("RCLONE_CONFIG_MINIO_ENDPOINT: http://minio:9000");
    expect(blok).toMatch(/networks:\n {6}- default\n/);
    expect(blok).not.toMatch(/proxy/);
  });

  it("deploy.sh dan bootstrap membuat folder rahasia milik user deploy (chmod 700)", () => {
    for (const isi of [deploySh, bootstrap]) {
      expect(isi).toContain(`[[ -d "$DIR_DRP/rahasia" ]] || install -d -m 700 "$DIR_DRP/rahasia"`);
    }
  });
});

describe("deploy/backup-luar.sh", () => {
  const perintah = tanpaKomentar(backupLuar);

  it("tanpa berkas token hanya mencatat belum dikonfigurasi lalu tidur, tanpa menjalankan rclone", () => {
    expect(perintah).toContain("BERKAS_TOKEN=/rahasia/google-drive-token.json");
    expect(perintah).toMatch(
      /if \[ ! -f "\$BERKAS_TOKEN" \]; then\n\s*log "Backup luar belum dikonfigurasi: \/opt\/drp\/rahasia\/google-drive-token\.json belum ada[^\n]*\n[^\n]*\n\s*exec sleep infinity\n/,
    );
    expect(perintah.indexOf("exec sleep infinity")).toBeLessThan(perintah.indexOf("rclone "));
  });

  it("token dibaca dari berkas setiap putaran sesudah menunggu jadwal, ke konfigurasi sementara", () => {
    expect(perintah).toMatch(/tr -d '\\r\\n' < "\$BERKAS_TOKEN"/);
    expect(perintah).toContain(`printf '[gdrive]\\ntoken = %s\\n' "$token" > "\${RCLONE_CONFIG:?}"`);
    const tidur = perintah.indexOf("sleep $((target - sekarang))");
    expect(tidur).toBeGreaterThan(0);
    expect(perintah.indexOf("if ! muat_token; then", tidur)).toBeGreaterThan(tidur);
  });

  it("tujuan folder Backup DRP di root My Drive", () => {
    expect(perintah).toContain('TUJUAN="gdrive:Backup DRP/drp"');
    const tujuanRclone = [...perintah.matchAll(/rclone \w+ [^\n]*/g)].map(([baris]) => baris).filter((baris) => /gdrive:|TUJUAN/.test(baris));
    expect(tujuanRclone).toHaveLength(3);
    for (const baris of tujuanRclone) expect(baris).not.toContain("gdrive:");
  });

  it("menyalin dump terbaru, copy (bukan sync) bucket ke workbook, menghapus hanya dump lebih tua dari 30 hari", () => {
    expect(perintah).toContain('rclone copy "$terbaru" "$TUJUAN/database/"');
    expect(perintah).toContain('rclone copy "minio:${S3_BUCKET:?}" "$TUJUAN/workbook/"');
    const hapus = perintah.split("\n").filter((baris) => /rclone (delete|purge|rmdirs|deletefile|move|sync)|--min-age|--max-age/.test(baris));
    expect(hapus).toEqual([expect.stringContaining(`rclone delete "$TUJUAN/database/" --min-age 30d --include 'drp-*.sql.gz'`)]);
  });

  it("tidak ada rclone sync ke gdrive: di skrip, compose, maupun docs", () => {
    for (const isi of [backupLuar, compose, baca("docs/DEPLOY.md")]) {
      expect(isi).not.toMatch(/rclone sync[^\n]*gdrive:|backup-luar sync /);
    }
  });

  it("gagal → kode keluar non-nol", () => {
    expect(perintah).toMatch(/if \[ "\$gagal" -ne 0 \]; then\n[^\n]*\n\s*exit 1\n/);
  });
});

describe("langkah migrasi", () => {
  it("seed master hanya saat tabel gudang kosong, seed UAT tidak pernah", () => {
    expect(migrasi).toMatch(/select count\(\*\)::int as jumlah from gudang/);
    expect(migrasi).toMatch(/if \[ "\$JUMLAH_GUDANG" -eq 0 \]; then\n[^\n]*\n\s*"\$BIN\/tsx" scripts\/seed-master\.ts/);
    expect(tanpaKomentar(migrasi)).not.toMatch(/seed-uat/);
  });
});

describe("proxy bersama", () => {
  it("hanya proxy yang memegang port 80/443", () => {
    expect(komposeProxy).toMatch(/- "80:80"/);
    expect(komposeProxy).toMatch(/- "443:443"/);
  });

  it("Caddyfile utama hanya memuat berkas situs", () => {
    expect(tanpaKomentar(baca("deploy/proxy/Caddyfile")).trim()).toBe("import /etc/caddy/sites/*.caddy");
  });

  it("situs drp meneruskan path bucket S3_BUCKET ke MinIO dan sisanya ke app", () => {
    const bucket = envContoh.match(/^S3_BUCKET=(\S+)$/m)?.[1];
    expect(bucket).toBe("mandalika");
    expect(situs).toMatch(/^drp\.mandalika\.web\.id \{$/m);
    expect(situs).toContain(`@storage path /${bucket} /${bucket}/*`);
    expect(situs).toMatch(/reverse_proxy drp-minio:9000/);
    expect(situs).toMatch(/reverse_proxy drp-app:3000/);
  });
});

describe("deploy/.env.produksi.example", () => {
  it("tanpa nilai rahasia", () => {
    for (const nama of ["POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "ADMIN_AWAL_SANDI"]) {
      expect(envContoh).toMatch(new RegExp(`^${nama}=$`, "m"));
    }
    expect(envContoh).toMatch(/^BETTER_AUTH_URL=https:\/\/drp\.mandalika\.web\.id$/m);
    expect(envContoh).toMatch(/^S3_ENDPOINT=https:\/\/drp\.mandalika\.web\.id$/m);
  });

  it("BACKUP_GDRIVE_* tidak ada lagi di contoh env, compose, dan skrip backup luar", () => {
    for (const isi of [envContoh, compose, backupLuar]) {
      expect(isi).not.toMatch(/BACKUP_GDRIVE/);
    }
  });
});

describe("rahasia", () => {
  it("tidak ada token OAuth Google, kunci service account, atau private key di repo", () => {
    const berkas = execFileSync("git", ["ls-files"], { cwd: akar, encoding: "utf8" }).split("\n").filter(Boolean);
    expect(berkas.filter((nama) => /google-(backup|drive-token)\.json$/.test(nama))).toEqual([]);
    // git grep keluar 1 jika tidak ada yang cocok. Access token Google berawalan ya29., refresh token berawalan 1//.
    const pola = ['"type": *"service_account"', "BEGIN (RSA )?PRIVATE KEY", '"(access|refresh)_token" *: *"[^"]', "ya29\\.[A-Za-z0-9_-]{20}", "1//0[A-Za-z0-9_-]{20}"];
    const cari = spawnSync("git", ["grep", "-lE", ...pola.flatMap((p) => ["-e", p])], {
      cwd: akar,
      encoding: "utf8",
    });
    expect(cari.stdout).toBe("");
    expect(cari.status).toBe(1);
  });
});

describe("bootstrap-vps.sh", () => {
  it("tidak menimpa .env yang sudah ada dan tidak menyentuh firewall, user, atau paket", () => {
    expect(bootstrap).toMatch(/if \[\[ -f "\$BERKAS_ENV" \]\]; then\n\s*echo "\$BERKAS_ENV sudah ada; tidak ditimpa\."/);
    expect(tanpaKomentar(bootstrap)).not.toMatch(/\b(ufw|iptables|useradd|usermod|apt|apt-get|systemctl)\b/);
  });
});

describe(".github/workflows/deploy.yml", () => {
  it("hanya setelah CI hijau untuk push ke main, atau manual dari main", () => {
    expect(workflow).toMatch(/workflow_run:\n\s*workflows: \[CI\]\n\s*types: \[completed\]\n\s*branches: \[main\]/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.conclusion == 'success'/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.event == 'push'/);
    expect(workflow).toMatch(/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
    expect(workflow).not.toMatch(/^\s*pull_request/m);
  });

  it("satu deploy sekaligus tanpa membatalkan yang berjalan", () => {
    expect(workflow).toMatch(/concurrency:\n\s*group: deploy-produksi\n\s*cancel-in-progress: false/);
  });

  it("tanpa action pihak ketiga", () => {
    expect(workflow).not.toMatch(/^\s*(-\s*)?uses:/m);
  });
});
