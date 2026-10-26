import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261026032520 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "manual_transfer_proof" add column if not exists "file_deleted_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "manual_transfer_proof" drop column if exists "file_deleted_at";`);
  }

}
