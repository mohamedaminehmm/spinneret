/* Page reader: finds candidate key phrases, scores them, maps them to screen rectangles. */
(function (root) {
'use strict';
const STOP=new Set(('the a an and or but if of to in on at by for with from as is are was were be been being it its this that these those he she they we you not no do does did have has had will would can could should may might than then so such into over under about after before between also more most other some any each which who whom whose what when where why how there their them his her our your me us de la le les un une des du et en est que qui dans pour par sur avec au aux ce cette ces se sa son ses il elle ils elles nous vous ne pas plus ou').split(' '));
const RE=/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
function tokenize(text){const out=[];let m;RE.lastIndex=0;while((m=RE.exec(text)))out.push({w:m[0].toLowerCase(),s:m.index,e:m.index+m[0].length});return out;}

// blocks: [{text, weight, node?}]. Returns phrases ranked by score (0..1).
function scoreBlocks(blocks,opts={}){
  const map=new Map();
  const add=(p,n,wt,b,s,e)=>{let r=map.get(p);if(!r){r={phrase:p,words:n,raw:0,count:0,occ:[]};map.set(p,r);}r.raw+=wt;r.count++;if(r.occ.length<8)r.occ.push({block:b,start:s,end:e});};
  for(const b of blocks){
    const t=tokenize(b.text), wt=b.weight||1;
    for(let i=0;i<t.length;i++){
      const a=t[i], c=t[i+1];
      const okA=a.w.length>=4&&!STOP.has(a.w)&&!/^\d+$/.test(a.w);
      if(okA)add(a.w,1,wt,b,a.s,a.e);
      if(okA&&c&&c.w.length>=3&&!STOP.has(c.w)&&b.text.slice(a.e,c.s).trim()==='')add(a.w+' '+c.w,2,wt,b,a.s,c.e);
    }
  }
  const list=[...map.values()].filter(r=>r.words===1?(r.count>=2||r.raw>=2.5):r.count>=2);
  for(const r of list)r.score=r.raw*(r.words===2?1.6:1)*Math.log(2+r.phrase.length);
  list.sort((a,b)=>b.score-a.score);
  const max=list.length?list[0].score:1;
  for(const r of list)r.score/=max;
  return list.slice(0,opts.top||40);
}

// Nearest-neighbour walk: from a point, repeatedly pick the closest candidate (at least minSep away from the last one).
function pickWalk(from,cands,n=10,minSep=60){
  const out=[],pool=cands.slice();let cur=from;
  while(out.length<n&&pool.length){
    let bi=-1,bd=Infinity;
    for(let i=0;i<pool.length;i++){const d=Math.hypot(pool[i].x-cur.x,pool[i].y-cur.y);if(d>=minSep&&d<bd){bd=d;bi=i;}}
    if(bi<0)break;
    cur=pool[bi];out.push(cur);
    for(let i=pool.length-1;i>=0;i--)if(Math.hypot(pool[i].x-cur.x,pool[i].y-cur.y)<minSep)pool.splice(i,1);
  }
  return out;
}
// Short text samples the model compares phrases against: headings/title, and the start of the body.
function makeDigest(blocks){
  const head=[],body=[];let hl=0,bl=0;
  for(const b of blocks){const t=b.text.replace(/\s+/g,' ').trim();if(t.length<3)continue;
    if((b.weight||1)>=2){if(hl<600){head.push(t);hl+=t.length;}}else if(bl<1500){body.push(t);bl+=t.length;}}
  return {head:head.join('. '),body:body.join(' ')};
}
const api={tokenize,scoreBlocks,pickWalk,makeDigest};
if(typeof document!=='undefined'&&document.body){
  const SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','CODE','PRE','SVG','CANVAS','IFRAME']);
  const weightFor=el=>{let w=1;for(let n=el;n&&n!==document.body;n=n.parentElement){const t=n.tagName;
    if(t==='H1')w=Math.max(w,3);else if(t==='H2'||t==='H3')w=Math.max(w,2);else if(t==='STRONG'||t==='B'||t==='EM'||t==='A')w=Math.max(w,1.3);}return w;};
  const okParent=p=>p&&!SKIP.has(p.tagName.toUpperCase())&&!p.closest('[contenteditable="true"],#spider-host');
  const TEXT_FILTER={acceptNode(n){return okParent(n.parentElement)&&n.nodeValue.trim().length>2?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}};
  function collect(){
    const blocks=[];let chars=0;
    const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,TEXT_FILTER);
    let n;while((n=tw.nextNode())&&chars<200000){blocks.push({text:n.nodeValue,weight:weightFor(n.parentElement),node:n});chars+=n.nodeValue.length;}
    for(const img of document.images){const t=(img.alt||img.title||'').trim();if(t.length>3)blocks.push({text:t,weight:1.5,node:null});}
    if(document.title)blocks.push({text:document.title,weight:3,node:null});
    return blocks;
  }
  let state={items:[],t:0};
  function scan(){const blocks=collect();state={items:scoreBlocks(blocks),t:Date.now(),digest:makeDigest(blocks),ranked:false};dirty=false;watch();return state.items;}
  function occRects(item){                       // live viewport rectangles (so scrolling just works)
    const out=[];
    for(const o of item.occ){const nd=o.block.node;if(!nd||!nd.isConnected)continue;
      try{const r=document.createRange();r.setStart(nd,o.start);r.setEnd(nd,o.end);const rc=r.getBoundingClientRect();
        if(rc.width>0&&rc.height>0)out.push({rect:rc,range:r,item});}catch(e){}}
    return out;
  }
  function visible(){const out=[];for(const it of state.items)for(const o of occRects(it))
    if(o.rect.bottom>0&&o.rect.top<innerHeight&&o.rect.right>0&&o.rect.left<innerWidth)out.push(o);return out;}
  let keySheet=null;
  function ensureStyle(){if(keySheet)return;const css='::highlight(spider-key){background-color:rgba(255,214,0,.55);color:inherit;}';
    try{keySheet=new CSSStyleSheet();keySheet.replaceSync(css);document.adoptedStyleSheets=[...document.adoptedStyleSheets,keySheet];}
    catch(e){const st=document.createElement('style');st.textContent=css;(document.head||document.documentElement).appendChild(st);keySheet=st;}}
  // The word under a screen point (null if the point is not on a word).
  function wordAt(x,y){
    let node,off;
    if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(!p)return null;node=p.offsetNode;off=p.offset;}
    else if(document.caretRangeFromPoint){const r=document.caretRangeFromPoint(x,y);if(!r)return null;node=r.startContainer;off=r.startOffset;}
    else return null;
    if(!node||node.nodeType!==3||!okParent(node.parentElement))return null;
    const t=node.nodeValue,isW=c=>/[\p{L}\p{N}'’-]/u.test(c);
    let a=Math.min(off,t.length),b=a;
    while(a>0&&isW(t[a-1]))a--; while(b<t.length&&isW(t[b]))b++;
    if(b-a>24&&typeof Intl!=='undefined'&&Intl.Segmenter){            // long runs (e.g. CJK text): take just the word under the point
      for(const g of new Intl.Segmenter(undefined,{granularity:'word'}).segment(t.slice(a,b))){
        const gs=a+g.index,ge=gs+g.segment.length;
        if(off>=gs&&off<=ge){if(!g.isWordLike)return null;a=gs;b=ge;break;}
      }
    }
    if(b-a<2)return null;
    const r=document.createRange();r.setStart(node,a);r.setEnd(node,b);
    const hit=[...r.getClientRects()].some(q=>x>=q.left-3&&x<=q.right+3&&y>=q.top-3&&y<=q.bottom+3);
    return hit?{range:r,word:t.slice(a,b)}:null;
  }
  // Words (4+ letters, no stop words) on screen, as {x,y,word}. Prunes off-screen subtrees and caches per scroll position.
  const VIEW_FILTER={acceptNode(n){
    if(n.nodeType===1){
      if(SKIP.has(n.tagName.toUpperCase())||n.id==='spider-host')return NodeFilter.FILTER_REJECT;
      const r=n.getBoundingClientRect();
      if(r.width===0&&r.height===0)return getComputedStyle(n).display==='contents'?NodeFilter.FILTER_SKIP:NodeFilter.FILTER_REJECT;
      if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_SKIP;
    }
    return okParent(n.parentElement)&&n.nodeValue.trim().length>2?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}};
  let viewCache={key:'',t:0,list:[]};
  function wordsInView(max=400){
    const key=[Math.round(scrollX),Math.round(scrollY),innerWidth,innerHeight].join();
    if(!dirty&&viewCache.key===key&&Date.now()-viewCache.t<10000)return viewCache.list;   // a mutation (dirty) always invalidates
    const out=[],tw=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,VIEW_FILTER);let n;
    while((n=tw.nextNode())&&out.length<max){
      const re=/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;let m;
      while((m=re.exec(n.nodeValue))&&out.length<max){
        if(m[0].length<4||STOP.has(m[0].toLowerCase()))continue;
        const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);const q=r.getBoundingClientRect();
        if(q.width>0&&q.height>0&&q.left>=0&&q.right<=innerWidth&&q.top>=0&&q.bottom<=innerHeight)out.push({x:q.left+q.width/2,y:q.top+q.height/2,word:m[0]});
      }
    }
    viewCache={key,t:Date.now(),list:out};
    return out;
  }
  function highlight(list){if(!root.CSS||!CSS.highlights||typeof Highlight==='undefined')return false;ensureStyle();CSS.highlights.set('spider-key',new Highlight(...list.map(o=>o.range)));return true;}
  function clearHighlight(){if(root.CSS&&CSS.highlights)CSS.highlights.delete('spider-key');}
  // Lazy scanning: the observer only flags the page as changed, then switches itself off until the next scan.
  let dirty=true;
  const mo=new MutationObserver(()=>{dirty=true;mo.disconnect();});
  const watch=()=>mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  const ensure=()=>{if(dirty)scan();return state.items;};
  // On-device transformer hooks: the page sends {digest, phrases}, gets one similarity score per phrase, blends it with TF-IDF.
  function requestPayload(){return state.items.length?{token:state.t,digest:state.digest,phrases:state.items.map(i=>i.phrase)}:null;}
  function rerank(token,sem,w=0.6){
    if(token!==state.t||!Array.isArray(sem)||sem.length!==state.items.length)return false;   // page was rescanned meanwhile
    if(state.ranked)return true;
    state.items.forEach((it,i)=>{it.tf=it.score;it.score=w*sem[i]+(1-w)*it.tf;});
    state.items.sort((a,b)=>b.score-a.score);
    const max=state.items[0].score||1;state.items.forEach(it=>{it.score/=max;});
    state.ranked=true;return true;
  }
  const idleCb=cb=>root.requestIdleCallback?root.requestIdleCallback(cb,{timeout:2000}):setTimeout(cb,100);
  let pending=false;
  function scheduleScan(delay=0){                // heavy scan only when the browser is idle
    if(pending)return;pending=true;
    setTimeout(()=>idleCb(()=>{pending=false;if(dirty)scan();}),delay);
  }
  Object.assign(api,{requestPayload,rerank,scan,ensure,scheduleScan,visible,highlight,clearHighlight,wordAt,wordsInView,items:()=>state.items});
}
root.SpiderReader=api; if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
