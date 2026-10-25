import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261025205805 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "manual_transfer_reference" drop constraint if exists "manual_transfer_reference_code_unique";`);
    this.addSql(`create table if not exists "manual_transfer_reference" ("id" text not null, "code" text not null, "payment_session_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manual_transfer_reference_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_manual_transfer_reference_code_unique" ON "manual_transfer_reference" ("code") WHERE deleted_at IS NULL;`);
    // The generated index skips soft-deleted rows; references must stay unique forever.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_manual_transfer_reference_code_all" ON "manual_transfer_reference" ("code");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_reference_deleted_at" ON "manual_transfer_reference" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_manual_transfer_reference_payment_session_id" ON "manual_transfer_reference" ("payment_session_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "manual_transfer_reference" cascade;`);
  }

}
