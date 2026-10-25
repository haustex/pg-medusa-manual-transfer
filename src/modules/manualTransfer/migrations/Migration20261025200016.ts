import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261025200016 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "manual_transfer_account" ("id" text not null, "label" text null, "bank_name" text not null, "account_holder" text not null, "account_number" text not null, "swift_code" text null, "bank_address" text null, "currency_code" text not null, "region_ids" text[] not null default '{}', "is_active" boolean not null default true, "rank" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manual_transfer_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_account_deleted_at" ON "manual_transfer_account" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_account_currency_code_is_active" ON "manual_transfer_account" ("currency_code", "is_active") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "manual_transfer_account" cascade;`);
  }

}
