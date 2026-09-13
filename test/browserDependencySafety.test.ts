import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';

test('Location import browser path loads without Node globals or server CSV libraries', async () => {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: ['src/components/admin/LocationImportPreviewPanel.tsx'],
    bundle: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    format: 'iife',
    globalName: 'LocationImportPreviewPanelBundle',
    metafile: true,
    minify: true,
    platform: 'browser',
    write: false,
  });
  const source = result.outputFiles[0].text;
  const inputs = Object.keys(result.metafile.inputs);

  assert.ok(inputs.every(input => !/csv-(?:parse|stringify)/.test(input) && !input.includes('/server/')), inputs.join('\n'));
  assert.doesNotMatch(source, /\bBuffer\b|csv-(?:parse|stringify)/);
  const context = vm.createContext({ console, queueMicrotask, setTimeout, clearTimeout });
  assert.equal('Buffer' in context, false);
  assert.equal('process' in context, false);
  assert.doesNotThrow(() => vm.runInContext(source, context));
  assert.equal(typeof (context as { LocationImportPreviewPanelBundle?: unknown }).LocationImportPreviewPanelBundle, 'object');
});