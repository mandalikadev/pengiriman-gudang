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
      if (image.startsWith("postgres:") || image.startsWith("pgsty/minio:")) continue;
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
