const TYPE_COLORS = {
  concept: '#6366f1',
  drug: '#22d3ee',
  disease: '#f87171',
  default: '#94a3b8'
};
const TYPE_SHAPES = {
  concept: 'ellipse',
  drug: 'round-rectangle',
  disease: 'diamond',
  default: 'ellipse'
};

let cy;
let currentLayout = 'cose';

async function loadGraph() {
  const res = await fetch('dist/graph-data.json');
  if (!res.ok) throw new Error('无法加载 dist/graph-data.json');
  const data = await res.json();
  document.getElementById('badge').textContent = `${data.nodes?.length || 0} nodes / ${data.edges?.length || 0} edges`;

  const elements = [
    ...(data.nodes || []).map(n => ({
      data: {
        id: n.id,
        label: n.label || n.id,
        type: n.type,
        category: n.category,
        summary: n.summary,
        location: n.location,
        weight: 60
      }
    })),
    ...(data.edges || []).map((e, idx) => ({
      data: {
        id: e.id || `edge-${idx}`,
        source: e.source,
        target: e.target,
        edgeType: e.type,
        reason: e.reason
      }
    }))
  ];

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: elements,
    style: [
      { selector: 'node', style: { label: 'data(label)', width: 36, height: 36, 'font-size': 12, 'font-family': "'Noto Sans SC', sans-serif", 'font-weight': 600, color: '#e2e8f0', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6, 'text-background-color': 'rgba(15,17,23,0.82)', 'text-background-shape': 'roundrectangle', 'text-background-padding': '3px', 'border-width': 1.5, 'border-color': 'rgba(255,255,255,0.12)', shape: 'ellipse', 'text-events': 'yes', cursor: 'pointer', transition: 'background-color 0.2s' } },
      { selector: 'node[type = "concept"]', style: { 'background-color': TYPE_COLORS.concept, shape: TYPE_SHAPES.concept, 'border-color': TYPE_COLORS.concept } },
      { selector: 'node[type = "drug"]', style: { 'background-color': TYPE_COLORS.drug, shape: TYPE_SHAPES.drug, 'border-color': TYPE_COLORS.drug } },
      { selector: 'node[type = "disease"]', style: { 'background-color': TYPE_COLORS.disease, shape: TYPE_SHAPES.disease, 'border-color': TYPE_COLORS.disease } },
      { selector: 'edge', style: { width: 1.5, 'line-color': 'rgba(100,116,139,0.55)', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': 'rgba(100,116,139,0.55)', 'arrow-scale': 0.7, opacity: 0.7 } },
      { selector: ':selected', style: { 'border-width': 3, 'border-color': '#ffffff', 'overlay-color': 'rgba(99,102,241,0.25)', 'overlay-padding': 6, 'overlay-opacity': 0 } },
      { selector: '.highlighted', style: { 'border-width': 3, 'border-color': '#fbbf24', 'overlay-color': 'rgba(251,191,36,0.18)', 'overlay-padding': 6, 'overlay-opacity': 0 } },
      { selector: 'edge.highlighted', style: { width: 2.5, 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24', opacity: 1 } },
      { selector: '.dimmed', style: { opacity: 0.12 } }
    ],
    layout: { name: 'preset' },
    minZoom: 0.2,
    maxZoom: 4,
    wheelSensitivity: 0.25,
    boxSelectionEnabled: true
  });

  cy.on('tap', 'node', e => {
    const n = e.target;
    cy.elements().addClass('dimmed');
    n.removeClass('dimmed').addClass('highlighted');
    n.connectedEdges().removeClass('dimmed').addClass('highlighted');
    n.neighborhood('node').removeClass('dimmed').addClass('highlighted');
    showDetail(n);
    updateStats();
  });
  cy.on('tap', e => {
    if (e.target === cy) {
      cy.elements().removeClass('dimmed highlighted highlighted-edge');
      hideDetail();
      updateStats();
    }
  });
  cy.on('dragfree', () => updateStats());
  cy.on('select unselect', () => updateStats());

  setLayout('cose');
  updateStats();
}

function setLayout(name) {
  currentLayout = name;
  document.querySelectorAll('#toolbar .btn').forEach(b => b.classList.remove('active'));
  const labels = { cose: 'cose', circle: '环形', grid: '网格', dagre: 'dagre', breadthfirst: '广度优先' };
  const btn = Array.from(document.querySelectorAll('#toolbar .btn')).find(b => b.textContent.trim().toLowerCase().includes((labels[name] || name).toLowerCase()));
  if (btn) btn.classList.add('active');

  const cfg = {
    cose: { name: 'cose-bilkent', animate: true, animationDuration: 1000, padding: 50, nodeDimensionsIncludeLabels: true, idealEdgeLength: 140 },
    circle: { name: 'circle', animate: true, padding: 50 },
    grid: { name: 'grid', animate: true, padding: 50 },
    dagre: { name: 'dagre', animate: true, padding: 50 },
    breadthfirst: { name: 'breadthfirst', directed: true, animate: true, padding: 50 }
  }[name] || { name: name, animate: true, padding: 50 };

  cy.layout({ ...cfg, onLayoutStop: () => updateStats() }).run();
}

function fit() { cy.fit(undefined, 40); }
function resetView() { cy.elements().removeClass('dimmed highlighted highlighted-edge'); hideDetail(); fit(); }

function showDetail(node) {
  const d = node.data();
  document.getElementById('d-name').textContent = d.label;
  document.getElementById('d-type').textContent = d.type;
  document.getElementById('d-cat').textContent = d.category || '—';
  document.getElementById('d-loc').textContent = d.location || '—';
  document.getElementById('d-sum').textContent = d.summary || '—';
  document.getElementById('d-degree').textContent = node.degree();

  const neighbors = node.neighborhood('node');
  const el = document.getElementById('d-neighbors');
  if (neighbors.length) {
    el.innerHTML = '<div class="detail-row" style="margin-top:6px">邻居</div>' + Array.from(neighbors).map(n => `<span class="tag">${n.data('label')}</span>`).join('');
  } else {
    el.innerHTML = '';
  }

  document.getElementById('detail').classList.add('visible');
}
function hideDetail() { document.getElementById('detail').classList.remove('visible'); }
function updateStats() {
  if (!cy) return;
  document.getElementById('stats').textContent = `nodes: ${cy.nodes().length} | edges: ${cy.edges().length}`;
}

loadGraph().catch(err => {
  document.getElementById('badge').textContent = 'error';
  document.getElementById('stats').textContent = err.message;
});