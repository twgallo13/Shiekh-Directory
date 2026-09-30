import { parse } from "csv-parse/sync";

export type CsvRow = {
  "District Manager": string;
  "Store #": string;
  "Store Phone #": string;
  "Location Name": string;
  "Address": string;
  City: string;
  State: string;
  "Zip Code": string;
  Manager: string;
  "Manager #": string;
  "Assistant Manager": string;
  "AM 2/3rd Key": string;
  "Store Email": string;
};

export function parseMigrationCsv(csv: string): CsvRow[] {
  return parse(csv, {
    bom: true,
    columns: (headers: string[]) => headers.map(header => header.trim()),
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}