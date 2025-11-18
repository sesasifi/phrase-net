// script.js - Phrase Nets MVP (D3.js v7)
// Processing and rendering entirely in browser.
// Features: tokenize, remove stopwords, cooccurrence (window/sentence), force layout, zoom/pan, hover tooltip, click highlight, export JSON, save SVG.

// ------- Utility data -------
const DEFAULT_STOPWORDS = new Set([
  "a","à","ao","aos","as","o","os","e","é","em","um","uma","uns","umas","de","do","da","dos","das",
  "que","por","para","com","como","se","na","no","nas","nos","pelos","pelo","pela","pelas","suas","seu",
  "eu","tu","ele","ela","eles","elas","nós","vós","me","te","lhe","nos","vos","lhe","lhes","sim","não","mais","também"
,"i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"
]);

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

// Build graph: nodes map and edges map
function buildGraphFromText(rawText, opts){
  const sentences = splitIntoSentences(rawText);
  const tokensBySentence = sentences.map(s => tokenize(s).map(normalizeToken).filter(Boolean));
  const nodesCounts = new Map();
  const edges = new Map(); // key "a||b" ordered lexicographically

  for(const tokens of tokensBySentence){
    // optionally remove stopwords
    const filtered = opts.useStopwords ? tokens.filter(t=>!DEFAULT_STOPWORDS.has(t)) : tokens;
    // count nodes
    for(const t of filtered){
      nodesCounts.set(t, (nodesCounts.get(t)||0) + 1);
    }
    // build relations
    if(opts.relationType === 'window'){
      const w = Math.max(1, opts.windowSize|0);
      for(let i=0;i<filtered.length;i++){
        for(let j=i+1;j<Math.min(filtered.length, i+w)+1;j++){
          const a = filtered[i], b = filtered[j];
          if(!a || !b || a===b) continue;
          const [x,y] = a< b ? [a,b] : [b,a];
          const key = `${x}||${y}`;
          edges.set(key, (edges.get(key)||0) + 1);
        }
      }
    } else { // sentence cooccurrence
      for(let i=0;i<filtered.length;i++){
        for(let j=i+1;j<filtered.length;j++){
          const a = filtered[i], b = filtered[j];
          if(!a || !b || a===b) continue;
          const [x,y] = a< b ? [a,b] : [b,a];
          const key = `${x}||${y}`;
          edges.set(key, (edges.get(key)||0) + 1);
        }
      }
    }
  }

  // convert to arrays
  let nodesArr = Array.from(nodesCounts.entries()).map(([k,v])=>({id:k, count:v}));
  // sort by freq desc and keep topN if specified
  if(opts.topN && nodesArr.length > opts.topN){
    nodesArr.sort((a,b)=>b.count - a.count);
    nodesArr = nodesArr.slice(0, opts.topN);
  }
  const nodeSet = new Set(nodesArr.map(n=>n.id));

  let edgesArr = Array.from(edges.entries()).map(([k,v])=>{
    const [a,b] = k.split('||');
    return {source:a, target:b, weight:v};
  }).filter(e=> nodeSet.has(e.source) && nodeSet.has(e.target) );

  // apply min edge weight threshold
  edgesArr = edgesArr.filter(e=> e.weight >= opts.minEdgeWeight);

  // recompute node degrees and maybe prune isolated nodes
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
  .attr('refX',13)
  .attr('refY',0)
  .attr('orient','auto')
  .attr('markerWidth',3)
  .attr('markerHeight',3)
  .attr('xoverflow','visible')
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
    .force('link', d3.forceLink(graph.edges).id(d=>d.id).distance(80).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collision', d3.forceCollide().radius(d=> sizeScale(d.count)+4));

  linkGroup = container.append('g').attr('class','links')
    .selectAll('line').data(graph.edges).enter()
      .append('line')
      .attr('stroke-width', d=> Math.max(1, weightScale(d.weight)))
      .attr('stroke','#999')
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
    .attr('r', d=> sizeScale(d.count))
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
    //.style('font-size',`${parseInt(d=>d.count)*100}px`)
    .style('font-size',(d=> sizeScale(d.count)))
    //.style('font-size','10px')
    .text(d=> d.id);

  // tick
  simulation.on('tick', ()=>{
    linkGroup
      .attr('x1', d=> d.source.x)
      .attr('y1', d=> d.source.y)
      .attr('x2', d=> d.target.x)
      .attr('y2', d=> d.target.y);
    nodeGroup.attr('transform', d=> `translate(${d.x},${d.y})`);
  });

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
    windowSize: +document.getElementById('windowSize').value,
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
