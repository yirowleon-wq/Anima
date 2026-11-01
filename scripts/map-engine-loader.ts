import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';

const publicId = 'virtual:anima-map-engine-url';
const virtualId = '\0' + publicId;
const engineId = normalizePath(path.resolve(import.meta.dirname, '../src/renderer/map/map-engine.ts'));

/** Keep one compiled engine entry, while allowing a failed fetch to be retried
 * under a fresh URL without reloading the workspace. */
export function mapEngineLoader(): Plugin {
  let development = false;
  let reference: string | undefined;
  return {
    name: 'anima-map-engine-loader',
    configResolved(config) { development = config.command === 'serve'; },
    buildStart() { reference = undefined; },
    resolveId(id) { if (id === publicId) return virtualId; },
    load(id) {
      if (id !== virtualId) return;
      if (development) return `export default ${JSON.stringify('/@fs/' + engineId)};`;
      reference ??= this.emitFile({ type: 'chunk', id: engineId, name: 'map-engine', preserveSignature: 'strict' });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    generateBundle(_options, bundle) {
      if (!reference) return;
      const engine = bundle[this.getFileName(reference)];
      const host = Object.values(bundle).find(chunk => chunk.type === 'chunk' && virtualId in chunk.modules);
      if (engine?.type !== 'chunk' || host?.type !== 'chunk')
        this.error('The campus map loading entry was not generated completely.');
      const available = new Set<string>();
      const availableCss = new Set<string>();
      const styles = (chunk: object) => (chunk as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss;
      const collect = (file: string) => {
        if (available.has(file)) return;
        available.add(file);
        const chunk = bundle[file];
        if (chunk?.type === 'chunk') {
          for (const css of styles(chunk) || []) availableCss.add(css);
          for (const dependency of chunk.imports) collect(dependency);
        }
      };
      collect(host.fileName);
      // A fresh entry URL cannot repair a failed dependency URL. Every engine
      // dependency must already be loaded with the surface that requests it.
      for (const dependency of engine.imports) {
        if (!available.has(dependency))
          this.error('The campus map added a program chunk that the interface does not load. Adjust the chunks before building.');
      }
      const engineCss = styles(engine);
      if (!engineCss) this.error('The campus map style loading metadata was not generated completely.');
      for (const css of engineCss) {
        if (!availableCss.has(css)) this.error('Load the campus map styles with the interface before building the map program.');
      }
    },
  };
}
