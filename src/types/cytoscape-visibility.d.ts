// cytoscape 3.34 自带的 typing 只有可见性的两个查询方法（visible() / hidden()），
// 漏了对应的两个写方法——运行时是有的（js.cytoscape.org/#ele.show）。
// 这里补齐，省得每个调用方各自 `as any` 绕过去。
//
// 注意：必须走 .style('visibility', …) 之外的 API。style 版的 visibility:hidden
// 只是"看不见但仍占位"（文档明确说 bezier 边仍占据 bundle 空间），节点也仍然
// 算进 boundingBox()；我们要的是 ele.hide() 那种 display:none —— 移出布局与
// 包围盒，空间隔离后的取景才不会把藏起来的空间算进去。
//
// 这个文件必须是模块（下面那个 export {} 就是干这个的）。否则
// `declare module 'cytoscape'` 会被当成**完整替换**该模块的 ambient 声明，
// 而不是往里追加——全项目的 cytoscape 类型会瞬间只剩这两个方法。

declare module 'cytoscape' {
  interface NodeSingular {
    /** http://js.cytoscape.org/#ele.show */
    show(): this;
    /** http://js.cytoscape.org/#ele.hide */
    hide(): this;
  }

  interface EdgeSingular {
    show(): this;
    hide(): this;
  }
}

export {};
