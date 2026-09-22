# AGENTS.md — pharma-graph 项目工作准则

> 写给在本项目里工作的 AI 编程代理。**持续生效**。遇到冲突时：本文件 < [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) < [`docs/DEVELOP.md`](./docs/DEVELOP.md) < [`docs/RULES.md`](./docs/RULES.md)（优先级从高到低）。

---

## 0. 30 秒项目卡

- **类型**：内容驱动的药学知识图谱。Markdown 是资产，图谱是视图。
- **数据源**：`public/content/**/*.md`（YAML frontmatter 承载节点元数据 + 关系）。
- **构建期**：脚本把 Markdown 解析为 `public/graph-data.json` + `public/content-manifest.json` + `public/sitemap.xml`。
- **运行期**：浏览器加载预生成 JSON，用 Cytoscape.js + dagre/euler/cose-bilkent 渲染。
- **部署**：Vercel 自动构建 `dist/`，不入仓库。
- **目录骨架**：`src/`（源码）· `build/`（共享构建库）· `scripts/`（构建/治理入口）· `tools/`（一次性迁移）· `docs/`（文档 + ARD 决策）· `public/`（内容 + 预生成）· `tests/`（**独立于 src/** 的测试树，详见 §2.4）· `archive/`（已弃用）。
- **结构地图**：见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。新文件 / 新目录前先翻一遍。

---

## 1. 核心约定（必读）

### 1.1 Markdown frontmatter 是真理之源

- 节点 id、label、fill、edges_out、深度等**全部存在 Markdown YAML frontmatter**。**不要**在源码里硬编码节点 id 或关系。
- YAML 解析对**格式极其敏感**。任何带 `**`（Markdown 加粗）、跨行裸值、`|`/`>`/`@`/`%`/反引号开头的值都必须用双引号包起来。
- 加新节点 / 改现有节点 frontmatter → 先读 [`.cursor/rules/frontmatter-conventions.mdc`](./.cursor/rules/frontmatter-conventions.mdc) 和 [`docs/frontmatter.md`](./docs/frontmatter.md)。
- 自检命令（项目根执行）：
  ```bash
  node -e "require('yaml').parseAllDocuments(require('fs').readFileSync('<file>.md','utf8').split('---')[1])"
  ```
  任一文件解析失败就不要继续改，先修复 YAML。

### 1.2 数据流向是单向的

```
Markdown ──[scripts/build-graph-data.ts]──> graph-data.json ──> 浏览器 (Cytoscape)
                  │
                  └─> content-manifest.json  ─┐
                  └─> sitemap.xml             ├─> 同上
                                              ┘
```

- 节点 / 边的**关系只在发起方**通过 `edges_out` 定义，不要反向写。
- 改任何 `.md` 文件后，Vite dev server 的 `contentManifestPlugin` 会自动重建 `public/graph-data.json` + `public/content-manifest.json`（见 [`vite.config.ts`](./vite.config.ts)）。
- **不要**手动编辑 `public/graph-data.json` / `public/content-manifest.json` / `public/sitemap.xml`，它们是构建产物。CI/构建链会重新生成。
- `public/graph-data.json` 是**必须提交**的（团队协作保持一致），`sitemap.xml` 与 `content-manifest.json` **不提交**（每次重新生成）。详见 `.gitignore` 的注释。

### 1.3 tsconfig / vite / vitest 三个工具各管一段

| 工具 | 作用域 | 关键配置 |
|---|---|---|
| `tsconfig.json` | 类型检查 + 路径别名 `@/*` → `./src/*` | strict: true, target: ES2022, moduleResolution: bundler |
| `vite.config.ts` | dev server + 生产构建 | `contentManifestPlugin` 在 `buildStart` 与 `.md` 文件 `handleHotUpdate` 时重新构建图数据 |
| `vitest.config.ts` | 单元/集成测试 | environment: node（默认）；DOM 测试在文件内 `vi.stubGlobal` / `// @vitest-environment jsdom` |

- 源码中**禁止**使用 `process.env.X` 之类直读，用 `import.meta.env`（Vite 注入）。`.env.example` 已列出可注入变量。
- 模块解析走 `bundler`，所以 `import` 可以省略 `.ts` / `.js` 扩展名，但**保持现状别批量加扩展名**。

---

## 2. 目录与代码组织

### 2.1 分层

| 路径 | 职责 | 可以做 | 不可以做 |
|---|---|---|---|
| `src/parser/` | Markdown / frontmatter 解析 | parse、validate、序列化 | 触碰 Cytoscape / DOM |
| `src/core/` | 图数据 / 渲染 / 漫游引擎（纯逻辑 + Canvas） | 算法、状态机、Cytoscape 实例 | 引用 `src/ui/*` |
| `src/ui/` | 浏览器侧 UI（DOM、CSS、用户交互） | 引用 `src/core/*` | 内部反向依赖 `src/ui/*`（用事件 / `state.ts` 解耦） |
| `src/data/` | 领域词汇表（药学专用） | 静态数据 | 引入运行时依赖 |
| `src/types/` | 全局类型补充 | `.d.ts` | 实现代码 |
| `tests/` | 测试（不在 `src/` 树内） | 见 §2.4 | 业务逻辑 |

`src/core/` 不依赖 `src/ui/`；`src/ui/` 是消费者。**单向**。

### 2.2 `scripts/` / `build/` / `tools/` 的边界

| 路径 | 角色 | 是否被 `vite.config.ts` import |
|---|---|---|
| `scripts/build-graph-data.ts` | 构建入口（仅组装 + 调用） | 否，**通过 `vite build` 自动触发** |
| `scripts/build-content-manifest.ts` | 同上 | 否，自动触发 |
| `scripts/check-graph-fresh.ts` | 治理：检查图数据是否新鲜 | 否，CI / 手动 |
| `scripts/validate*.ts` | 治理：schema / 深度校验（CI 门禁） | 否 |
| `scripts/audit-frontmatter.ts` | 治理：打分审计（**永远 exit 0**，只输出报告） | 否 |
| **`build/build-content.ts`** | **共享构建库**（被 `vite.config.ts` 和多个 scripts 入口 import） | **是** |
| `tools/*` | **一次性**迁移 / 修复脚本，**不参与构建链** | 否 |

- 修一个构建问题？如果你能直接改 `build/build-content.ts`，那就该在那里改，不要把它推到 `scripts/`。`scripts/` 入口是薄壳。

### 2.3 写新文件前先问自己三个问题

1. 这个文件属于 `src/core/` 还是 `src/ui/`？**别混进 `src/core/`**。
2. 这个逻辑如果只是数据变换，应放在 `src/parser/` 而非 `src/core/`。
3. 这是不是一次性迁移脚本？是 → `tools/`；是被 import 的共享代码 → `build/`；是 `npm run` 入口 → `scripts/`。

### 2.4 测试目录分层（`tests/` 物理隔离出 `src/`）

**位置**：`tests/` 在**顶层**，**不放在 `src/` 下**。理由：

- **物理安全**：vite build 从 `index.html` 反向扫 import 链，源码在 `src/`、测试在 `tests/` 是两棵树——**任何对源码的 import 都到不了 tests/**，防止测试代码 + fixture 误进 `dist/`。
- **dev server 启动快**：vite dev 不扫 `tests/`（vitest 才扫它），冷启动不浪费 transform 时间在测试代码上。
- **审 PR 干净**：`git grep -- src/` 列出的全是生产代码，测试不会被业务搜索结果污染。

**三层目录**（按"对外部世界依赖"分，不是按大小）：

| 目录 | 含义 | 识别标签 | 例子 |
|---|---|---|---|
| `tests/unit/` | **纯函数 / 数据变换**。只测输入→输出。**不 mock DOM、不 mock 时间、不读真实磁盘** | 默认 `vitest` 配置 `environment: node`；无 `// @vitest-environment jsdom` | `parser/frontmatter.test.ts`、`core/build-graph.test.ts`、`core/tour-engine.test.ts`、`ui/search.test.ts` |
| `tests/component/` | **DOM 行为测试**。`document` / `localStorage` / `cytoscape` mock；jsdom；可能读磁盘 fixture | 文件顶部 `/** @vitest-environment jsdom */` | `ui/bigscreen.test.ts`、`ui/tour-controller.test.ts`、`parser/location-audit.test.ts`（扫盘 → "准集成"，归这里） |
| `tests/e2e/` | **真实浏览器驱动**（Playwright/Cypress）。目前**空目录**，留占位 | 需要外部 driver 才能跑 | （未来）`ui/graph-interaction.spec.ts` |

**判定准则（四个问题，新人能背）**：

1. 文件顶部有没有 `/** @vitest-environment jsdom */`？有 → `component/`
2. 是不是扫了 `public/content/**/*.md`？有 → `component/`（"准集成"）
3. 有没有 mock `cytoscape` / `document` / `localStorage` / `setTimeout`？有 → `component/`
4. 都不满足 → `unit/`

**禁止**：

- 测试文件**不放回** `src/**/xxx.test.ts` 平级。所有测试都进 `tests/` 树。
- 新增的 `__tests__/` 文件夹**不再使用**——`tests/` 已经替它实现统一收纳。
- 业务源码**禁止** `import './xxx.test'` 或 `import from '@/**/xxx.test'`。ESLint `no-restricted-imports` 守门（见 §3.4 末）。

**怎么写 import**：测试一律用 `@/` 别名（`vitest.config.ts` 已经注入 `@ → src/`），**避免相对路径跨层级**。例如：

```ts
// ✅ 跨任意目录层级都稳
import { buildGraph } from '@/core/build-graph';
import { UiToggle } from '@/ui/ui-toggle';

