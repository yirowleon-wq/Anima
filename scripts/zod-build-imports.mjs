import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const packageRoot = path.resolve(project, 'node_modules/@openuidev/lang-core');
const entry = path.join(packageRoot, 'dist/index.mjs');
const original = 'import { literal, object, z } from "zod/v4";';
const normalized = 'import { literal, object } from "zod/v4";\nimport * as z from "zod/v4";';

// esbuild retains the whole namespace behind Zod's named `z` re-export.
// Normalize this one locked dependency import without editing the vendor file
// or reducing Zod's public API. Ordinary namespace imports can be tree-shaken.
export function lockedOpenUiZodImports() {
  return {
    name: 'locked-openui-zod-imports',
    async setup(build) {
      const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
      if (metadata.version !== '1.0.1')
        throw new Error(`OpenUI Zod import normalization requires @openuidev/lang-core 1.0.1; found ${metadata.version}. Review its entry before updating this build step.`);
      const source = await fs.readFile(entry, 'utf8');
      if (source.split(original).length !== 2)
        throw new Error('OpenUI 1.0.1 dist/index.mjs no longer has the single expected Zod import. Review its entry before updating this build step.');
      build.onLoad({ filter: /[/\\]@openuidev[/\\]lang-core[/\\]dist[/\\]index\.mjs$/ }, async args => {
        if (path.resolve(args.path) !== entry)
          throw new Error(`Unexpected OpenUI entry for Zod import normalization: ${args.path}`);
        return { contents: source.replace(original, normalized), loader: 'js' };
      });
    },
  };
}
