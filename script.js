// script.js - Phrase Nets MVP (D3.js v7)
// Processing and rendering entirely in browser.
// Features: tokenize, remove stopwords, cooccurrence (window/sentence), force layout, zoom/pan, hover tooltip, click highlight, export JSON, save SVG.

// ------- Utility data -------
const DEFAULT_STOPWORDS = new Set([
  "a","à","ao","aos","as","o","os","e","é","em","um","uma","uns","umas","de","do","da","dos","das",
  "que","por","para","com","como","se","na","no","nas","nos","pelos","pelo","pela","pelas","suas","seu",
  "eu","tu","ele","ela","eles","elas","nós","vós","me","te","lhe","nos","vos","lhe","lhes","sim","não","mais","também"
,"of","is", "are", "at", "the", "a", "and" 
,"i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "an", "but", "if", "or", "because", "as", "until", "while", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"
]);

// Detect "A <relation phrase> B" relations inside a sentence (tokens already normalized).
// relationPhrase may be one or more words (e.g. "and", "is a", "of the").
// validNodesSet is optional: if provided only pairs where both A and B belong to that set are returned.
function extractRelationPairs(tokens, relationPhrase, validNodesSet = null) {
  const relParts = relationPhrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (relParts.length === 0) return [];

  const pairs = [];
  // A at i, relation parts at i+1 ... i+relLen, B at i+relLen+1
  const relLen = relParts.length;
  for (let i = 0; i < tokens.length - (relLen + 1); i++) {
    const A = tokens[i];
    // build slice of tokens that correspond to the candidate relation
    const candidateRel = tokens.slice(i + 1, i + 1 + relLen).join(' ');
    if (candidateRel == relParts.join(' ')) {
      const B = tokens[i + 1 + relLen];
      if (!A || !B || A === B) continue;
      if (validNodesSet) {
        if (!validNodesSet.has(A) || !validNodesSet.has(B)) continue;
      }
      pairs.push([A, B]);
    }
  }
  return pairs;
}



// simple sentence splitter (keeps punctuation as boundary)
function splitIntoSentences(text){
  return text.split(/[\n\.\!\?]+/).map(s=>s.trim()).filter(Boolean);
}

