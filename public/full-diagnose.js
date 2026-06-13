// 复制到浏览器控制台运行 - 完整诊断
(function() {
  const cy = uiState.renderer.getCy();

  console.log('=== 图谱统计 ===');
  console.log('节点:', cy.nodes().length);
  console.log('边:', cy.edges().length);

  // 检查所有边是否有效
  console.log('\n=== 检查无效边 ===');
  let invalidEdges = 0;
  cy.edges().forEach(e => {
    const source = e.source();
    const target = e.target();
    if (source.empty() || target.empty()) {
      invalidEdges++;
      console.log('无效边:', e.id());
    }
  });
  console.log('无效边总数:', invalidEdges);

  // 测试关键节点
  console.log('\n=== 测试关键节点 ===');
  const testIds = [
    'anti-inflammatory-antirheumatic-drugs',
    'antitussives',
    'analgesic-antiinflammatory-y2',
    'respiratory-drugs-y2',
    'expectorants',
    'antiasthmatics',
    'hypertension-management',
    'lipid-disorders-management',
    'coronary-heart-disease'
  ];

  testIds.forEach(id => {
    const n = cy.getElementById(id);
    if (n.empty()) {
      console.log('❌ ' + id + ': 不存在');
    } else {
      const deg = n.connectedEdges().length;
      console.log('✓ ' + id + ': degree=' + deg + ', label=' + n.data('label'));
    }
  });

  // 列出孤立节点
  console.log('\n=== 孤立节点 (degree=0) ===');
  const isolated = cy.nodes().filter(n => n.connectedEdges().length === 0);
  console.log('数量:', isolated.length);
  isolated.slice(0, 20).forEach(n => {
    console.log('  ' + n.id() + ' - ' + (n.data('label') || '(无)'));
  });
})();
