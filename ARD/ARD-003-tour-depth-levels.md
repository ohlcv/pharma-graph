# ARD-003: 漫游深度层级过滤系统

**日期**: 2026-09-09  
**状态**: 已实现  
**决策者**: AI Assistant

---

## 背景问题

漫游（Tour）功能原有深度设置是 1-10 的数值滑块，用户无法直观理解每个数值代表什么内容。

**核心痛点**：
- 药物节点数量最多（约占 60-70%），但大部分是普通药
- 复习时用户只想看重点药（带 glow 边框的 `med-` 前缀节点），跳过普通药
- 原有设计需要用户反复调整深度值，效率低

---

## 决策

### 采用 5 档层级设计

| 档位 | 标签 | 包含的 fill 类型 | 使用场景 |
|---|---|---|---|
| **1** | 章节-结构 | `cls-structure` | 快速浏览章节框架 |
| **2** | 章节分类-概览 | + `cls-classification` | 了解知识分类 |
| **3** | **重点药-复习** | + 重点药（`stroke: glow`）| 快速过一遍重点药，跳过普通药 |
| **4** | 口诀总结-学习 | + `cls-summary`, `cls-mnemonic` | 加入记忆内容 |
| **5** | 全部节点-全面 | 全部 fill 类型 | 完整遍历 |

### 关键实现

**重点药判定逻辑**：
```typescript
function isKeyDrug(node: cytoscape.NodeSingular): boolean {
  const fill = node.data('fill') as string;
  const stroke = node.data('stroke') as string | undefined;
  return fill === 'cls-drug' && stroke === 'glow';
}
```

**档位过滤逻辑**：
```typescript
function isNodeInLevel(node: cytoscape.NodeSingular, level: number): boolean {
  const fill = node.data('fill') as string;
  const isKey = isKeyDrug(node);

  if (level >= 5) return true;  // 全部
  if (level >= 4) return ['cls-structure', 'cls-classification', 'cls-summary', 'cls-mnemonic'].includes(fill) || isKey;
  if (level >= 3) return ['cls-structure', 'cls-classification'].includes(fill) || isKey;  // 重点药
  if (level >= 2) return ['cls-structure', 'cls-classification'].includes(fill);
  return fill === 'cls-structure';
}
```

---

## 修改的文件

| 文件 | 改动 |
|---|---|
| `src/core/tour.ts` | 添加 `TOUR_DEPTH_CONFIG`、`isKeyDrug()`、`isNodeInLevel()` |
| `src/ui/tour-controller.ts` | 更新滑块格式化，显示中文标签 |
| `index.html` | 深度滑块范围从 `1-10` 改为 `1-5` |

---

## 替代方案

### 方案 A: 独立开关（未采用）
- 添加一个"仅重点药"复选框
- 缺点：增加 UI 复杂度，需要维护两个独立状态

### 方案 B: 更多档位（未采用）
- 原计划 10 档，过于细分
- 用户选择困难，实际使用场景集中在 3-5 档

---

## 后果

**正面**：
- 用户可以快速跳过普通药，只看重点药进行复习
- 中文标签更直观，减少认知负担
- 档位 3 专用于复习场景，效率提升明显

**需注意**：
- 档位 3 只显示重点药，总步数会显著减少
- 若用户想看普通药的详细信息，需切换到档位 4 或 5

---

## 后续优化建议

1. **预估步数显示**：滑块旁显示当前档位的预计步数
2. **快捷键支持**：添加 `3` 键快速切换到档位 3（复习模式）
3. **进度指示**：在漫游详情面板显示"重点药 X/Y，普通药 A/B"
