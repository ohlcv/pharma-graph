import { defineConfig, type Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// 轻量构建模式（WorkBuddy 沙箱部署用）：DEPLOY_LIGHT=1 时——
// 1) 跳过 buildStart 里的 buildGraphData 全量重建（约 20s；graph-data.json 已提交且新鲜）；
// 2) 跳过 plugin-legacy 的 terser ES5 转译（构建最大头；评审场景全是现代浏览器）。
//
// 重要：WorkBuddy 上传时会按名字排除「构建产物」目录，项目的共享构建库 `build/`
// 恰好撞名被拦。因此本文件对它的引用必须走运行时动态 import（用 cwd 拼绝对路径，
// 打包器无法静态解析，沙箱里也永远走不到这个分支）。本地 `npm run build` / dev /
// Vercel 路径完全不受影响。
const DEPLOY_LIGHT = process.env.DEPLOY_LIGHT === '1';

export default defineConfig(async () => {
  const plugins: Plugin[] = [];

  if (!DEPLOY_LIGHT) {
    const { buildGraphData, buildManifest } = await import(
      pathToFileURL(path.join(process.cwd(), 'build', 'build-content.ts')).href
    );

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
    } as Plugin);

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
