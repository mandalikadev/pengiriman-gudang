// Skema Drizzle. Tabel bisnis ditambahkan oleh tiket yang membutuhkannya.
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// --- Autentikasi (Better Auth + plugin admin, T20) ---
// Nama tabel dan field mengikuti model bawaan Better Auth agar adapter Drizzle tidak perlu pemetaan.
// `role` berisi peran global: "admin" atau "viewer". Status operator bukan peran global (T22).
// `banned` = pengguna dinonaktifkan.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (tabel) => [index("session_user_id_idx").on(tabel.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("account_user_id_idx").on(tabel.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("verification_identifier_idx").on(tabel.identifier)],
);

// --- Gudang dan toko (T21) ---

/** Lima gudang (PRD A3, OD-02). Diisi oleh seed master; tidak ada UI untuk menambah atau mengubahnya. */
export const gudang = pgTable("gudang", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nama: text("nama").notNull().unique(),
});

/** Master toko: nama sesuai blok toko di sheet penjualan. */
export const toko = pgTable("toko", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nama: text("nama").notNull().unique(),
  aktif: boolean("aktif").notNull().default(true),
});

/**
 * Hubungan toko–gudang. ADR-0009 (OD-03): satu toko terhubung ke paling banyak satu gudang,
 * ditegakkan database lewat primary key `toko_id`. Toko yang belum terhubung tidak punya baris.
 */
export const hubunganTokoGudang = pgTable(
  "hubungan_toko_gudang",
  {
    tokoId: integer("toko_id")
      .primaryKey()
      .references(() => toko.id),
    gudangId: integer("gudang_id")
      .notNull()
      .references(() => gudang.id),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("hubungan_toko_gudang_gudang_id_idx").on(tabel.gudangId)],
);
