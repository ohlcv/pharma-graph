import { defineConfig, type Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import {
  buildGraphData,
  buildManifest,
} from './scripts/build-content.ts';

function contentManifestPlugin(): Plugin {
  return {
    name: 'pharma-graph:content-manifest',
    apply: () => true,
    async buildStart() {
      await buildGraphData();
      await buildManifest();
    },
    async handleHotUpdate(ctx) {
      // Re-emit the manifest whenever a markdown file changes — keeps dev
      // in sync without a full server restart.
      if (ctx.file.endsWith('.md')) {
        await buildGraphData();
        await buildManifest();
      }
    },
  };
}

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Legacy JS bundle (ES5) for Safari <15 / iOS <15 / old Androids.
  // plugin-legacy generates a separate bundle transpiled to ES5 with only the
  // polyfills those browsers actually lack — eliminating the full core-js/stable
  // import that penalized every modern device.
  plugins: [
    contentManifestPlugin(),
    legacy({
      terserOptions: { compress: { drop_console: true } },
      additionalLegacyPolyfills: [],
      polyfills: {
        'es.object.has-own': true,
        'es.array.at': true,
        'esnext.array.at': true,
        'es.promise': true,
        'es.promise.all-settled': true,
      },
    }),
  ],
  optimizeDeps: {
    include: [
      'cytoscape',
      'cytoscape-cose-bilkent',
      'cytoscape-dagre',
      'cytoscape-euler',
    ],
  },
});
