(()=>{
const $=s=>document.querySelector(s),KEY='doxa-v1',R=window.DOXA_RHYMES,S=window.DOXA_SYN,WS=window.DOXA_WORSHIP;
const TYPES=['Verse 1','Verse 2','Verse 3','Pre-Chorus','Chorus','Chorus 2','Bridge','Tag','Intro','Outro','Custom'];
const MAJORS=['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'];
const MINORS=['Am','A#m','Bbm','Bm','Cm','C#m','Dm','D#m','Ebm','Em','Fm','F#m','Gm','G#m'];
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
  const bits=[ago(s.t)];if(s.key)bits.push(esc(s.key));if(first)bits.push(esc(first)+'…');
  li.innerHTML=`<div class="grow"><div class="t">${esc(s.title||'Untitled song')}</div><div class="d">${bits.join(' · ')}</div></div><button class="ghost">⋯</button>`;
  li.querySelector('.grow').onclick=()=>open(s.id);li.querySelector('button').onclick=()=>songMenu(s);L.append(li)})}
function songMenu(s){menu([['Open',()=>open(s.id)],['Rename',()=>{const n=prompt('Song title',s.title);if(n!=null){s.title=n.trim();s.t=Date.now();save();lib()}}],['Duplicate',()=>{const c=JSON.parse(JSON.stringify(s));c.id=uid();c.title=(s.title||'Untitled')+' (copy)';c.t=Date.now();st.songs.push(c);save();lib()}],['Delete',()=>{if(confirm('Delete “'+(s.title||'Untitled song')+'”?')){st.songs=st.songs.filter(x=>x!==s);save();lib()}},'red']])}
$('#newSong').onclick=()=>{const s={id:uid(),title:'',key:'',t:Date.now(),secs:[{id:uid(),type:'Verse 1',html:''},{id:uid(),type:'Chorus',html:''}]};st.songs.push(s);save();open(s.id,true)};
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
 paintKey();syncHintUi()}