// ❌ 写相对路径也能跑，但迁移一次就破一次
import { buildGraph } from '../../src/core/build-graph.js';
```

**唯一例外**：`await import('./xxx.js')` 这种 dynamic import 用在 `vi.resetModules()` 重置模块缓存的代码里（见 `tests/component/ui/state.test.ts` 模式），保留相对路径——别名会破坏模块缓存语义。

---

## 3. 写代码时

### 3.1 TypeScript 风格

- 全文件 `strict` 模式。新代码不能引入 `any`。如果一定要，**注释里写明原因**，然后把它收敛到一个局部变量。
- 函数 / 类不超过 ~150 行单文件上限（无强制，但要警觉）。超过时优先**沿职责切分**，不要靠长函数。
- 模块导入顺序：内置 → 外部 → `@/` 别名 → 相对路径。Prettier 接管格式（`package.json` 的 `format`）。

### 3.2 注释与文档

- 解释**意图**，不解释语法。绝不写 `// increment counter`、`// parse YAML` 之类叙述性注释。
- 重大决策（架构级 → ADR-；产品 / 交互级 → ADR-）写到 `docs/ADR/`。命名规则详见 [`docs/ARCHITECTURE.md` §10](./docs/ARCHITECTURE.md)。
- 调试问题写入 `docs/DEBUG/`（已有索引归档在 `docs/archive/debug/debug-index.md`）。**禁止**在自己解决的 PR 里"顺手清掉" debug 文件。

