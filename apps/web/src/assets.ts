// Inlined into every page: no extra requests, no render blocking. Pages are edge-cached whole,
// so inlining costs nothing on repeat views.

// Dark tokens apply under the OS preference (unless the viewer forced light) or when forced dark.
const DARK =
  "--bg:#17181a;--fg:#e6e4dc;--muted:#9a988f;--line:#34352f;--head:#22231f;--zebra:#1c1d1a;--hi:#3a3520;" +
  "--link:#8cbcf0;--brand:#8f3c14;--brand-fg:#fff3ea;--rule:#e07a3c;--dot:#ffb877;--red:#f08a80;--red-bg:#2e1b1a;" +
  "--blue:#8fb2f0;--blue-bg:#1a2233;--pollen:#e0b040;--heat:240 128 60;--heat-a:.42;--win:#7fd69a;--win-bg:#17301f;--tile:#e9e7df";

export const CSS = `
:root{--bg:#fbfaf5;--fg:#1d1d1b;--muted:#6b6a63;--line:#d9d6c8;--head:#efece0;--zebra:#f4f2ea;--hi:#fff6c9;
--link:#0b4f8a;--brand:#a8481a;--brand-fg:#fffaf5;--rule:#a8481a;--dot:#ffc58a;--red:#b3261e;--red-bg:#fbe9e7;--blue:#1f4e9c;--blue-bg:#e7eefb;--pollen:#c58b00;--heat:232 106 40;--heat-a:.5;--win:#1e6b34;--win-bg:#e2f2e5;--tile:#fff}
:root{color-scheme:light dark}:root[data-theme=light]{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.45 Verdana,Geneva,"DejaVu Sans",sans-serif}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3{font-family:Georgia,"Times New Roman",serif;font-weight:normal;margin:.2em 0 .4em}
h1{font-size:26px}h2{font-size:19px;border-bottom:2px solid var(--rule);padding-bottom:2px;margin-top:1.4em}h3{font-size:15px}
.top{background:var(--brand);color:var(--brand-fg)}
.top .in{max-width:1200px;margin:0 auto;padding:6px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.top a{color:var(--brand-fg)}.logo{font:bold 20px Georgia,serif;letter-spacing:-.5px}.logo b{color:var(--dot)}
.top nav{display:flex;gap:14px;font-size:12px}
.top form{margin-left:auto}
.tt{font:inherit;font-size:12px;background:none;color:var(--brand-fg);border:1px solid rgba(255,255,255,.45);border-radius:2px;padding:2px 7px;cursor:pointer;white-space:nowrap}.tt:hover{background:rgba(255,255,255,.12)}.top input{font:inherit;padding:3px 6px;width:220px;max-width:50vw;border:1px solid #000;border-radius:2px}
main{max-width:1200px;margin:0 auto;padding:10px 16px 40px}
.crumbs{font-size:11px;color:var(--muted);margin-bottom:4px}
.bio{display:flex;flex-wrap:wrap;gap:4px 24px;margin:4px 0 10px}.bio div{white-space:nowrap}.bio b{color:var(--muted);font-weight:normal}
.tabs{display:flex;flex-wrap:wrap;gap:2px 14px;font-size:12px;margin:6px 0;padding:4px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.scroll{overflow-x:auto;max-width:100%}
table.st{border-collapse:collapse;font-size:12px;margin:4px 0 12px;white-space:nowrap}
.st th,.st td{padding:2px 6px;border-bottom:1px solid var(--line);text-align:right}
.st th{background:var(--head);border-top:1px solid var(--line);font-weight:bold;position:sticky;top:0;cursor:pointer;user-select:none}
.st th[data-dir]:after{content:" ▾";color:var(--muted)}.st th[data-dir=asc]:after{content:" ▴"}
.st .l{text-align:left}.st tbody tr:nth-child(even){background:var(--zebra)}.st tbody tr:hover{background:var(--hi)}
.st td.r{color:var(--red)}.st td.b{color:var(--blue)}.st td.w{font-weight:bold}
.st tfoot td{font-weight:bold;border-top:2px solid var(--fg)}
.note{color:var(--muted);font-size:11px}
.pill{display:inline-block;padding:0 5px;border-radius:2px;font-size:11px;background:var(--head);border:1px solid var(--line)}
.live{background:var(--red);color:#fff;border-color:var(--red)}
.st th.rh{background:var(--red-bg);color:var(--red)}.st th.bh{background:var(--blue-bg);color:var(--blue)}
.fl{font-family:Consolas,Menlo,monospace;letter-spacing:1px}.fl i{font-style:normal;padding:0 1px}
.fl .R{color:var(--red)}.fl .B{color:var(--blue)}.fl .P{color:var(--pollen)}
.video{width:100%;aspect-ratio:16/9;border:0}.video.none{aspect-ratio:auto;padding:10px;border:1px dashed var(--line);color:var(--muted)}
.mx{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:0 32px;align-items:start}
@media (max-width:900px){.mx{grid-template-columns:minmax(0,1fr)}}
.st td{font-variant-numeric:tabular-nums}
.st a.tn{color:var(--fg);display:inline-block;max-width:12em;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}.st a.tn:hover{color:var(--link)}
.ht{background:rgb(var(--heat) / calc(var(--h,0) * var(--heat-a)))}
.av{display:inline-block;width:20px;height:20px;border-radius:3px;background:var(--tile);box-shadow:0 0 0 1px var(--line);vertical-align:-5px;margin-right:6px;object-fit:contain}
.av0{background:var(--head)}
.av.xl{width:80px;height:80px;border-radius:6px;margin:0;image-rendering:pixelated;vertical-align:top}
.card{display:flex;gap:18px;align-items:flex-start;margin:6px 0 4px;flex-wrap:wrap}.card h1{margin-top:0}
.card .who{flex:1;min-width:260px}
.sbr{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
.sb{border:1px solid var(--line);border-top:3px solid var(--rule);background:var(--zebra);padding:5px 12px 6px;min-width:96px}
.sbv{font:22px Georgia,serif;font-variant-numeric:tabular-nums;line-height:1.2}.sbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}.sbs{font-size:11px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:4px 22px;align-items:start}
.box h3{display:flex;align-items:baseline;gap:8px;margin:14px 0 4px;padding:3px 0;border-bottom:2px solid var(--rule);font-size:16px}
.box .more{margin-left:auto;font:11px Verdana,sans-serif}
.box table.st{width:100%}
.res{display:inline-block;min-width:16px;text-align:center;font-weight:bold;font-size:11px;border-radius:2px;padding:0 3px}
.resW{color:var(--win);background:var(--win-bg)}.resL{color:var(--muted)}.resT{color:var(--fg);background:var(--head)}
.st-live{background:var(--red);color:#fff;border-color:var(--red)}.st-final{color:var(--muted)}.st-upcoming{color:var(--link)}
.sitestats{color:var(--muted);font-size:12px;margin:-4px 0 6px}
.score{display:grid;grid-template-columns:1fr 1fr;gap:0;max-width:720px;margin:8px 0 4px;border:1px solid var(--line)}
.score>div{padding:8px 12px}.score .rs{background:var(--red-bg);border-right:1px solid var(--line)}.score .bs{background:var(--blue-bg);text-align:right}
.score .pts{font:34px/1.1 Georgia,serif;font-variant-numeric:tabular-nums}.score .rs .pts{color:var(--red)}.score .bs .pts{color:var(--blue)}
.score .won .pts{font-weight:bold}.score .won .pts:after{content:" ✓";font-size:18px}
.score .tm{margin-top:4px;font-size:12px}.score .tm div{margin:3px 0}.score .bs .av{margin:0 0 0 6px}
.mnav{display:flex;gap:16px;font-size:12px;margin:4px 0}
.fls{display:flex;gap:22px;flex-wrap:wrap;margin:6px 0 2px}
.stk{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:var(--muted)}
.stk .col{display:flex;flex-direction:column-reverse;align-items:center;gap:2px;min-height:60px;justify-content:flex-start;padding:3px 6px;border-bottom:3px solid var(--line)}
.ball{width:13px;height:13px;border-radius:50%;display:block}.ball.R{background:var(--red)}.ball.B{background:var(--blue)}.ball.P{background:var(--pollen);width:10px;height:10px}
.wkh th{background:var(--bg);border-top:0;text-align:left;font:15px Georgia,serif;padding:14px 4px 3px;cursor:default;position:static;border-bottom:2px solid var(--rule)}
.wkh th span{font:11px Verdana,sans-serif;color:var(--muted);margin-left:8px}
.filters{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:end;margin:6px 0 4px;padding:8px 10px;background:var(--zebra);border:1px solid var(--line)}
.filters label{display:flex;flex-direction:column;font-size:11px;color:var(--muted);gap:2px}
.filters select,.filters input{font:12px Verdana,sans-serif;padding:2px 4px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:2px}
.filters input{width:180px}.filters .go{font:12px Verdana,sans-serif}
.st tr.has a.ev{font-weight:bold}.st .dot{font-size:10px;color:var(--win);white-space:nowrap}
.st tr.nores td,.st tr.nores a.ev{color:var(--muted)}
.filters .chk{justify-content:flex-end}.filters .chk span{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--fg);padding-bottom:3px}
.st th.vc,.st td.vc{width:16px;min-width:16px;padding:2px 2px 2px 6px;text-align:center}
.st a.tl{display:inline-block;margin-right:10px;white-space:nowrap}.st a.tl .av{margin-right:4px}
.st tr.sep td{border-top:3px double var(--fg)}
.st td.top{background:color-mix(in srgb,var(--pollen) 28%,transparent);font-weight:bold}.st td.top:after{content:" ★";color:var(--pollen)}
.bk{display:flex;gap:18px;overflow-x:auto;padding:4px 0 10px;align-items:stretch}.bk .col{display:flex;flex-direction:column;justify-content:space-around;gap:8px;min-width:150px}
.bk h4{margin:0 0 2px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.bk .bm{border:1px solid var(--line);background:var(--zebra);font-size:12px}.bk .bm .h{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);padding:1px 5px;border-bottom:1px solid var(--line)}
.bk .bm .a{display:flex;justify-content:space-between;gap:6px;padding:2px 5px}.bk .bm .a.r{border-left:3px solid var(--red)}.bk .bm .a.b{border-left:3px solid var(--blue)}.bk .bm .a.w{font-weight:bold;background:var(--hi)}
.bk .bm .a span.t{font-size:11px;color:var(--muted);font-weight:normal}
.st a.vid{color:var(--red);font-size:10px;text-decoration:none}.st a.vid:hover{color:var(--fg)}
.st td.wrap{white-space:normal;min-width:16em}.st .sub{font-size:11px;color:var(--muted);margin-top:1px}
.st a.vtag{font-size:10px;color:var(--red);white-space:nowrap;text-decoration:none}.st a.vtag:hover{text-decoration:underline}
.st a.tn b.num{color:var(--link);font-weight:normal;margin-right:2px}.st .sub.ind{margin-left:26px}
.st thead th{white-space:normal;vertical-align:bottom;line-height:1.15}
.hs{font-size:11px;font-weight:bold;white-space:nowrap}.hs-ok{color:var(--win)}.hs-warn{color:var(--pollen)}.hs-fail{color:var(--red)}.hs-info{color:var(--muted)}
.meter{display:inline-block;width:140px;height:8px;background:var(--head);border:1px solid var(--line);vertical-align:middle;margin-right:6px}.meter span{display:block;height:100%;background:var(--rule)}
.st .sub.r{color:var(--red)}
.clips{display:flex;flex-wrap:wrap;gap:2px 12px;margin:3px 0;font-size:12px}
form.shift{display:flex;flex-wrap:wrap;gap:3px;align-items:center}form.shift .go{padding:0 5px;font-size:11px}
.ssel{font:12px Verdana,sans-serif;padding:1px 4px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
.seasons td.g{font:15px Georgia,serif}
table.nosort th{cursor:default}
.st tr.grp th{text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);border-bottom:0;padding-bottom:0}
.st tr.ally td{border-top:2px solid var(--fg);font-weight:bold}
.st td.blank,.st td.off{color:var(--muted)}
.st td.split{box-shadow:inset 0 -2px 0 var(--pollen)}
.st td.clash{box-shadow:inset 0 -2px 0 var(--red)}
form.scout{margin:8px 0 4px;padding:8px 10px;background:var(--zebra);border:1px solid var(--line)}
form.scout .sr,form.scout .sg{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:end;margin:4px 0}
form.scout label{display:flex;flex-direction:column;font-size:11px;color:var(--muted);gap:2px}
form.scout label.chk{flex-direction:row;align-items:center;color:var(--fg);font-size:12px;padding-bottom:2px}
form.scout input,form.scout select{font:12px Verdana,sans-serif;padding:2px 4px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
form.scout input[type=number]{width:4.5em}form.scout input[name=by],form.scout input[name=note]{width:11em}
form.scout .sg>b{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding-bottom:4px}
form.scout .go{font:12px Verdana,sans-serif;margin-top:6px}
.abtn{font:11px Verdana,sans-serif;margin:0 4px 4px 0;padding:1px 6px;background:var(--bg);color:var(--fg);border:1px solid var(--line);cursor:pointer}
.abtn.on{background:var(--hi);border-color:var(--rule)}
#plog{margin:4px 0 0;padding-left:1.2em;font-size:11px}
ul.cards{margin:4px 0 10px;padding-left:1.2em;font-size:12px}
footer{max-width:1200px;margin:0 auto;padding:12px 16px 30px;color:var(--muted);font-size:11px;border-top:1px solid var(--line)}
@media (max-width:640px){.top form{margin-left:0;width:100%;order:9}.score .pts{font-size:26px}.sb{min-width:80px;padding:4px 8px}.sbv{font-size:18px}.tt{margin-left:auto}.top input{width:100%;max-width:none}h1{font-size:22px}}
`.replace(/\n/g, "");

