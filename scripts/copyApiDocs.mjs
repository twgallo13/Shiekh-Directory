import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/api-docs', { recursive: true });
for (const file of ['personnel-staffing-openapi.json', 'personnel-staffing-api.md']) {
  await copyFile(`docs/${file}`, `dist/api-docs/${file}`);
}