### 3.3 CSS

- 全局类分到 `src/ui/styles/{base,components,layout,glass}.css`，模块特定加 `tour.css` / `sidebar-*.css`。
- **不要**在 `.ts` 里写内联 `style.*`，除非它在 hot path 上且只影响一个临时 DOM 节点。
- 任何新增的 CSS 变量定义进 `src/core/config.ts` 的 FILL_CONFIG / 主题色区，**别在 CSS 里硬编码颜色**。

### 3.4 测试

测试目录分层见 §2.4。补充要点：

- **测试文件位置**：`tests/{unit,component,e2e}/{parser,core,ui}/xxx.test.ts`。**不放回 `src/`**。
- **环境切换**：默认 `vitest` 配置 `environment: node`；要 DOM 时文件顶部加：
  ```ts
  /**
   * @vitest-environment jsdom
   */
  ```
- **跑测试**：
  - `npm test`（一次性）跑全部 vitest。
  - `npm run test:watch`（watch 模式）。
  - 分类跑（推荐 PR 工作流）：
    - `npx vitest run tests/unit`（最快，纯函数毫秒级反馈）
    - `npx vitest run tests/component`（DOM，需要 jsdom，会比 unit 慢）
- **覆盖率**：`npm run test:coverage`。`vitest.config.ts` 已排除 `scripts/`、`src/types/`、`src/ui/styles/`、`tests/**`（防止把测试自己算进覆盖率）。

**安全网**（防止测试代码误进 `dist/` 或被业务源码误 `import`）——三道都已落地：