/** Click-to-sort for every table.st. Numbers sort descending first (stats convention). */
export const SORT_JS =
  `document.addEventListener("click",function(e){var h=e.target.closest(".st thead th");if(!h||h.closest("table").classList.contains("nosort"))return;
var t=h.closest("table");var i=[].indexOf.call(h.parentNode.children,h);
var asc=h.dataset.dir==="desc";[].forEach.call(h.parentNode.children,function(x){delete x.dataset.dir});h.dataset.dir=asc?"asc":"desc";
var v=function(r){var c=r.children[i];if(!c)return"";var s=c.dataset.v!=null?c.dataset.v:c.textContent.trim();var n=parseFloat(s.replace(/,/g,""));return isNaN(n)?s.toLowerCase():n};
[].forEach.call(t.tBodies,function(b){var rows=[].filter.call(b.rows,function(r){return !r.classList.contains("wkh")});
rows.sort(function(a,c){var x=v(a),y=v(c);if(x===y)return 0;var r=typeof x==="number"&&typeof y==="number"?x-y:String(x)<String(y)?-1:1;return asc?r:-r});
rows.forEach(function(r){b.appendChild(r)})})});`.replace(/\n/g, "");

/** Orange pennant. Inlined as a data URI in <head>; also served at /favicon.svg. */
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect x="3" y="1" width="3.5" height="30" rx="1.75" fill="#6b2f10"/>' +
  '<path d="M6 2.5 31 12.5 6 22.5Z" fill="#f07a32"/>' +
  '<path d="M6 12.5H31L6 22.5Z" fill="#c4561d"/></svg>';

