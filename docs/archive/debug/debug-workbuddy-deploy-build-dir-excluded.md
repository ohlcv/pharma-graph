# WorkBuddy 发布六连败：build/ 目录被静默排除 + $PORT 不展开 + 60 秒启动窗口

> 状态：**已解决**（2026-10-29 02:00 前）。结论先行：三个独立问题叠加，且平台报错被截断吞掉，必须自建诊断通道才能定位。教训集中在 §「结论与防线」。

## 问题描述

用 WorkBuddy「发布为应用」把本项目发布成 `https://xxx.workbuddy.host/?sharecode=xxx`（1024 大赛投稿要求带 sharecode 的体验链接），**连续六次发布失败**，平台详情里只给一句超时/退出码，真实报错全部被截断。

现象按尝试顺序：

| # | 启动命令思路 | 平台报错 | 真实死因 |
| - | ------------ | -------- | -------- |
| 1 | `npm run build && vite preview --port $PORT` | 60 秒内端口无响应 | 全量构建 2min39s，远超启动窗口 |
| 2 | 构建挪到 install 阶段，`vite preview --port $PORT` | 同上 | `$PORT` 在 startCmd 里**不展开**（空值），vite 参数报错秒退 |
| 3 | 同 2，加 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` | install exit 1 | 实为构建阶段挂了（见 #4 诊断） |
| 4 | 日志落盘 → dist，python http.server 兜底 | 首页是我的 `NO_BUILD` 占位 | `Could not resolve './build/build-content.ts'`——**`build/` 目录被上传规则当「构建产物」排除了** |
| 5 | 修掉 build/ 依赖后再发 | 首页仍是日志占位 | 构建其实成功了，是我自己的 `rm -f dist/index.html` 把产物删了又触发 fallback |
| 6 | 最简启动命令 | **成功** | — |

## 环境

- 发布通道：WorkBuddy「发布为应用」（源码上传 → 隔离沙箱容器 → install → start → 反向代理到 `xxx.workbuddy.host`）
- 沙箱约束：启动命令执行后 **60 秒内必须在指定端口响应 HTTP**，否则判死；内存/CPU 远弱于本地
- 本地对照：全量构建 2min39s（prebuild 重建图数据 ~20s + vite build + plugin-legacy terser ES5 转译为最大头）

## 排查过程（按时间顺序）

### 第一层：以为是构建太慢

第 1 次失败直接归因：构建在启动阶段跑，60 秒窗口必死。**对策**：把构建挪到 install 阶段（时限宽松）。

**结果**：仍然失败，且 install exit 1、日志尾部只有 npm 警告——看不到 vite 的报错行。盲区出现。

### 第二层：怀疑依赖太重（误诊）

devDependencies 里有 `playwright`，怀疑 install 时触发浏览器下载失败。加 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 重发。

**结果**：同样的失败。事后看：install 本身是成功的（INSTALL_EXIT=0），真正挂的是构建。

### 第三层：搭建诊断通道（关键转折）

平台详情截断报错、`.log` 后缀文件被腾讯云 WAF 拦截、远程 shell 也没有。解法：**把日志写进随产物上传的文件里，从线上读回来**。

- install 阶段：`(npm install > /tmp/build.log 2>&1; echo INSTALL_EXIT=$? >> /tmp/build.log) && (npx vite build >> /tmp/build.log 2>&1; echo BUILD_EXIT=$? >> /tmp/build.log)`
- start 阶段：如果 `dist/index.html` 不存在，就把 `/tmp/build.log` 包进 `<pre>` 写成首页（兜底占位）；同时 `cp` 一份为 `dist/buildlog.txt`（txt 后缀绕 WAF）
- 启动服务器：`python3 -m http.server 4173 --bind 0.0.0.0 --directory dist`（比 vite preview 少一层不确定性）

这一步立刻破了两案：

**破案 A：`$PORT` 不展开。** 平台回显的进程列表里，python 命令行是 `http.server --bind 0.0.0.0 --directory dist`——`--port $PORT` 整段消失，说明沙箱 startCmd 里 `$PORT` 是空串，服务默认监听 8000，平台在等 4173，必然超时。**修法：端口写死，不用变量。**

**破案 B：`build/` 目录被静默排除。** 日志里的真实报错：

```
Could not resolve './build/build-content.ts'
```

WorkBuddy 上传时按**目录名**排除「构建产物」，项目的共享构建库 `build/` 撞名，整个目录没被上传。npm install 成功、本地一切正常，唯独沙箱里 vite 打包配置文件时找不到这个模块。**修法：`build/build-content.ts` 迁到项目根目录（`git mv`），vite.config.ts 恢复静态 import。**

### 第四层：构建提速（挤进 60 秒窗口）

`build/` 问题修掉后构建其实能过，但全量构建仍远超窗口。给 `vite.config.ts` 加 `DEPLOY_LIGHT=1` 轻量模式：

- 跳过 `buildGraphData()` 全量重建（实测 ~20s；`graph-data.json` 本就提交在仓库里且新鲜）
- 跳过 plugin-legacy 的 terser ES5 转译（构建最大头；评审场景全是现代浏览器）

实测：本地全量 19s / 轻量 **1.7s**；沙箱轻量构建日志两次 `✓ built in`。本地 dev / build / Vercel 路径完全不变。

### 第五层：被自己埋的雷坑了一次

修好构建后首页仍是日志占位——日志显示 `✓ built in`，`graph-data.json` 等资源全部 200，唯独 index.html 不对。原因：startCmd 里为清旧占位写的 `rm -f dist/index.html` 把**刚构建好的** index.html 也删了，兜底逻辑又用日志顶上。**去掉 rm，最简启动命令重发，成功。**

## 最终可用的发布配方

- install：`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install && DEPLOY_LIGHT=1 npx vite build`（日志落盘 `/tmp/build.log`，分段记退出码）
- start：`cp /tmp/build.log dist/buildlog.txt 2>/dev/null; python3 -m http.server 4173 --bind 0.0.0.0 --directory dist`
- 端口写死，不用 `$PORT`；startCmd 里**不要有 rm**

## 结论与防线

1. **平台报错不可信——一律自建日志通道**。install/build 分段记退出码、日志落 dist、从线上读回。这是本次唯一有效的定位手段。
2. **WorkBuddy 上传按目录名排除「构建产物」**，`build/`、`dist/` 之类名字会被整目录静默拦掉。共享构建库必须放根目录（已迁，且 AGENTS.md 加了「勿挪进 build/」警告）。
3. **沙箱 startCmd 里 `$PORT` 不展开**，端口写死。
4. 60 秒窗口是硬门槛，重活全部放 install 阶段；`DEPLOY_LIGHT` 是为此加的正式开关，不是临时 hack。
5. 兜底诊断代码（`rm -f`、`[ -f ... ] ||`）本身会成为新的故障点——修好之后要**删掉脚手架**再发干净版本。
6. 遗留：线上 `buildlog.txt` 可公开访问（内容无敏感信息），下次干净重发时可去掉。