function addSec(type){cur.secs.push({id:uid(),type,html:''});touch();render();const all=document.querySelectorAll('.body');all[all.length-1].focus()}
function typeMenu(sec){menu(TYPES.map(t=>[t,()=>{let v=t;if(t=='Custom'){v=prompt('Section name','Interlude');if(!v)return}if(sec){sec.type=v;touch();render()}else addSec(v)}]))}
$('#hintToggle').onclick=()=>{st.hints=!st.hints;save();if(!st.hints){clearTimeout(ht);document.querySelectorAll('.hints').forEach(h=>{h.innerHTML=''})}syncHintUi()};
$('#moreBtn').onclick=()=>menu([['Rename song',()=>$('#title').focus()],['Copy lyrics (plain text)',()=>{navigator.clipboard&&navigator.clipboard.writeText(plain());}],['Delete song',()=>{if(confirm('Delete this song?')){st.songs=st.songs.filter(x=>x!==cur);save();lib()}},'red']]);
function plain(){const head=(cur.title||'Untitled')+(cur.key?'\nKey: '+cur.key:'');return head+'\n\n'+cur.secs.map(s=>'['+s.type+']\n'+s.html.replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')).join('\n\n')}
const bold=()=>{document.execCommand('bold');const b=document.activeElement;if(b&&b.classList.contains('body'))b.dispatchEvent(new Event('input'))};
function paintKey(){const b=$('#keyBtn');if(!b||!cur)return;const k=cur.key||'';b.textContent=k||'Key';b.classList.toggle('set',!!k);b.title=k?'Key of '+k:'Song key';b.setAttribute('aria-label',k?'Song key '+k:'Choose song key')}
function syncHintUi(){document.body.dataset.hints=st.hints?'on':'off';const b=$('#hintToggle');if(!b)return;b.textContent='Hints: '+(st.hints?'on':'off');b.classList.toggle('on',!!st.hints);b.setAttribute('aria-pressed',st.hints?'true':'false')}
function openKeys(){if(!cur)return;closeSheets();const m=$('#menuBody');m.innerHTML='';
 const title=document.createElement('div');title.className='keytitle';title.textContent='Song key';m.append(title);
 const note=document.createElement('p');note.className='keynote';note.textContent=cur.key?'This song is in '+cur.key+'.':'What key is this song in?';m.append(note);
 const group=(label,keys)=>{const g=document.createElement('div');g.innerHTML=`<div class="grp">${label}</div><div class="words"></div>`;const W=g.querySelector('.words');keys.forEach(k=>{const bt=document.createElement('button');bt.type='button';bt.className='w keyopt'+(cur.key===k?' on':'');bt.textContent=k;bt.onclick=()=>setKey(k);W.append(bt)});m.append(g)};
 group('Major',MAJORS);group('Minor',MINORS);
 const none=document.createElement('button');none.type='button';none.className='menuitem';none.textContent=cur.key?'Clear key':'No key';none.onclick=()=>setKey('');m.append(none);
 $('#menu').classList.remove('hidden')}
function setKey(k){cur.key=k||'';touch();paintKey();closeSheets()}
$('#keyBtn').onmousedown=e=>e.preventDefault();$('#keyBtn').onclick=openKeys;
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
// ---------- next-line hints (offline, no templates dumped with a random word)
const SYL_X={merciful:3,hosanna:3,redeemer:3,splendor:2,undeserved:3,forevermore:4,holiness:3,freedom:2,pardon:2,steadfast:2,satisfy:3,undivided:4,ceasing:2,adored:2,rejoices:3,"you've":1,"we're":1,"you're":1,"i'm":1,"i'll":1,"we'll":1,"he's":1,"it's":1,"let's":1,o:1,oh:1,abba:2};
const RHYME_X={ceasing:['EH S IH NG'],adored:['AO R D'],rejoices:['OY S IH Z']};
const WEAK=new Set('a an the of to in on and or for with at by from into over under our your my their his her its'.split(' '));
const wordsOf=line=>String(line).toLowerCase().replace(/[^a-z'\s-]/g,' ').split(/[\s-]+/).filter(Boolean);
function guessSyl(w){w=w.replace(/[^a-z]/g,'');if(!w||w.length<=3)return 1;const v=w.replace(/e$/,'').match(/[aeiouy]+/g);return Math.max(1,v?v.length:1)}
const SCAN={our:1,every:2}; // sung scansion, not the dictionary's careful pronunciation
function sylOfWord(w){const x=String(w).toLowerCase().replace(/[^a-z']/g,'');const bare=x.replace(/'/g,'');if(SCAN[x]||SCAN[bare])return SCAN[x]||SCAN[bare];if(R.n[x])return R.n[x];if(R.n[bare])return R.n[bare];if(SYL_X[x])return SYL_X[x];if(SYL_X[bare])return SYL_X[bare];if(x.endsWith("'s")&&R.n[bare])return R.n[bare];return guessSyl(bare)}
function sylCount(line){return wordsOf(line).reduce((n,w)=>n+sylOfWord(w),0)}
function phonemes(w){const x=norm(w);if(!x)return [];if(RHYME_X[x])return RHYME_X[x];const ks=keysOf(x);return ks.length?ks:guessKey(x)}
function rhymeRank(a,b){if(!a||!b||a===b)return '';const A=phonemes(a),B=phonemes(b);if(!A.length||!B.length)return '';const a0=A[0],b0=B[0];if(a0===b0)return 'p';if(vowelKey(a0)===vowelKey(b0))return 'n';return ''}
function lineOk(line){const raw=String(line||'').replace(/\s+/g,' ').trim();if(!raw||raw.length>88||/[{}\\]/.test(raw))return false;if(!/^[A-Z"'“]/.test(raw))return false;const ws=wordsOf(raw);if(ws.length<2||ws.length>16)return false;const end=ws[ws.length-1].replace(/'/g,'');if(!end||WEAK.has(end)||BAD.has(end))return false;for(const w of ws){const b=w.replace(/'/g,'');if(BAD.has(b))return false}const syl=sylCount(raw);return syl>=3&&syl<=14}
function secBucket(type){const t=(type||'').toLowerCase();if(/bridge/.test(t))return 'bridge';if(/chorus|tag/.test(t))return 'chorus';return 'verse'}
function lineSec(line){const l=line.toLowerCase();if(/\b(surrender|have your way|here i am|search me|take my|less of me|i give|i will wait|not my will)\b/.test(l))return 'bridge';if(/\b(hallelujah|worthy is|holy, holy|we will praise|forever|glory to)\b/.test(l))return 'chorus';return ''}
function personOf(line){const s=new Set(wordsOf(line));if(s.has('i')||s.has('me')||s.has('my')||s.has("i'm")||s.has("i'll"))return 'i';if(s.has('we')||s.has('our')||s.has('us')||s.has("we're"))return 'we';return ''}
function activeThemes(blob){const low=' '+String(blob||'').toLowerCase().replace(/[^a-z'\s]/g,' ')+' ';const has=w=>low.includes(' '+String(w).toLowerCase()+' ');const s=new Set();Object.keys(WS.themes).forEach(k=>{const hit=has(k)||WS.themes[k].some(has);if(hit){s.add(k);WS.themes[k].forEach(w=>s.add(w.toLowerCase()))}});return s}
function hintCandidates(anchor,songText,sectionType){
 const raw=String(anchor||'').trim();if(!raw)return [];
 const lw=lastWord(raw);if(!lw)return [];
 const target=sylCount(raw),anchorOpen=wordsOf(raw).slice(0,2).join(' '),anchorRhythm=wordsOf(raw).map(sylOfWord).join('.'),anchorWords=wordsOf(raw),anchorPerson=personOf(raw);
 const themes=activeThemes((songText||'')+' '+raw),bucket=secBucket(sectionType);
 const existing=new Set(String(songText||'').split(/\n|<br>/).map(s=>s.replace(/<[^>]+>/g,'').trim().toLowerCase()).filter(Boolean));
 existing.add(raw.toLowerCase());
 const seen=new Set(),cands=[];
 const push=line=>{const text=String(line).replace(/\s+/g,' ').trim();const key=text.toLowerCase();if(!lineOk(text)||seen.has(key)||existing.has(key))return;const ws=wordsOf(text);const end=ws[ws.length-1].replace(/'/g,'');if(end===lw)return;const syl=ws.reduce((n,w)=>n+sylOfWord(w),0);const diff=Math.abs(syl-target);if(diff>5)return;const rhyme=rhymeRank(lw,end);let score=40-diff*12;if(diff===0)score+=6;if(rhyme==='p')score+=36;else if(rhyme==='n')score+=14;else score-=4;const open=ws.slice(0,2).join(' ');if(open&&open===anchorOpen)score+=10;if(wordsOf(text).map(sylOfWord).join('.')===anchorRhythm)score+=12;else if(ws.length===anchorWords.length)score+=3;score+=Math.min(3,ws.filter(w=>themes.has(w.replace(/'/g,''))).length)*3;if(anchorPerson&&personOf(text)===anchorPerson)score+=3;const ls=lineSec(text);if(ls&&ls===bucket)score+=4;seen.add(key);cands.push({line:text,score,end,syl,diff,rhyme,open})};
 (WS.lines||[]).forEach(push);
 (WS.patterns||[]).forEach(p=>{(p.words||[]).forEach(w=>push(String(p.pre).replace(/\s+$/,'')+' '+w))});
 cands.sort((a,b)=>b.score-a.score||a.line.localeCompare(b.line));
 const out=[],usedLine=new Set(),usedEnd=new Set();
 if(!cands.length)return [];
 const best=cands[0].score,take=c=>{out.push(c);usedLine.add(c.line);usedEnd.add(c.end)};
 for(const c of cands){if(out.length>=3)break;if(usedLine.has(c.line)||usedEnd.has(c.end))continue;if(c.rhyme==='p'&&c.score>=best-20){take(c);continue}if(c.score>=best-8)take(c);else if(out.length)break}
 if(out.length<3){for(const c of cands){if(out.length>=3)break;if(usedLine.has(c.line)||c.rhyme!=='p'||c.diff>2||c.score<best-18)continue;take(c)}}
 if(out.length<2){for(const c of cands){if(out.length>=2)break;if(usedLine.has(c.line))continue;take(c)}}
 return out.slice(0,3)}
function suggestLines(anchor,songText,sectionType){return hintCandidates(anchor,songText,sectionType).map(c=>c.line)}
let ht=null;function hintSoon(sec,d){if(!st.hints)return;clearTimeout(ht);ht=setTimeout(()=>hints(sec,d),1800)}
function sectionPlain(html){return String(html||'').replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')}
function hints(sec,d){const H=d.querySelector('.hints');if(!H)return;H.innerHTML='';if(!st.hints)return;
 const lines=sectionPlain(sec.html).split('\n').map(s=>s.trim()).filter(Boolean);if(!lines.length)return;
 const anchor=lines[lines.length-1];
 const songText=cur.secs.map(s=>sectionPlain(s.html)).join('\n');
 const out=suggestLines(anchor,songText,sec.type);if(!out.length)return;
 out.forEach(s=>{const b=document.createElement('button');b.type='button';b.className='hint';b.textContent=s;b.onclick=()=>{const body=d.querySelector('.body');sec.html=sec.html.replace(/(<br>)*$/,'')+(sec.html.trim()?'<br>':'')+esc(s);body.innerHTML=sec.html;touch();hints(sec,d)};H.append(b)});
 const x=document.createElement('button');x.type='button';x.className='hint x';x.title='Hide these suggestions';x.textContent='✕';x.onclick=()=>H.innerHTML='';H.append(x)}
// ---------- boot
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js');
window.DOXA={st,open,showSheet,rhymes,syns,suggestLines,hintCandidates,sylCount};
syncHintUi();
lib();
})();
