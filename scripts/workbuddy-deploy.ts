/**
 * 发布到 WorkBuddy 沙箱的「保证最新」预检 + 配方生成器。
 *
 * 沙箱上传源码、隔离构建、启动服务这部分由 WorkBuddy 客户端调用
 * `workbuddy_sites_deploy` 工具完成（没有 CLI 入口）。本脚本负责发布前的
 * 一致性预检 —— 默认模式就是你说的「保证最新」：
 *
 *   1. git 工作区状态：未提交改动只 warn，不阻断（agent 改完到上线之间
 *      可能在工作区里继续小修）
 *   2. 本地跑一遍沙箱里要跑的同一条命令（DEPLOY_LIGHT=1 vite build），
 *      验证 dist/ 产物完整；本地跑挂说明发上去也挂，节省一次失败发布。
 *   3. graph-data.json 与 markdown 同步性（check:graph 等价出口）。
 *   4. 打印对话里可直接复制粘贴的标准发布配方 —— 用户/agent 拿到即可
 *      触发 `workbuddy_sites_deploy` 完成上传。
 *
 * Usage:
 *   npm run deploy:workbuddy                # 预检 + 打印配方（默认保证最新）
 *   npm run deploy:workbuddy -- --quiet    # 只跑预检，不打印配方
 *   npm run deploy:workbuddy -- --publish   # 预检后直接打印「请发布」触发语
 *
 * 真正的发布由 WorkBuddy 对话调用 `workbuddy_sites_deploy` 完成：
 *   用户对话说一句「发布」/「发布最新的 pharma-graph」/
 *   「同步到线上」，agent 会跑 npm run deploy:workbuddy 再带配方调工具。
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DEPLOY_LIGHT_BUILD_CMD = 'DEPLOY_LIGHT=1 npx vite build';
const REQUIRED_PRODUCTS = [
  'dist/index.html',
  'dist/graph-data.json',
  'dist/content-manifest.json',
] as const;

const QUIET = process.argv.includes('--quiet');
const PUBLISH_HINT = process.argv.includes('--publish');

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function run(cmd: string, label: string, opts: { inherit?: boolean } = {}): void {
  if (!QUIET) console.log(`\n▶ ${label}: ${cmd}`);
  const r = spawnSync('sh', ['-c', cmd], {
    cwd: ROOT,
    stdio: opts.inherit ? 'inherit' : 'ignore',
  });
  if (r.status !== 0) fail(`${label} 失败（exit ${r.status}）。代码不能发，请先修复。`);
}

// ── 1. git 工作区 ────────────────────────────────────────────────────────
if (!QUIET) console.log('== 1. git 工作区 ==');
const gitStatus = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
const changes = gitStatus ? gitStatus.split('\n').length : 0;

let aheadBy = 0;
try {
  aheadBy = Number(
    execSync('git rev-list --count @{u}..HEAD 2>/dev/null || echo 0', { cwd: ROOT })
      .toString()
      .trim(),
  );
} catch {
  aheadBy = 0;
}

if (!QUIET) {
  console.log(changes ? `  ⚠ ${changes} 处未提交改动（不阻断发布）` : '  ✓ 工作区干净');
  console.log(aheadBy > 0 ? `  ⚠ 本地领先远程 ${aheadBy} 个提交（建议先 push）` : '  ✓ 与远程同步');
}

// ── 2. 本地预构建（沙箱里跑的同一条命令）────────────────────────────────
if (!QUIET) console.log('\n== 2. 本地预构建（沙箱同款：DEPLOY_LIGHT=1 vite build）==');
run(DEPLOY_LIGHT_BUILD_CMD, '轻量构建', { inherit: true });

if (!QUIET) console.log('\n== 3. 产物完整性 ==');
for (const p of REQUIRED_PRODUCTS) {
  const full = path.join(ROOT, p);
  if (!existsSync(full)) fail(`产物缺失：${p}`);
  const size = statSync(full).size;
  if (!QUIET) console.log(`  ✓ ${p} (${size.toLocaleString()} B)`);
}

// ── 4. graph-data 与 markdown 同步性 ──────────────────────────────────────
if (!QUIET) console.log('\n== 4. graph-data 新鲜度 ==');
run('npx vite-node scripts/check-graph-fresh.ts -- --local', 'check:graph');

// ── 5. 打印发布配方 ──────────────────────────────────────────────────────
if (QUIET && !PUBLISH_HINT) {
  console.log('\n✓ 预检通过。沙箱构建本地可复现，产物完整，graph-data 同步。');
  process.exit(0);
}

const recipe = [
  '──────── WorkBuddy 发布配方 ────────',
  '',
  '把下面这段贴进 WorkBuddy 对话，agent 会自动调用 sites_deploy 完成上传：',
  '',
  '  发布最新的 pharma-graph 到 WorkBuddy（保持现有应用与链接）',
  '',
  '如果直接调 workbuddy_sites_deploy 工具，参数为：',
  '  action:        deploy',
  '  appName:       药学家族关系星图',
  '  domainPrefix:  pharma-graph',
  `  directory:     ${ROOT}`,
  '  language:      node',
  '  port:         4173',
  '  installCmd:    (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install > /tmp/build.log 2>&1; echo INSTALL_EXIT=$? >> /tmp/build.log) && (DEPLOY_LIGHT=1 npx vite build >> /tmp/build.log 2>&1; echo BUILD_EXIT=$? >> /tmp/build.log); true',
  '  startCmd:      cp /tmp/build.log dist/buildlog.txt 2>/dev/null; python3 -m http.server 4173 --bind 0.0.0.0 --directory dist',
  '  userAskedToPublish: true',
  '',
  PUBLISH_HINT ? '→ 已设置 --publish：上面的预检通过后，可直接对 agent 说「发布」' : '',
].filter(Boolean).join('\n');

console.log('\n' + recipe);