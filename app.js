(()=>{
const $=s=>document.querySelector(s),KEY='doxa-v1',R=window.DOXA_RHYMES,S=window.DOXA_SYN,WS=window.DOXA_WORSHIP;
const TYPES=['Verse 1','Verse 2','Verse 3','Pre-Chorus','Chorus','Chorus 2','Bridge','Tag','Intro','Outro','Custom'];
let st=JSON.parse(localStorage.getItem(KEY)||'null')||{songs:[],hints:false};
let cur=null,saved=null,savedSec=null;
const save=()=>localStorage.setItem(KEY,JSON.stringify(st));
const uid=()=>Math.random().toString(36).slice(2,9);
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clean=h=>{const d=document.createElement('div');d.innerHTML=h;(function walk(n){[...n.childNodes].forEach(c=>{if(c.nodeType==1){walk(c);const t=c.tagName;if(t=='B'||t=='STRONG'){const b=document.createElement('b');b.append(...c.childNodes);c.replaceWith(b)}else if(t=='BR'){}else if(t=='DIV'||t=='P'){c.replaceWith(document.createElement('br'),...c.childNodes)}else c.replaceWith(...c.childNodes)}})})(d);return d.innerHTML.replace(/^<br>/,'')};
const ago=t=>{const m=(Date.now()-t)/6e4;return m<1?'just now':m<60?Math.floor(m)+' min ago':m<1440?Math.floor(m/60)+' hr ago':new Date(t).toLocaleDateString()};
// ---------- library
function lib(){cur=null;$('#editor').classList.add('hidden');$('#library').classList.remove('hidden');
 const L=$('#songList');L.innerHTML='';const songs=[...st.songs].sort((a,b)=>b.t-a.t);$('#empty').classList.toggle('hidden',songs.length>0);
 songs.forEach(s=>{const li=document.createElement('li');li.className='song';
  const first=(s.secs.map(x=>x.html).join(' ').replace(/<[^>]+>/g,' ').trim().split(/\s+/).slice(0,8).join(' '))||'';
  li.innerHTML=`<div class="grow"><div class="t">${esc(s.title||'Untitled song')}</div><div class="d">${ago(s.t)}${first?' · '+esc(first)+'…':''}</div></div><button class="ghost">⋯</button>`;
  li.querySelector('.grow').onclick=()=>open(s.id);li.querySelector('button').onclick=()=>songMenu(s);L.append(li)})}
function songMenu(s){menu([['Open',()=>open(s.id)],['Rename',()=>{const n=prompt('Song title',s.title);if(n!=null){s.title=n.trim();s.t=Date.now();save();lib()}}],['Duplicate',()=>{const c=JSON.parse(JSON.stringify(s));c.id=uid();c.title=(s.title||'Untitled')+' (copy)';c.t=Date.now();st.songs.push(c);save();lib()}],['Delete',()=>{if(confirm('Delete “'+(s.title||'Untitled song')+'”?')){st.songs=st.songs.filter(x=>x!==s);save();lib()}},'red']])}
$('#newSong').onclick=()=>{const s={id:uid(),title:'',t:Date.now(),secs:[{id:uid(),type:'Verse 1',html:''},{id:uid(),type:'Chorus',html:''}]};st.songs.push(s);save();open(s.id,true)};
// ---------- editor
function open(id,fresh){cur=st.songs.find(s=>s.id==id);closeSheets();$('#library').classList.add('hidden');$('#editor').classList.remove('hidden');$('#title').value=cur.title;render();if(fresh)$('#title').focus();window.scrollTo(0,0)}
function touch(){cur.t=Date.now();save()}
$('#title').oninput=e=>{cur.title=e.target.value;touch()};
$('#back').onclick=lib;
function render(){const box=$('#sections');box.innerHTML='';
 cur.secs.forEach((sec,i)=>{const d=document.createElement('div');d.className='sec';d.dataset.id=sec.id;
  d.innerHTML=`<div class="sechead"><button class="chip">${esc(sec.type)}</button><div class="ctl"><button data-m="up" title="Move up">↑</button><button data-m="dn" title="Move down">↓</button><button data-m="more">⋯</button></div></div><div class="body" contenteditable="true" spellcheck="true" data-ph="Write ${esc(sec.type.toLowerCase())}…"></div><div class="hints"></div>`;
  const b=d.querySelector('.body');b.innerHTML=sec.html;
  b.oninput=()=>{sec.html=clean(b.innerHTML);touch();hintSoon(sec,d)};
  b.onkeydown=e=>{if(e.key=='Enter'&&st.hints)setTimeout(()=>hints(sec,d),30)};
  b.onpaste=e=>{e.preventDefault();document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text'))};
  d.querySelector('.chip').onclick=()=>typeMenu(sec);
  d.querySelector('[data-m=up]').onclick=()=>{if(i>0){cur.secs.splice(i-1,0,cur.secs.splice(i,1)[0]);touch();render()}};
  d.querySelector('[data-m=dn]').onclick=()=>{if(i<cur.secs.length-1){cur.secs.splice(i+1,0,cur.secs.splice(i,1)[0]);touch();render()}};
  d.querySelector('[data-m=more]').onclick=()=>menu([['Change section type',()=>typeMenu(sec)],['Duplicate section',()=>{cur.secs.splice(i+1,0,{id:uid(),type:sec.type,html:sec.html});touch();render()}],['Delete section',()=>{if(!sec.html||confirm('Delete this '+sec.type+'?')){cur.secs.splice(i,1);touch();render()}},'red']]);
  box.append(d)});
 const a=$('#addRow');a.innerHTML='';['Verse','Chorus','Pre-Chorus','Bridge','Tag','Other…'].forEach(t=>{const bt=document.createElement('button');bt.textContent='+ '+t;bt.onclick=()=>{if(t=='Other…')return typeMenu(null);addSec(t=='Verse'?'Verse '+(cur.secs.filter(s=>/^Verse/.test(s.type)).length+1):t=='Chorus'&&cur.secs.some(s=>s.type=='Chorus')?'Chorus 2':t)};a.append(bt)});
 $('#hintToggle').textContent='Hints: '+(st.hints?'on':'off');$('#hintToggle').classList.toggle('on',st.hints)}
function addSec(type){cur.secs.push({id:uid(),type,html:''});touch();render();const all=document.querySelectorAll('.body');all[all.length-1].focus()}
function typeMenu(sec){menu(TYPES.map(t=>[t,()=>{let v=t;if(t=='Custom'){v=prompt('Section name','Interlude');if(!v)return}if(sec){sec.type=v;touch();render()}else addSec(v)}]))}
$('#hintToggle').onclick=()=>{st.hints=!st.hints;save();render()};
$('#moreBtn').onclick=()=>menu([['Rename song',()=>$('#title').focus()],['Copy lyrics (plain text)',()=>{navigator.clipboard&&navigator.clipboard.writeText(plain());}],['Delete song',()=>{if(confirm('Delete this song?')){st.songs=st.songs.filter(x=>x!==cur);save();lib()}},'red']]);
function plain(){return (cur.title||'Untitled')+'\n\n'+cur.secs.map(s=>'['+s.type+']\n'+s.html.replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')).join('\n\n')}
const bold=()=>{document.execCommand('bold');const b=document.activeElement;if(b&&b.classList.contains('body'))b.dispatchEvent(new Event('input'))};
$('#boldBtn').onmousedown=e=>e.preventDefault();$('#boldBtn').onclick=bold;
// ---------- selection menu
const SM=$('#selMenu');
document.addEventListener('selectionchange',()=>{const sel=getSelection();if(!sel.rangeCount){return}const r=sel.getRangeAt(0);const body=r.commonAncestorContainer.nodeType==1?r.commonAncestorContainer.closest&&r.commonAncestorContainer.closest('.body'):r.commonAncestorContainer.parentElement.closest('.body');
 const txt=sel.toString().trim();if(!body||!txt||txt.length>40){SM.classList.add('hidden');return}
 saved=r.cloneRange();savedSec=body;const rc=r.getBoundingClientRect();SM.classList.remove('hidden');
 const w=SM.offsetWidth;SM.style.left=Math.max(8,Math.min(innerWidth-w-8,rc.left+rc.width/2-w/2))+'px';SM.style.top=(rc.top>60?rc.top-50:rc.bottom+10)+'px'});
SM.onmousedown=e=>e.preventDefault();
SM.onclick=e=>{const a=e.target.closest('button');if(!a)return;const w=saved.toString().trim();SM.classList.add('hidden');
 if(a.dataset.a=='bold'){restore();bold();return}showSheet(a.dataset.a,w)};
function restore(){const s=getSelection();s.removeAllRanges();s.addRange(saved)}
// ---------- lookup
const BAD=new Set('website dwight wright lite kite cite byte megabyte fahrenheit kryptonite dynamite ex sexy sex damn hell pain kill gun drug drugs beer weed porn hate'.split(' '));
const norm=w=>w.toLowerCase().replace(/[^a-z' ]/g,'').trim();
const lastWord=w=>norm(w).split(/\s+/).pop();
function keysOf(w){return (R.w[w]||[]).map(i=>R.k[i])}
function guessKey(w){// fallback: match words sharing the longest ending
 for(let n=Math.min(4,w.length-1);n>=2;n--){const e=w.slice(-n);const hit=Object.keys(R.w).find(x=>x!=w&&x.endsWith(e));if(hit)return keysOf(hit)}return[]}
const vowelKey=k=>k.split(' ')[0]+' '+(k.split(' ').slice(-1)[0]);
let RI=null;function idx(){if(RI)return RI;RI={k:{},v:{}};for(const w in R.w)R.w[w].forEach(i=>{(RI.k[i]=RI.k[i]||[]).push(w);const vk=vowelKey(R.k[i]);(RI.v[vk]=RI.v[vk]||[]).push(w)});return RI}
function rhymes(word){const w=lastWord(word);let ks=(R.w[w]||[]);if(!ks.length){const g=guessKey(w);ks=g.map(k=>R.k.indexOf(k))}
 const I=idx();const perfect=[...new Set(ks.flatMap(i=>I.k[i]||[]))].filter(x=>x!=w&&!x.endsWith("'s")&&!w.endsWith(x)&&!x.endsWith(w)&&!BAD.has(x));
 const near=[...new Set(ks.flatMap(i=>I.v[vowelKey(R.k[i])]||[]))].filter(x=>x!=w&&!perfect.includes(x)&&!x.includes("'")&&!BAD.has(x));
 const ws=new Set(WS.words.map(x=>x.toLowerCase()));const ord=a=>a.sort((x,y)=>(ws.has(y)-ws.has(x)));
 const bySyl={};perfect.slice(0,160).forEach(x=>{const n=R.n[x]||1;(bySyl[n]=bySyl[n]||[]).push(x)});
 return {w,perfect:ord(perfect),bySyl,near:ord(near).slice(0,40),ws}}
function syns(word){const w=norm(word);let r=S[w];if(!r){for(const suf of['s','es','ed','ing','ly']){if(w.endsWith(suf)&&S[w.slice(0,-suf.length)]){r=S[w.slice(0,-suf.length)];break}}}return r||[]}
function related(word){const w=lastWord(word);const T=WS.themes;let out=T[w]?[...T[w]]:[];for(const k in T)if(T[k].map(x=>x.toLowerCase()).includes(w))out.push(k,...T[k]);out.push(...WS.words);return [...new Set(out)].filter(x=>x.toLowerCase()!=w).slice(0,40)}
// ---------- sheet
function showSheet(kind,word){closeSheets();const body=$('#sheetBody');body.innerHTML='';$('#sheet').classList.remove('hidden');
 $('#sheetKind').textContent={rhyme:'Rhymes with',syn:'Other words for',rel:'Worship words near'}[kind];$('#sheetWord').textContent=word;
 const grp=(label,list,ws)=>{if(!list.length)return;const g=document.createElement('div');g.innerHTML=`<div class="grp">${label}</div><div class="words"></div>`;const W=g.querySelector('.words');list.forEach(x=>{const b=document.createElement('button');b.className='w'+(ws&&ws.has(x.toLowerCase())?' star':'');b.textContent=x;b.onclick=()=>insert(x,kind);W.append(b)});body.append(g)};
 if(kind=='rhyme'){const r=rhymes(word);Object.keys(r.bySyl).sort().forEach(n=>grp(n+' syllable'+(n>1?'s':''),r.ws?r.bySyl[n].sort((x,y)=>r.ws.has(y)-r.ws.has(x)):r.bySyl[n],r.ws));grp('Near rhymes',r.near,r.ws);if(!r.perfect.length&&!r.near.length)body.innerHTML='<p class="empty">No rhymes found for this one. Try a different ending word.</p>'}
 else if(kind=='syn'){const s=syns(word);grp('Synonyms',s);if(!s.length)body.innerHTML='<p class="empty">No synonyms on file for “'+esc(word)+'”.</p>';grp('Worship words',related(word).slice(0,16))}
 else grp('Worship & faith words',related(word))}
function insert(text,kind){$('#sheet').classList.add('hidden');restore();
 // rhyme: if selection is on a word, replace it only if it's the same line's last word? keep simple: rhyme inserts after selection on new line? -> insert at caret replacing selection for syn/rel; for rhyme replace selection too
 const sel=getSelection();const r=sel.getRangeAt(0);
 if(kind=='rhyme'){ // keep the original word; place the rhyme at end of the NEXT line (or new line)
  r.collapse(false);const line=nextLineEnd(r);sel.removeAllRanges();sel.addRange(line.range);document.execCommand('insertText',false,(line.needSpace?' ':'')+text);
 } else document.execCommand('insertText',false,text);
 savedSec.dispatchEvent(new Event('input'))}
function nextLineEnd(r){// find end of next line after range in body; create one if none
 const body=savedSec;const walker=document.createTreeWalker(body,NodeFilter.SHOW_ALL);let n,afterSel=false,brCount=0,lastText=null,target=null;
 const brs=[...body.querySelectorAll('br')];const after=brs.filter(b=>r.comparePoint(b,0)>0);
 const range=document.createRange();
 if(!after.length){range.selectNodeContents(body);range.collapse(false);document.getSelection().removeAllRanges();document.getSelection().addRange(range);document.execCommand('insertLineBreak');const rr=getSelection().getRangeAt(0).cloneRange();return{range:rr,needSpace:false}}
 const nb=after[1];if(nb){range.setStartBefore(nb)}else{range.selectNodeContents(body);range.collapse(false)}range.collapse(true);
 const prev=range.cloneRange();prev.setStartAfter(after[0]);const between=prev.toString();
 return{range,needSpace:between.length>0&&!/\s$/.test(between)}}
function closeSheets(){$('#sheet').classList.add('hidden');$('#menu').classList.add('hidden')}
$('#sheetClose').onclick=closeSheets;
function menu(items){closeSheets();const m=$('#menuBody');m.innerHTML='';items.forEach(([l,f,c])=>{const b=document.createElement('button');b.className='menuitem'+(c?' '+c:'');b.textContent=l;b.onclick=()=>{closeSheets();f()};m.append(b)});const x=document.createElement('button');x.className='menuitem';x.style.color='var(--mute)';x.textContent='Cancel';x.onclick=closeSheets;m.append(x);$('#menu').classList.remove('hidden')}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.sheet,.selmenu,.ctl,.chip,#moreBtn,.song button,.addrow'))closeSheets()});
// ---------- next-line hints (rule-based)
let ht=null;function hintSoon(sec,d){if(!st.hints)return;clearTimeout(ht);ht=setTimeout(()=>hints(sec,d),1800)}
function hints(sec,d){const H=d.querySelector('.hints');H.innerHTML='';if(!st.hints)return;
 const lines=sec.html.replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').split('\n').map(s=>s.trim()).filter(Boolean);if(!lines.length)return;
 const odd=lines.length%2==1;const anchor=lines[odd?lines.length-1:lines.length-2]||lines[lines.length-1];const lw=lastWord(anchor);
 const r=lw?rhymes(lw):{perfect:[],near:[]};const all=cur.secs.map(s=>s.html).join(' ').replace(/<[^>]+>/g,' ').toLowerCase();
 const theme=Object.keys(WS.themes).filter(k=>all.includes(k)).flatMap(k=>WS.themes[k]);
 let cands=r.perfect.filter(x=>R.n[x]<=2);const pref=cands.filter(x=>r.ws.has(x)||theme.includes(x));cands=[...pref,...cands.filter(x=>!pref.includes(x))].slice(0,12);if(!cands.length)cands=theme.length?theme:WS.words.slice(0,8);
 const seed=lines.length+all.length;const out=[];for(let i=0;i<3&&cands.length;i++){const w=cands[(seed+i*3)%Math.min(cands.length,6)];const f=WS.frags[(seed*7+i*5)%WS.frags.length];const s=f.replace('{w}',w);if(!out.includes(s))out.push(s)}
 out.forEach(s=>{const b=document.createElement('button');b.className='hint';b.textContent=s;b.onclick=()=>{const body=d.querySelector('.body');sec.html=sec.html.replace(/(<br>)*$/,'')+(sec.html.trim()?'<br>':'')+esc(s);body.innerHTML=sec.html;touch();H.innerHTML=''};H.append(b)});
 const x=document.createElement('button');x.className='hint x';x.textContent='✕';x.onclick=()=>H.innerHTML='';H.append(x)}
// ---------- boot
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js');
window.DOXA={st,open,showSheet,rhymes,syns};
lib();
})();
