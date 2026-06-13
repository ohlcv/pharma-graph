// 诊断孤立节点问题 - 复制到浏览器控制台运行

(function() {
  const cy = window.__cy__; // 假设 cy 实例被暴露在 window 上

  if (!cy) {
    console.log(' Cytoscape 实例未找到。请确保页面已加载。');
    return;
  }

  // 查找"抗风湿药"节点
  const rheumaticNode = cy.$('node[label = "抗风湿药"]');

  if (rheumaticNode.empty()) {
    console.log(' 未找到"抗风湿药"节点！');
    return;
  }

  const nodeId = rheumaticNode.id();
  console.log('=== 抗风湿药节点诊断 ===');
  console.log('节点 ID:', nodeId);
  console.log('节点数据:', rheumaticNode.data());

  // 检查边
  const connectedEdges = rheumaticNode.connectedEdges();
  console.log('连接边数量:', connectedEdges.length);

  if (connectedEdges.length === 0) {
    console.log('');
    console.log(' 该节点确实没有边！');
    console.log(' 检查数据是否正确加载...');

    // 检查是否有同名节点
    const sameLabel = cy.nodes().filter(n => n.data('label') === '抗风湿药');
    console.log(' 同名节点数量:', sameLabel.length);
    sameLabel.forEach((n, i) => {
      console.log(`  [${i}] ID: ${n.id()}, 数据:`, n.data());
    });
  } else {
    console.log(' 边详情:');
    connectedEdges.forEach((e, i) => {
      console.log(`  [${i}] ${e.source().id()} → ${e.target().id()}, 类型: ${e.data('type')}`);
    });
  }

  // 列出所有孤立节点
  console.log('');
  console.log('=== 孤立节点列表 ===');
  const isolated = cy.nodes().filter(n => n.connectedEdges().length === 0);
  console.log('孤立节点数量:', isolated.length);
  isolated.forEach((n, i) => {
    console.log(`  [${i}] ${n.id()} - ${n.data('label') || '(无label)'}`);
  });
})();
