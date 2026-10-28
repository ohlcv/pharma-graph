import { defineConfig, type Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { buildGraphData, buildManifest } from './build-content.ts';

// 轻量构建模式（WorkBuddy 沙箱部署用）：DEPLOY_LIGHT=1 时——
// 1) 跳过 buildStart 里的 buildGraphData 全量重建（约 20s；graph-data.json 已提交且新鲜）；
// 2) 跳过 plugin-legacy 的 terser ES5 转译（构建最大头；评审场景全是现代浏览器）。
//
// 注：build-content.ts 必须放在项目根目录。WorkBuddy 上传时会按目录名排除
// 「构建产物」，此前它住在 `build/` 里恰好撞名被拦（vite.config 报 Module not
// found）。放根目录可正常上传；本地 `npm run build` / dev / Vercel 完全不受影响。
const DEPLOY_LIGHT = process.env.DEPLOY_LIGHT === '1';

export default defineConfig(async () => {
  const plugins: Plugin[] = [];

  if (!DEPLOY_LIGHT) {
    plugins.push({
      name: 'pharma-graph:content-manifest',
      apply: () => true,
      async buildStart() {
        await buildGraphData();
        // content-manifest.json 未提交（gitignore），运行时要 fetch，每次构建都重新生成。
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
    });

    // Legacy JS bundle (ES5) for Safari <15 / iOS <15 / old Androids.
    // plugin-legacy generates a separate bundle transpiled to ES5 with only the
    // polyfills those browsers actually lack — eliminating the full core-js/stable
    // import that penalized every modern device.
    plugins.push(
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
    );
  }

  return {
    publicDir: 'public',
    // WorkBuddy 沙箱经反向代理域名访问，preview 必须放行任意 Host。
    preview: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Safety net: refuse to bundle any test file. Even if a stray source
      // file mistakenly `import`s a `.test.ts`, the path is treated as
      // external so it cannot leak into `dist/`.
      rollupOptions: {
        external: (id: string): boolean => /\.test\./.test(id),
      },
    },
    plugins,
    optimizeDeps: {
      include: ['cytoscape', 'cytoscape-cose-bilkent', 'cytoscape-dagre', 'cytoscape-euler'],
    },
  };
});