export const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;

/** Runs in <head> before first paint so a saved theme never flashes the wrong colors. */
export const THEME_HEAD_JS =
  'try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}';

/** Header button: cycles auto → light → dark, remembered per browser. */
export const THEME_TOGGLE_JS = `(function(){var b=document.getElementById("tt");if(!b)return;
var L={auto:"◐ Auto",light:"☀ Light",dark:"☾ Dark"},N={auto:"light",light:"dark",dark:"auto"};
var cur=function(){return document.documentElement.dataset.theme||"auto"};
var show=function(){var c=cur();b.textContent=L[c];b.title="Theme: "+c+" (click to change)"};show();
b.addEventListener("click",function(){var n=N[cur()],r=document.documentElement;
if(n==="auto")delete r.dataset.theme;else r.dataset.theme=n;
try{n==="auto"?localStorage.removeItem("theme"):localStorage.setItem("theme",n)}catch(e){}show()})})();document.addEventListener("keydown",function(e){var a=document.activeElement;if(e.key==="/"&&!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))){var i=document.querySelector(".top input");if(i){e.preventDefault();i.focus()}}});`.replace(
  /\n/g,
  "",
);

/** Play-by-play clicker on the match box score. Quick-line fields stay usable with script off. */
export const SCOUT_JS = `(function(){
var form=document.getElementById("scout");
if(!form)return;
var specEl=document.getElementById("scoutspec");
var spec={actions:[],groups:[]};
try{spec=JSON.parse(specEl&&specEl.textContent||"{}")}catch(e){}
var mode=form.querySelector("[name=mode]");
var box=document.getElementById("scout-log");
var listEl=document.getElementById("plog");
var hidden=form.querySelector("[name=log]");
var bar=document.getElementById("pbar");
var periods=document.getElementById("pperiod");
var period="tele";
var whereSel=null;
var list=[];
function actionOf(e){
  for(var i=0;i<spec.actions.length;i++){var a=spec.actions[i];if(a.key===e.action&&a.period===e.period)return a}
  return null}
function labelOf(e){
  var a=actionOf(e),w="";
  if(a&&e.where&&a.where){for(var i=0;i<a.where.length;i++)if(a.where[i].key===e.where)w=" ("+a.where[i].label+")"}
  return (e.period==="auto"?"Auto":"Tele")+" · "+(a?a.label:e.action)+w}
function render(){
  if(hidden)hidden.value=JSON.stringify(list);
  if(!listEl)return;
  listEl.textContent="";
  for(var i=0;i<list.length;i++){var li=document.createElement("li");li.textContent=labelOf(list[i]);listEl.appendChild(li)}}
function sync(){
  var log=!!(mode&&mode.value==="log");
  if(box)box.hidden=!log;
  var cols=form.querySelectorAll("[data-logcol]");
  for(var i=0;i<cols.length;i++){cols[i].disabled=log;var lab=cols[i].closest("label");if(lab)lab.hidden=log}
  var groups=form.querySelectorAll("[data-loggroup]");
  for(var g=0;g<groups.length;g++){
    var labels=groups[g].querySelectorAll("label"),any=false;
    for(var j=0;j<labels.length;j++)if(!labels[j].hidden)any=true;
    groups[g].hidden=log&&!any}}
if(mode)mode.addEventListener("change",sync);
if(periods)periods.addEventListener("click",function(ev){
  var b=ev.target.closest&&ev.target.closest("[data-period]");
  if(!b)return;
  period=b.getAttribute("data-period")||"tele";
  var bs=periods.querySelectorAll("[data-period]");
  for(var i=0;i<bs.length;i++)bs[i].classList.toggle("on",bs[i]===b);
  draw()});
function draw(){
  if(!bar)return;
  bar.textContent="";
  for(var i=0;i<spec.actions.length;i++){(function(a){
    if(a.period!==period)return;
    var b=document.createElement("button");
    b.type="button";b.className="abtn";b.textContent=a.label;
    b.addEventListener("click",function(){
      if(list.length>=80)return;
      var entry={period:a.period,action:a.key};
      if(a.where&&whereSel&&whereSel.value)entry.where=whereSel.value;
      list.push(entry);render()});
    bar.appendChild(b)})(spec.actions[i])}}
var whereWrap=document.getElementById("pwhere");
if(whereWrap){
  whereSel=document.createElement("select");
  var opt=document.createElement("option");opt.value="";opt.textContent="Flower (optional)";whereSel.appendChild(opt);
  var sample=null;
  for(var i=0;i<spec.actions.length;i++)if(spec.actions[i].where)sample=spec.actions[i].where;
  var wh=sample||[];
  for(var k=0;k<wh.length;k++){var o=document.createElement("option");o.value=wh[k].key;o.textContent=wh[k].label;whereSel.appendChild(o)}
  whereWrap.appendChild(whereSel)}
var undo=document.getElementById("pundo");
if(undo)undo.addEventListener("click",function(){list.pop();render()});
draw();sync();render()
})();`.replace(/\n/g, "");