- **Vite 端**：`vite.config.ts` 的 `build.rollupOptions.external` 配 `(id) => /\.test\./.test(id)`——测试文件对 vite 不可见，物理阻断进 `dist/`。
- **ESLint 端**：`eslint.config.js` 加 `no-restricted-imports` 规则，**禁止业务源码 import 任何 `*.test.*` 文件**（错误等级 `error`，PR 阶段就 fail）。
- **vitest coverage**：`vitest.config.ts` 已把 `tests/**` 加进 `coverage.exclude`——测试自己不进覆盖率统计。

三道是双保险：CI 通过 ESLint 检查源码 + Vite 端排除测试路径 + coverage 不污染。

**判定辅助**（写新测试前自问）：

- 测的是纯函数（输入字符串/对象，输出字符串/对象）？→ `tests/unit/`
- 需要 `document.querySelector` / `localStorage` / mock `cytoscape`？→ `tests/component/`
- 需要 Playwright/Cypress 驱动真实浏览器？→ `tests/e2e/`

### 3.5 不要做的事

- 不要把 node_modules / `dist/` / `.DS_Store` 提交；`dist/` 在 `.gitignore` 中，Vercel 会自己构建。
- 不要编辑 `public/graph-data.json` / `public/content-manifest.json` / `public/sitemap.xml`。
- 不要写"修改了整个 codebase"式 PR 大改。每次 PR 尽量 1–2 个文件 / 一个明确变更意图，便于回滚。
- 不要发明新数据格式。如果必须，**先**更新 `docs/frontmatter.md` 与 schema，再写实现。

---

## 4. 常用命令

```bash
npm run dev               # 启动 dev server（http://localhost:5173/）
npm run build             # 生产构建（含 prebuild：build:graph + build:manifest + validate:graph）
npm run preview           # 预览 dist
npm test                  # 跑全部 vitest
npm run lint              # ESLint
npm run format            # Prettier --write
npm run validate          # 严格 schema 校验（CI 门禁）
npm run audit             # 打分审计（永远不失败）
npm run measure-overlap   # 节点重叠度测量
npm run check:graph       # 图数据新鲜度检查
```

完整命令见 [`package.json`](./package.json) §`scripts`。

---

## 5. 修改前后流程（Checklist）

修改前：

- [ ] 阅读受影响的源码 + 最近的调试记录（`docs/DEBUG/`）
- [ ] 若新增 / 修改 frontmatter，跑 parse 自检
- [ ] 若新增目录 / 文件，预读 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)，决定它该放在哪

修改中：

- [ ] 保持单向依赖：`src/ui/` → `src/core/` → `src/parser/` → frontmatter
- [ ] 每个 commit 落点单一（一个明确意图）
- [ ] 新 build / public 文件路径更新到 `docs/ARCHITECTURE.md` 顶层表 + 9 章汇总

修改后：

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run validate`（如果改动 frontmatter 或图数据构建链）
- [ ] `npm run build`（本地跑一遍确认 prebuild 通过）

---

## 6. 文档索引（按优先级）

| 想做的事 | 看哪里 |
|---|---|
| 弄清项目是什么、目录结构 | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| 弄清数据模型、关系类型、目录设计 | [`docs/DEVELOP.md`](./docs/DEVELOP.md) |
| 了解节点字段怎么写 | [`docs/frontmatter.md`](./docs/frontmatter.md) + `.cursor/rules/frontmatter-conventions.mdc` |
| 写决策记录 | [`docs/ADR/`](./docs/ADR/)，命名 ADR- 续号（已废弃 ARD- 双前缀） |
| 看已知 bug / 调试经验 | [`docs/DEBUG/debug-index.md`](./docs/DEBUG/debug-index.md) |
| 看完整规则集 | [`docs/RULES.md`](./docs/RULES.md) |
| 看代码维基（行级说明） | [`docs/CODE-WIKI.md`](./docs/CODE-WIKI.md) |

---

## 7. 优先级冲突时的处理

如果用户明确指令和本文件冲突——**服从用户的当前指令**，但要指出冲突；之后回这里修订文件。
如果本文件和 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 冲突——以 ARCHITECTURE.md 为准（它更接近项目真相），并回报冲突。
如果发现文档本身已过期到产生误引导——优先修复文档，再继续工作。