function tokenize(text){
  // remove punctuation except apostrophes inside words, split by whitespace
  return text
    .replace(/[“”"()\[\],;:\-——–«»<>]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function normalizeToken(tok){
  return tok.toLowerCase().replace(/^'+|'+$/g,''); // trim leading/trailing apostrophes
}


// Build graph: nodes map and edges map (two-pass, supports multi-word relation phrases)
function buildGraphFromText(rawText, opts){//;
  const sentences = splitIntoSentences(rawText);//;
  const tokensBySentence = sentences.map(s => tokenize(s).map(normalizeToken).filter(Boolean));//;

  // ---------- PASS 1: count nodes (using stopword option) ----------
  const nodesCounts = new Map();//;
  for(const tokens of tokensBySentence){
    const filtered = opts.useStopwords ? tokens.filter(t=>!DEFAULT_STOPWORDS.has(t)) : tokens;
    for(const t of filtered){
      nodesCounts.set(t, (nodesCounts.get(t)||0) + 1);
    }
  }

  // convert counts -> nodes array and apply topN
  let nodesArr = Array.from(nodesCounts.entries()).map(([k,v])=>({id:k, count:v}));
  if(opts.topN && nodesArr.length > opts.topN){
    nodesArr.sort((a,b)=>b.count - a.count);
    nodesArr = nodesArr.slice(0, opts.topN);
  }
  const nodeSet = new Set(nodesArr.map(n=>n.id));

  // ---------- PASS 2: build edges using final nodeSet ----------
  const edges = new Map(); // key "a||b" ordered lexicographically
  const relPhrase = (opts.relationWord && opts.relationWord.trim()) ? opts.relationWord.toLowerCase().trim() : null;

  for(const tokens of tokensBySentence){
    // filtered tokens for window/sentence cooccurrence (stopwords respected)
    const filtered = opts.useStopwords ? tokens.filter(t=>!DEFAULT_STOPWORDS.has(t)) : tokens;

    if (opts.relationType === 'orthographic' && relPhrase) {
      // relation-based extraction: use original tokens for pattern matching but only
      // add edges when both A and B are in final nodeSet.
      const pairs = extractRelationPairs(tokens, relPhrase);
      for (const [a, b] of pairs) {
        if (!nodeSet.has(a) || !nodeSet.has(b)) continue;
        if (a === b) continue;
        //const [x, y] = a < b ? [a, b] : [b, a];
        const [x, y] = [a, b];
        const key = `${x}||${y}`;
        edges.set(key, (edges.get(key) || 0) + 1);
      }

    // } else if (opts.relationType === 'window') {
    //   const w = Math.max(1, opts.windowSize|0);
    //   for(let i=0;i<filtered.length;i++){
    //     for(let j=i+1;j<Math.min(filtered.length, i+w)+1;j++){
    //       const a = filtered[i], b = filtered[j];
    //       if(!a || !b || a===b) continue;
    //       if (!nodeSet.has(a) || !nodeSet.has(b)) continue;
    //       const [x,y] = a< b ? [a,b] : [b,a];
    //       const key = `${x}||${y}`;
    //       edges.set(key, (edges.get(key)||0) + 1);
    //     }
    //   }

    } else if (opts.relationType === 'sentence'){ // sentence cooccurrence
      for(let i=0;i<filtered.length;i++){
        for(let j=i+1;j<filtered.length;j++){
          const a = filtered[i], b = filtered[j];
          if(!a || !b || a===b) continue;
          if (!nodeSet.has(a) || !nodeSet.has(b)) continue;
          //const [x,y] = a< b ? [a,b] : [b,a];
          const [x,y] = [a,b];
          const key = `${x}||${y}`;
          edges.set(key, (edges.get(key)||0) + 1);
        }
      }
    }
  }

  // ---------- convert edges map to array and apply minEdgeWeight ----------
  let edgesArr = Array.from(edges.entries()).map(([k,v])=>{
    const [a,b] = k.split('||');
    return {source:a, target:b, weight:v};
  });

  edgesArr = edgesArr.filter(e=> e.weight >= opts.minEdgeWeight);

  // recompute node degrees and prune isolated nodes
  const degree = new Map();
  for(const n of nodesArr) degree.set(n.id, 0);
  for(const e of edgesArr){
    degree.set(e.source, degree.get(e.source)+1);
    degree.set(e.target, degree.get(e.target)+1);
  }
  nodesArr = nodesArr.filter(n=> degree.get(n.id) > 0);

  return {nodes: nodesArr, edges: edgesArr};
}

// ------- Rendering with D3 -------
const svg = d3.select('#svgCanvas');
const width = +svg.attr('width');
const height = +svg.attr('height');

const container = svg.append('g').attr('class','container');

// define arrow (not necessary for undirected, but kept)
svg.append('defs').append('marker')
  .attr('id','arrow')
  .attr('viewBox','-0 -5 10 10')
  .attr('refX',0)//0
  .attr('refY',0)
  .attr('orient','auto')
  .attr('markerWidth',4)
  .attr('markerHeight',4)
  //.attr('xoverflow','visible')
  .attr('xoverflow','hidden')
  .append('svg:path')
  .attr('d','M 0,-5 L 10 ,0 L 0,5')
  .attr('fill','#999')
  .style('stroke','none');

const zoom = d3.zoom().on('zoom', (event)=>{ container.attr('transform', event.transform); });
svg.call(zoom);

// tooltip
const tooltip = d3.select('body').append('div')
  .attr('class','tooltip')
  .style('position','absolute')
  .style('padding','6px 8px')
  .style('background','#fff')
  .style('border','1px solid #ddd')
  .style('box-shadow','0 2px 6px rgba(0,0,0,0.08)')
  .style('pointer-events','none')
  .style('display','none');

let simulation, linkGroup, nodeGroup, labelGroup;

function renderGraph(graph){
  // clear previous
  container.selectAll('*').remove();
  if(simulation) simulation.stop();

  // scales
  const sizeScale = d3.scaleSqrt().domain(d3.extent(graph.nodes, d=>d.count)).range([6,28]);
  const weightScale = d3.scaleLinear().domain(d3.extent(graph.edges, e=>e.weight)).range([1,6]);

  const rgbScale = d3.scaleSqrt().domain(d3.extent(graph.nodes, d=>d.count)).range([200,100]);

  // force simulation
  simulation = d3.forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.edges).id(d=>d.id).distance(150).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collision', d3.forceCollide().radius(d=> sizeScale(d.count)+4));

  linkGroup = container.append('g').attr('class','links')
    .selectAll('line')//line
    .data(graph.edges)
    .enter()
      .append('line')//line
      .attr('stroke-width', d=> Math.max(1, weightScale(d.weight)))
      .attr('stroke','#999')
      //.attr('fill','none')
      .attr('stroke-opacity',0.6)
      .attr('marker-end','url(#arrow)');

  nodeGroup = container.append('g').attr('class','nodes')
    .selectAll('g').data(graph.nodes).enter()
    .append('g').attr('class','node')
      .call(d3.drag()
        .on('start', (event,d)=>{ if(!event.active) simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
        .on('drag', (event,d)=>{ d.fx = event.x; d.fy = event.y; })
        .on('end', (event,d)=>{ if(!event.active) simulation.alphaTarget(0); d.fx=null; d.fy=null; })
      );

  nodeGroup.append('circle')
    //.attr('r', d=> sizeScale(d.count))

.attr("r", d => {
    const textLen = d.id.length;
    const minR = 10;
    const r = Math.max(minR, textLen * 4.5);  // accommodate long labels
    return r;
})

    //.attr('fill','#1f77b4')
    .attr('fill','#fff0')
    //.attr('stroke','#fff')
    .attr('stroke','#fff0')
    .attr('stroke-width',1.2)
    .on('mouseover', (event,d)=>{
      tooltip.style('display','block').html(`<strong>${d.id}</strong><br/>Freq: ${d.count}`);
    })
    .on('mousemove', (event)=> tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px'))
    .on('mouseout', ()=> tooltip.style('display','none'))
    .on('click', (event,d)=> highlightNode(d.id));

  nodeGroup.append('text')
    //.attr('dy', '-0.9em')
    .attr('dy', '0em')
    .attr('text-anchor','middle')
    .attr('pointer-events','none')
    //.attr('fill',d=> `rgb(255,255,${rgbScale(d.count)})`)
    //.attr('fill','#1f77b4')
    .attr('fill',d=>`rgb(${rgbScale(d.count)},${rgbScale(d.count)},255)`)

    //.style('font-size',(d=> sizeScale(d.count)))

    .style("font-size", d => {
    const r = sizeScale(d.count);
    let size = r * 0.9;   // proportional to node radius
    const minSize = 7;
    const maxSize = 24;
    size = Math.max(minSize, Math.min(maxSize, size));
    return size + "px";
})
  
    .text(d=> d.id);
    

  // tick
  // simulation.on('tick', ()=>{
  //   linkGroup
  //     .attr('x1', d=> d.source.x)
  //     .attr('y1', d=> d.source.y)
  //     .attr('x2', d=> d.target.x)
  //     .attr('y2', d=> d.target.y);
  //   nodeGroup.attr('transform', d=> `translate(${d.x},${d.y})`);
  // });
  ///////////////////////////////////////////

simulation.on('tick', ()=>{
  linkGroup.each(function(d) {
    const rSource = sizeScale(d.source.count);
    const rTarget = sizeScale(d.target.count);

    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Unit vector
    const ux = dx / dist;
    const uy = dy / dist;

    // Start and end points *at the edge* of each node
    const x1 = d.source.x + ux * rSource;
    const y1 = d.source.y + uy * rSource;
    const x2 = d.target.x - ux * rTarget;
    const y2 = d.target.y - uy * rTarget;

    d3.select(this)
      .attr("x1", x1)
      .attr("y1", y1)
      .attr("x2", x2)
      .attr("y2", y2);
  });
  nodeGroup.attr('transform', d=> `translate(${d.x},${d.y})`);
});

// simulation.on("tick", () => {
//   linkGroup.each(function (d) {
//     const rSource = sizeScale(d.source.count);
//     const rTarget = sizeScale(d.target.count);

//     const dx = d.target.x - d.source.x;
//     const dy = d.target.y - d.source.y;
//     const dist = Math.sqrt(dx*dx + dy*dy) || 1;

//     // Unit vector
//     const ux = dx / dist;
//     const uy = dy / dist;

//     // Start and end points at node boundaries
//     const x1 = d.source.x + ux * rSource;
//     const y1 = d.source.y + uy * rSource;
//     const x2 = d.target.x - ux * rTarget;
//     const y2 = d.target.y - uy * rTarget;

//     // Compute midpoint
//     const mx = (x1 + x2) / 2;
//     const my = (y1 + y2) / 2;

//     // Perpendicular for curvature
//     const nx = -uy;
//     const ny = ux;

//     // Curvature strength (tweakable)
//     const curvature = Math.min(60, dist * 0.25);

//     // Control point
//     const cx = mx + nx * curvature;
//     const cy = my + ny * curvature;

//     // Draw curved link (quadratic Bezier)
//     d3.select(this)
//       .select("path")
//       .attr("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
//   });

//   nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
// });

// simulation.on("tick", () => {
//   linkGroup.each(function (d) {

//     // Normalize source/target
//     const s = (typeof d.source === "object") ? d.source : graph.nodes.find(n => n.id === d.source);
//     const t = (typeof d.target === "object") ? d.target : graph.nodes.find(n => n.id === d.target);

//     const rSource = sizeScale(s.count);
//     const rTarget = sizeScale(t.count);

//     let dx = t.x - s.x;
//     let dy = t.y - s.y;
//     const dist = Math.sqrt(dx*dx + dy*dy);

//     if (!isFinite(dist) || dist < 1) return;

//     const ux = dx / dist;
//     const uy = dy / dist;

//     // endpoints at circle edges
//     const x1 = s.x + ux * rSource;
//     const y1 = s.y + uy * rSource;
//     const x2 = t.x - ux * rTarget;
//     const y2 = t.y - uy * rTarget;

//     // midpoint + perpendicular curvature
//     const mx = (x1 + x2) / 2;
//     const my = (y1 + y2) / 2;

//     const curvature = Math.max(20, dist * 0.15);
//     const cx = mx + (-uy) * curvature;
//     const cy = my + (ux) * curvature;

//     const dStr = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;

//     d3.select(this).select("path.link-path").attr("d", dStr);
//   });

//   nodeGroup.attr("transform", d => `translate(${d.x}, ${d.y})`);
// });

  // fill sidepanel frequency list
  const freqList = d3.select('#freqList');
  freqList.selectAll('*').remove();
  graph.nodes.slice().sort((a,b)=>b.count-a.count).slice(0,50).forEach(n=>{
    freqList.append('li').text(`${n.id} — ${n.count}`).on('click', ()=> centerOnNode(n.id));
  });

  // store current graph
  svg.node().__graph__ = graph;
}

// Highlight node and its neighborhood
function highlightNode(nodeId){
  const g = svg.node().__graph__;
  if(!g) return;
  const neighbors = new Set();
  g.edges.forEach(e=>{
    if(e.source.id === nodeId) neighbors.add(e.target.id);
    else if(e.target.id === nodeId) neighbors.add(e.source.id);
  });
  neighbors.add(nodeId);

  // dim others
  d3.selectAll('.node').select('circle').style('opacity', d=> neighbors.has(d.id)?1:0.15);
  d3.selectAll('line').style('opacity', l=> (l.source.id===nodeId || l.target.id===nodeId)?1:0.05).style('stroke','#333');

  // show details
  const node = g.nodes.find(n=>n.id===nodeId);
  const details = document.getElementById('nodeDetails');
  details.innerHTML = `<strong>${node.id}</strong><p>Frequência: ${node.count}</p><p>Vizinhança: ${Array.from(neighbors).filter(x=>x!==nodeId).slice(0,40).join(', ')}</p>`;
}

// Center on node (search / click from list)
function centerOnNode(nodeId){
  const g = svg.node().__graph__;
  if(!g) return;
  const n = g.nodes.find(x=>x.id===nodeId);
  if(!n) return;
  const transform = d3.zoomTransform(svg.node());
  const x = width/2 - n.x*transform.k;
  const y = height/2 - n.y*transform.k;
  svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(x,y).scale(transform.k));
}

// ------- UI wiring -------
document.getElementById('minEdgeWeight').addEventListener('input', (e)=> {
  document.getElementById('minEdgeVal').innerText = e.target.value;
});

document.getElementById('generate').addEventListener('click', ()=>{
  const txt = document.getElementById('inputText').value.trim();
  if(!txt){ alert('Insira o texto no campo acima.'); return; }
  const opts = {
    relationType: document.getElementById('relationType').value,
    relationWord: document.getElementById('relationWord').value,
    //windowSize: +document.getElementById('windowSize').value,
    useStopwords: document.getElementById('useStopwords').checked,
    minEdgeWeight: +document.getElementById('minEdgeWeight').value,
    topN: +document.getElementById('topN').value
  };
  const graph = buildGraphFromText(txt, opts);
  renderGraph(graph);
});

document.getElementById('exportJson').addEventListener('click', ()=>{
  const graph = svg.node().__graph__;
  if(!graph){ alert('Nenhuma visualização gerada ainda.'); return; }
  const data = JSON.stringify(graph, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'phrase_net.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('saveSvg').addEventListener('click', ()=>{
  const svgNode = document.getElementById('svgCanvas');
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgNode);
  const blob = new Blob([source], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'phrase_net.svg'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('resetBtn').addEventListener('click', ()=>{
  document.getElementById('inputText').value = '';
  container.selectAll('*').remove();
  d3.select('#freqList').selectAll('*').remove();
  document.getElementById('nodeDetails').innerHTML = 'Selecione um nó para ver detalhes.';
  svg.node().__graph__ = null;
});

// drag & drop .txt into textarea
const inputArea = document.getElementById('inputText');
inputArea.addEventListener('dragover', (e)=> e.preventDefault());
inputArea.addEventListener('drop', (e)=>{
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (ev)=> inputArea.value = ev.target.result;
  reader.readAsText(f);
});

// small helper to center on node when clicking list items is attached in renderGraph()

// end of script.js
