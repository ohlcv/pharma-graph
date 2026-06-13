// 复制此脚本到浏览器控制台运行，检查 Vite glob 是否正确加载
(function() {
  // 尝试获取 Vite 加载的模块
  const result = {
    hasUiState: typeof window.uiState !== 'undefined',
    hasRenderer: false,
    nodes: 0,
    edges: 0,
    isolatedNodes: []
  };

  if (window.uiState && window.uiState.renderer) {
    const cy = window.uiState.renderer.getCy();
    if (cy) {
      result.hasRenderer = true;
      result.nodes = cy.nodes().length;
      result.edges = cy.edges().length;

      // 找出孤立节点
      cy.nodes().forEach(n => {
        if (n.connectedEdges().length === 0) {
          result.isolatedNodes.push({
            id: n.id(),
            label: n.data('label')
          });
        }
      });
    }
  }

  console.log('=== 图谱诊断结果 ===');
  console.log(JSON.stringify(result, null, 2));

  // 测试特定节点
  if (window.uiState && window.uiState.renderer) {
    const cy = window.uiState.renderer.getCy();
    console.log('\n=== 测试节点连接 ===');

    const testIds = [
      'anti-inflammatory-antirheumatic-drugs',
      'antitussives',
      'analgesic-antiinflammatory-y2',
      'respiratory-drugs-y2',
      'expectorants',
      'antiasthmatics'
    ];

    testIds.forEach(id => {
      const node = cy.getElementById(id);
      if (!node.empty()) {
        const edges = node.connectedEdges();
        console.log(`${id}: degree=${edges.length}, label=${node.data('label')}`);
      } else {
        console.log(`${id}: 不存在`);
      }
    });
  }

  return result;
})();
