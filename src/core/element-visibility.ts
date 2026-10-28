// src/core/element-visibility.ts
// 「这个元素此刻到底画不画」的统一判据。
//
// 为什么不能直接用 cytoscape 现成的 visible() / hidden() / :visible：
//
//   eleVisible = visibility === 'visible' && opacity !== 0 && takesUpSpace()
//
// 判据里含 opacity !== 0。而本项目所有装饰奇观（太极八卦 / 四维空间 /
// 生命之树 / E8 根系 / 传送门）的节点本体都是 **opacity: 0 的透明命中盒**——
// canvas 画的是图案，节点只负责接事件。它们跑在画布上"可见"，但按 visible()
// 的定义是"隐藏"的。任何用 hidden() 做的判断都会把它们全部误判掉：奇观的
// 绘制循环停画、统计漏算、取景跳过——一次误用，五个奇观同时消失。
//
// 空间隔离用的是 ele.hide()，落到样式上就是 display: none。所以这里只看
// display 与尺寸（takesUpSpace 的两个条件），边的可见性再跟端点走一遍。
//
// 命中测试（tap）不受影响：它走的是 interactive()，判据为
// events === 'yes' && visibility === 'visible' && takesUpSpace()，不含 opacity。
// 也就是说透明命中盒能点、但按 visible() 算"看不见"——这两件事本来就不该混。
//
// 不用 ele.takesUpSpace()：cytoscape 3.34 的 typings 没声明这个方法（运行时
// 有），为一行判断去补一份全局声明不划算，这里按定义手写。

import type cytoscape from 'cytoscape';

/** cytoscape 的 display 取值只有 'element'（占位）和 'none'（被 hide()）。 */
function occupiesSpace(ele: cytoscape.SingularElementArgument): boolean {
  if (ele.style('display') !== 'element') return false;
  if (!ele.isNode()) return true;
  const node = ele as cytoscape.NodeSingular;
  return node.width() !== 0 && node.height() !== 0;
}

/** 元素此刻是否真的在画布上占位（未被空间隔离藏起来）。 */
export function isElementShown(ele: cytoscape.SingularElementArgument): boolean {
  if (!occupiesSpace(ele)) return false;
  if (ele.isNode()) return true;
  // 边：cytoscape 的渲染对"端点被隐藏的边"是跳过的，但边自身的 display 仍是
  // element。统计和取景要跟渲染口径一致，所以显式再问一遍两端。
  const edge = ele as cytoscape.EdgeSingular;
  return isElementShown(edge.source()) && isElementShown(edge.target());
}
