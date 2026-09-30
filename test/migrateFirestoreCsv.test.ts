import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMigrationCsv } from "../scripts/migrateFirestoreCsv";

test("operator migration CSV parser handles BOM, trimmed headers, and trimmed values", () => {
  const rows = parseMigrationCsv('\uFEFF" District Manager "," Store # "," Store Phone # "," Location Name "," Address ",City,State," Zip Code ",Manager," Manager # "," Assistant Manager "," AM 2/3rd Key "," Store Email "\r\n"District Lead","007","(213) 555-0100","Example Store","1 Main Street","Los Angeles","CA","90001","Store Manager","(213) 555-0101","Assistant Manager","Key Holder","store@example.test"\r\n');

  assert.equal(rows.length, 1);
  assert.equal(rows[0]["District Manager"], "District Lead");
  assert.equal(rows[0]["Store #"], "007");
  assert.equal(rows[0]["Location Name"], "Example Store");
  assert.equal(rows[0]["Store Email"], "store@example.test");
});