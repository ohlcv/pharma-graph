

## Cytoscape.js 核心概念与字段详解

Cytoscape.js 是一个基于 JavaScript 的图可视化库，核心概念如下：

---

### 1. **Graph（图）**
图是由节点（nodes）和边（edges）组成的数据结构。

**主要 API：**
```javascript
cy.add([
  { group: 'nodes', data: { id: 'n0' }, position: { x: 100, y: 100 } },
  { group: 'edges', data: { id: 'e0', source: 'n0', target: 'n1' } }
]);
```

---

### 2. **Node（节点）**
代表图中的实体。

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `group` | string | 是 | 值固定为 `'nodes'` |
| `data` | object | 是 | 节点数据，包含 `id`（唯一标识）等 |
| `data.id` | string | 是 | 节点唯一 ID，不可重复 |
| `data.label` | string | 否 | 显示文本标签 |
| `data.weight` | number | 否 | 权重（常用于布局/分析） |
| `data.color` | string | 否 | 颜色 |
| `data.shape` | string | 否 | 形状（如 `'ellipse'`, `'rectangle'`） |
| `position` | object | 否 | 坐标 `{ x: number, y: number }` |
| `position.x` | number | 否 | X 坐标 |
| `position.y` | number | 否 | Y 坐标 |
| `scratch` | object | 否 | 自定义临时数据存储 |
| `classes` | string | 否 | CSS 类名（空格分隔） |
| `selected` | boolean | 否 | 是否默认选中 |
| `locked` | boolean | 否 | 是否锁定位置（不可拖拽） |
| `grabbable` | boolean | 否 | 是否可拖拽 |

---

### 3. **Edge（边）**
代表节点之间的关系/连接。

**字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `group` | string | 是 | 值固定为 `'edges'` |
| `data` | object | 是 | 边数据 |
| `data.id` | string | 是 | 边唯一 ID |
| `data.source` | string | 是 | 起始节点 ID |
| `data.target` | string | 是 | 目标节点 ID |
| `data.type` | string | 否 | 关系类型（如 `'interacts'`, `'binds'`） |
| `data.strength` | number | 否 | 关系强度（用于力学布局） |
| `data.weight` | number | 否 | 边权重 |
| `data.label` | string | 否 | 显示文本 |
| `data.color` | string | 否 | 颜色 |
| `classes` | string | 否 | CSS 类名 |
| `selected` | boolean | 否 | 是否默认选中 |

---

### 4. **Layout（布局）**
控制节点在画布上的排列方式。

**常用布局及参数：**

#### a) `circle`（圆形布局）
```javascript
{ name: 'circle', radius: 200, startAngle: 0, sweep: 360, clockwise: true }
```

#### b) `grid`（网格布局）
```javascript
{ name: 'grid', rows: 3, cols: 3, padding: 10 }
```

#### c) `breadthfirst`（分层布局）
```javascript
{ name: 'breadthfirst', directed: true, roots: ['#n0'] }
```

#### d) `cose`（力学/弹簧布局）
```javascript
{
  name: 'cose',
  animate: 'end',
  animationDuration: 1000,
  nodeRepulsion: 8000,
  idealEdgeLength: 100,
  edgeElasticity: 100,
  gravity: 0.1,
  numIter: 1000,
  randomize: false
}
```

#### e) `concentric`（同心圆布局）
```javascript
{ name: 'concentric', concentric: (node) => node.data('level'), levelWidth: () => 1 }
```

#### f) `dagre`（有向无环图布局）
```javascript
{ name: 'dagre', rankDir: 'TB', rankSep: 100, edgeSep: 50 }
```

**通用布局参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | string | 布局名称 |
| `animate` | boolean/string | 是否动画（`'end'` 仅结束时动画） |
| `animationDuration` | number | 动画时长（毫秒） |
| `padding` | number | 画布边距 |
| `fit` | boolean | 布局后是否自动适应画布 |

---

### 5. **Style（样式）**
通过 `cy.style()` 定义节点、边、标签的视觉样式。

**样式选择器：**

```javascript
cy.style([
  // 节点样式
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label': 'data(label)',
      'width': 40,
      'height': 40,
      'text-valign': 'bottom',
      'font-size': 12,
      'shape': 'ellipse'
    }
  },
  // 边样式
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'opacity': 0.8
    }
  },
  // 特定节点
  {
    selector: '#n0',
    style: { 'background-color': 'red' }
  },
  // 悬停/选中状态
  {
    selector: ':selected',
    style: { 'border-width': 3, 'border-color': 'black' }
  },
  // class
  {
    selector: '.highlighted',
    style: { 'background-color': 'yellow', 'border-color': 'orange' }
  }
]);
```

**常用样式属性（Node）：**

| 属性 | 示例值 | 说明 |
|------|--------|------|
| `width` | `40` | 节点宽度 |
| `height` | `40` | 节点高度 |
| `shape` | `'ellipse'` | 形状 |
| `background-color` | `'#ccc'` | 填充色 |
| `border-width` | `2` | 边框宽度 |
| `border-color` | `'#333'` | 边框颜色 |
| `label` | `'data(label)'` | 标签文本 |
| `text-halign` | `'center'` | 标签水平对齐 |
| `text-valign` | `'bottom'` | 标签垂直对齐 |
| `font-size` | `12` | 字体大小 |
| `color` | `'#000'` | 文字颜色 |
| `opacity` | `0.9` | 透明度 |
| `text-wrap` | `'wrap'` | 文字换行 |

