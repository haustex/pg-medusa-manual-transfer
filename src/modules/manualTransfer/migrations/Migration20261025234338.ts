import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261025234338 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "manual_transfer_proof" ("id" text not null, "order_id" text not null, "payment_id" text not null, "reference" text null, "file_id" text not null, "filename" text not null, "mime_type" text check ("mime_type" in ('image/jpeg', 'image/png', 'application/pdf')) not null, "size" integer not null, "sha256" text not null, "status" text check ("status" in ('pending', 'accepted', 'rejected')) not null default 'pending', "rejection_reason" text null, "reviewed_by" text null, "reviewed_at" timestamptz null, "uploaded_by" text check ("uploaded_by" in ('customer', 'guest')) not null, "customer_id" text null, "note" text null, "duplicate_of_order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manual_transfer_proof_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_proof_deleted_at" ON "manual_transfer_proof" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_proof_order_id" ON "manual_transfer_proof" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_proof_payment_id" ON "manual_transfer_proof" ("payment_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_proof_sha256" ON "manual_transfer_proof" ("sha256") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "manual_transfer_proof_file" ("id" text not null, "content" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manual_transfer_proof_file_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_proof_file_deleted_at" ON "manual_transfer_proof_file" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "manual_transfer_proof" cascade;`);

    this.addSql(`drop table if exists "manual_transfer_proof_file" cascade;`);
  }

}