**常用样式属性（Edge）：**

| 属性 | 示例值 | 说明 |
|------|--------|------|
| `width` | `2` | 线宽 |
| `line-color` | `'#999'` | 线条颜色 |
| `curve-style` | `'bezier'` | 曲线类型（`straight`, `bezier`, `haystack`） |
| `target-arrow-shape` | `'triangle'` | 目标箭头形状 |
| `source-arrow-shape` | `'none'` | 源箭头形状 |
| `target-arrow-color` | `'#999'` | 目标箭头颜色 |
| `line-style` | `'solid'` | 线型（`solid`, `dashed`, `dotted`） |
| `opacity` | `0.8` | 透明度 |
| `label` | `'data(label)'` | 边标签 |
| `font-size` | `10` | 字体大小 |

---

### 6. **Events（事件）**

```javascript
cy.on('tap', 'node', function(evt) {
  const node = evt.target;
  console.log('点击了节点:', node.id());
});

cy.on('mouseover', 'node', function(evt) {
  document.body.style.cursor = 'pointer';
});

cy.on('cxttap', 'node', function(evt) {
  // 右键点击
});
```

**常用事件：**
| 事件 | 触发时机 |
|------|----------|
| `tap` | 单击 |
| `dbltap` | 双击 |
| `cxttap` | 右键单击 |
| `mouseover` | 鼠标悬停 |
| `mouseout` | 鼠标移出 |
| `drag` | 拖拽中 |
| `select` | 选中 |
| `unselect` | 取消选中 |
| `layoutstart` | 布局开始 |
| `layoutstop` | 布局结束 |

---

### 7. **Viewport（视口控制）**

| 操作 | 说明 |
|------|------|
| `cy.fit()` | 自动缩放适应所有元素 |
| `cy.zoom()` | 获取/设置缩放级别 |
| `cy.pan()` | 获取/设置平移 |
| `cy.center()` | 居中 |
| `cy.maximize()` | 最大化画布 |
| `cy.resize()` | 窗口大小改变时重绘 |

---

### 8. **Collection（元素集合操作）**

```javascript
cy.$('#n0')           // 按 ID 获取
cy.$('node')          // 所有节点
cy.$('edge')          // 所有边
cy.$('node[weight > 50]')  // 按数据过滤
cy.nodes()            // 所有节点
cy.edges()            // 所有边
cy.$(':selected')     // 选中的元素
```

---

### 9. **核心初始化配置**

```javascript
const cy = cytoscape({
  container: document.getElementById('cy'), // DOM 容器

  elements: [ /* nodes & edges 数组 */ ],

  style: [ /* 样式数组 */ ],

  layout: { name: 'circle' },

  // 可选配置
  minZoom: 0.1,
  maxZoom: 3.0,
  wheelSensitivity: 0.3,
  boxSelectionEnabled: true,
  autounselectify: false,
  autoungrabify: false,
  userPanningEnabled: true,
  userZoomingEnabled: true,
  boxSelectionEnabled: true,
  textureOnViewport: false,
  motionBlur: false
});
```

---

### 10. **完整示例结构**

```javascript
const cy = cytoscape({
  container: document.getElementById('cy'),

  elements: [
    {
      data: { id: 'n1', label: '药物A', weight: 80, color: '#FF6B6B', shape: 'ellipse' },
      position: { x: 200, y: 100 },
      group: 'nodes',
      classes: 'highlighted'
    },
    {
      data: { id: 'n2', label: '靶点B', weight: 60, color: '#4ECDC4' },
      position: { x: 300, y: 200 },
      group: 'nodes'
    },
    {
      data: { id: 'e1', source: 'n1', target: 'n2', type: 'inhibits', strength: 0.9, weight: 10, color: '#666' },
      group: 'edges'
    }
  ],

  style: [
    {
      selector: 'node',
      style: {
        'label': 'data(label)',
        'background-color': 'data(color)',
        'width': 'mapData(weight, 0, 100, 20, 60)',
        'height': 'mapData(weight, 0, 100, 20, 60)',
        'text-valign': 'bottom',
        'font-size': 14
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(type)'
      }
    }
  ],

  layout: { name: 'cose', animate: 'end', randomize: false }
});
```

---

### 字段汇总表

**Node 必填：**
- `group: 'nodes'`
- `data.id: string`

**Node 可选：**
- `data` 内的任何自定义字段（`label`, `weight`, `color`, `shape` 等）
- `position: { x, y }`
- `classes`
- `locked`, `grabbable`, `selected`
- `scratch`

**Edge 必填：**
- `group: 'edges'`
- `data.id: string`
- `data.source: string`（节点 ID）
- `data.target: string`（节点 ID）

**Edge 可选：**
- `data` 内的任何自定义字段（`type`, `strength`, `weight`, `label` 等）
- `classes`
- `selected`

以上即为 Cytoscape.js 的全部核心概念和字段。如果你的项目是**药物-靶点相互作用图**，节点的 `data` 里可以放药物名/靶点名、类型、权重/重要性分数等信息，边的 `data` 里可以放相互作用类型（如 `inhibits`/`activates`/`binds`）和强度等信息。