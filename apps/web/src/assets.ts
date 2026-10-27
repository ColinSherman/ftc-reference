// Inlined into every page: no extra requests, no render blocking. Pages are edge-cached whole,
// so inlining costs nothing on repeat views.

// Dark tokens apply under the OS preference (unless the viewer forced light) or when forced dark.
const DARK =
  "--bg:#17181a;--fg:#e6e4dc;--muted:#9a988f;--line:#34352f;--head:#22231f;--zebra:#1c1d1a;--hi:#3a3520;" +
  "--link:#8cbcf0;--brand:#8f3c14;--brand-fg:#fff3ea;--rule:#e07a3c;--dot:#ffb877;--red:#f08a80;--red-bg:#2e1b1a;" +
  "--blue:#8fb2f0;--blue-bg:#1a2233;--pollen:#e0b040;--heat:240 128 60;--heat-a:.42;--win:#7fd69a;--win-bg:#17301f;--tile:#e9e7df;--grid:#2c2d29;--frame:#5c5d55;--sect:#f0975a;--focus:#8cbcf0;" +
  "--gsi-bg:#131314;--gsi-fg:#e3e3e3;--gsi-line:#8e918f;--gh-line:#3d444d";

export const CSS = `
:root{--bg:#fbfaf5;--fg:#1d1d1b;--muted:#6b6a63;--line:#d9d6c8;--head:#efece0;--zebra:#f4f2ea;--hi:#fff6c9;
--link:#0b4f8a;--brand:#a8481a;--brand-fg:#fffaf5;--rule:#a8481a;--dot:#ffc58a;--red:#b3261e;--red-bg:#fbe9e7;--blue:#1f4e9c;--blue-bg:#e7eefb;--pollen:#c58b00;--heat:232 106 40;--heat-a:.5;--win:#1e6b34;--win-bg:#e2f2e5;--tile:#fff;--grid:#e3e0d4;--frame:#8d8a7e;--sect:#94450f;--focus:#0b4f8a;
--gsi-bg:#fff;--gsi-fg:#1f1f1f;--gsi-line:#747775;--gh-line:#24292f;
--ff:"Helvetica Neue",Helvetica,Arial,sans-serif}
:root{color-scheme:light dark}:root[data-theme=light]{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 var(--ff)}
button,input,select,textarea{font:inherit}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3{font-weight:bold;line-height:1.2;margin:.2em 0 .4em}
/* Section headings in the brand colour, no rule: the Basketball-Reference treatment. */
h1{font-size:28px;letter-spacing:-.3px}h2{font-size:21px;color:var(--sect);margin:1.3em 0 .35em}h3{font-size:16px;color:var(--sect)}
:focus-visible{outline:2px solid var(--focus);outline-offset:1px}.top :focus-visible{outline-color:var(--brand-fg)}
.top{background:var(--brand);color:var(--brand-fg)}
.top .in{max-width:1200px;margin:0 auto;padding:6px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.top a{color:var(--brand-fg)}.logo{font-size:22px;font-weight:bold;letter-spacing:-.6px}.logo b{color:var(--dot)}
.top nav{display:flex;gap:16px;font-size:14px;font-weight:bold}
.top form{margin-left:auto}
.tt{font-size:12px;background:none;color:var(--brand-fg);border:1px solid rgba(255,255,255,.45);border-radius:2px;padding:2px 7px;cursor:pointer;white-space:nowrap}.tt:hover{background:rgba(255,255,255,.12)}.top input{padding:4px 7px;width:220px;max-width:50vw;border:1px solid #000;border-radius:2px}
main{max-width:1200px;margin:0 auto;padding:10px 16px 40px}
.crumbs{font-size:12px;color:var(--muted);margin-bottom:4px}
.bio{display:flex;flex-wrap:wrap;gap:4px 24px;margin:4px 0 10px}.bio div{white-space:nowrap}.bio b{color:var(--muted);font-weight:normal}
.tabs{display:flex;flex-wrap:wrap;gap:2px 16px;font-size:14px;font-weight:bold;margin:6px 0;padding:4px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.scroll{overflow-x:auto;max-width:100%}
table.st{border-collapse:collapse;font:12px/1.3 Verdana,Geneva,"DejaVu Sans",sans-serif;margin:4px 0 14px;white-space:nowrap;border:1px solid var(--frame)}
.st th,.st td{padding:3px 7px;border:1px solid var(--grid);border-bottom-style:dotted;border-bottom-color:var(--line);text-align:right}
.st th{background:var(--head);font-weight:bold;position:sticky;top:0;cursor:pointer;user-select:none}
.st thead th{border-bottom:1px solid var(--frame);border-color:var(--line) var(--line) var(--frame)}
.st tbody tr:last-child td{border-bottom-style:solid}
.st th[data-dir]:after{content:" ▾";color:var(--muted)}.st th[data-dir=asc]:after{content:" ▴"}
.st .l{text-align:left}.st tbody tr:nth-child(even of :not(.thead)){background:var(--zebra)}.st tbody tr:hover{background:var(--hi)}
.st td.r{color:var(--red)}.st td.b{color:var(--blue)}.st td.w{font-weight:bold}
.st tfoot td{font-weight:bold;background:var(--head);border-top:1px solid var(--frame);border-bottom-style:solid}
.note{color:var(--muted);font-size:12px}
.os{display:inline-flex;align-items:center;gap:6px;color:var(--brand-fg);font-size:13px;text-decoration:none;white-space:nowrap;cursor:pointer}
.os:hover{text-decoration:none}
.os i{width:28px;height:16px;border:1px solid rgba(255,255,255,.55);border-radius:8px;position:relative;flex:none}
.os i:before{content:"";position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;background:var(--brand-fg)}
html[data-stats=all] .os i{background:rgba(255,255,255,.28)}
html[data-stats=all] .os i:before{left:13px}
.pill{display:inline-block;padding:0 5px;border-radius:2px;font-size:11px;font-weight:normal;vertical-align:middle;background:var(--head);border:1px solid var(--line)}
.live{background:var(--red);color:#fff;border-color:var(--red)}
.st th.rh{background:var(--red-bg);color:var(--red)}.st th.bh{background:var(--blue-bg);color:var(--blue)}
.fl{font-family:Consolas,Menlo,monospace;letter-spacing:1px}.fl i{font-style:normal;padding:0 1px}
.fl .R{color:var(--red)}.fl .B{color:var(--blue)}.fl .P{color:var(--pollen)}
.video{width:100%;aspect-ratio:16/9;border:0}.video.none{aspect-ratio:auto;padding:10px;border:1px dashed var(--line);color:var(--muted)}
.mx{display:grid;grid-template-columns:min-content minmax(0,1fr);gap:0 32px;align-items:start}
@media (max-width:900px){.mx{grid-template-columns:minmax(0,1fr)}}
.st td{font-variant-numeric:tabular-nums}
.st a.tn{color:var(--fg);display:inline-block;max-width:12em;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
.st .av,.st .flag{vertical-align:middle}.st td{vertical-align:middle}.st a.tn:hover{color:var(--link)}
.ht{background:rgb(var(--heat) / calc(var(--h,0) * var(--heat-a)))}
.av{display:inline-block;width:20px;height:20px;border-radius:3px;background:var(--tile);box-shadow:0 0 0 1px var(--line);vertical-align:-5px;margin-right:6px;object-fit:contain}
.av0{background:var(--head)}
.flag{display:inline-block;width:20px;height:15px;vertical-align:-2px;margin-right:6px;border-radius:2px;box-shadow:0 0 0 1px var(--line);object-fit:cover}
.photos{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 10px}.photos figure{margin:0;width:200px}.photos img{display:block;width:200px;height:150px;object-fit:cover;border-radius:6px;background:var(--tile);box-shadow:0 0 0 1px var(--line)}.photos figure.ig{width:326px}.photos iframe{display:block;width:326px;height:440px;max-width:100%;border:0;border-radius:6px;background:var(--tile)}.photos figcaption{font-size:12px;color:var(--muted);margin-top:2px}
.hero{width:160px;height:120px;object-fit:cover;border-radius:6px;box-shadow:0 0 0 1px var(--line);background:var(--tile)}
.psub summary{cursor:pointer;color:var(--link)}.psub form{margin:6px 0;max-width:520px}
.av.xl{width:80px;height:80px;border-radius:6px;margin:0;image-rendering:pixelated;vertical-align:top}
.card{display:flex;gap:18px;align-items:flex-start;margin:6px 0 4px;flex-wrap:wrap}.card h1{margin-top:0}
.card .who{flex:1;min-width:260px}
.sbr{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
.sb{border:1px solid var(--line);border-top:3px solid var(--rule);background:var(--zebra);padding:5px 12px 6px;min-width:96px}
.sbv{font-size:24px;font-weight:bold;font-variant-numeric:tabular-nums;line-height:1.2;letter-spacing:-.3px}.sbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}.sbs{font-size:11px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:4px 22px;align-items:start}
.box h3{display:flex;align-items:baseline;gap:8px;margin:18px 0 4px;font-size:18px}
.st td.wk{white-space:normal;min-width:0;overflow-wrap:anywhere}.st td.wk a{white-space:normal}
a.mark{font-size:11px;margin-left:5px;text-decoration:none}
.st td.wk a.mark{white-space:nowrap}
a.mark.res{color:var(--win)}a.mark.vid{color:var(--red)}a.mark:hover{color:var(--fg)}
.st td.when{white-space:nowrap;width:1%}
.box a.clip{display:inline-block;max-width:16em;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;white-space:nowrap}
.box .more{margin-left:auto;font-size:12px;font-weight:normal}
.pager{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:4px 0 8px;font-size:13px}
.pager .off{color:var(--muted)}
.pager select{font-size:13px;padding:1px 4px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
.box table.st{width:100%}
.res{display:inline-block;min-width:16px;text-align:center;font-weight:bold;font-size:11px;border-radius:2px;padding:0 3px}
.resW{color:var(--win);background:var(--win-bg)}.resL{color:var(--muted)}.resT{color:var(--fg);background:var(--head)}
.st-live{background:var(--red);color:#fff;border-color:var(--red)}.st-final{color:var(--muted)}.st-upcoming{color:var(--link)}
.sitestats{color:var(--muted);font-size:12px;margin:-4px 0 6px}
.score{display:grid;grid-template-columns:1fr 1fr;gap:0;max-width:720px;margin:8px 0 4px;border:1px solid var(--line)}
.score>div{padding:8px 12px}.score .rs{background:var(--red-bg);border-right:1px solid var(--line)}.score .bs{background:var(--blue-bg);text-align:right}
.score .pts{font-size:38px;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.score .rs .pts{color:var(--red)}.score .bs .pts{color:var(--blue)}
.score .won .pts{font-weight:bold}.score .won .pts:after{content:" ✓";font-size:20px}
.score .tm{margin-top:4px;font-size:14px}.score .tm div{margin:3px 0}.score .bs .av{margin:0 0 0 6px}
.mnav{display:flex;gap:16px;font-size:14px;margin:4px 0}
.fls{display:flex;gap:22px;flex-wrap:wrap;margin:6px 0 2px}
.stk{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;color:var(--muted)}
.stk .col{display:flex;flex-direction:column-reverse;align-items:center;gap:2px;min-height:60px;justify-content:flex-start;padding:3px 6px;border-bottom:3px solid var(--line)}
.ball{width:13px;height:13px;border-radius:50%;display:block}.ball.R{background:var(--red)}.ball.B{background:var(--blue)}.ball.P{background:var(--pollen);width:10px;height:10px}
.st .wkh th{background:var(--bg);border:0;border-bottom:2px solid var(--rule);text-align:left;font-family:var(--ff);font-size:16px;color:var(--sect);padding:14px 4px 3px;cursor:default;position:static}
#wk{scroll-margin-top:32px}
.wkh th span{font-size:12px;font-weight:normal;color:var(--muted);margin-left:8px}
.filters{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:end;margin:6px 0 4px;padding:8px 10px;background:var(--zebra);border:1px solid var(--line)}
.filters label{display:flex;flex-direction:column;font-size:12px;color:var(--muted);gap:2px}
.filters select,.filters input{font-size:13px;padding:3px 5px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:2px}
.filters input{width:180px}.filters input[type=checkbox]{width:auto;margin:0}.filters .go{font-size:13px}
.st tr.has a.ev{font-weight:bold}.st .dot{font-size:10px;color:var(--win);white-space:nowrap}
.st tr.nores td,.st tr.nores a.ev{color:var(--muted)}
.filters .chk{justify-content:flex-end}.filters .chk span{display:flex;align-items:center;gap:4px;font-size:13px;color:var(--fg);padding-bottom:3px}
.st th.vc,.st td.vc{width:16px;min-width:16px;padding:2px 2px 2px 6px;text-align:center}
.st a.tl{display:inline-block;margin-right:10px;white-space:nowrap}.st a.tl .av{margin-right:4px}
.st tr.sep td{border-top:3px double var(--fg)}
.st td.top{background:color-mix(in srgb,var(--pollen) 28%,transparent);font-weight:bold}.st td.top:after{content:" ★";color:var(--pollen)}
.bk{display:flex;gap:18px;overflow-x:auto;padding:4px 0 10px;align-items:stretch}.bk .col{display:flex;flex-direction:column;justify-content:space-around;gap:8px;min-width:150px}
.bk h4{margin:0 0 2px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.bk .bm{border:1px solid var(--frame);background:var(--tile);font-size:13px}.bk .bm .h{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);padding:1px 5px;border-bottom:1px solid var(--line)}
.bk .bm .a{display:flex;justify-content:space-between;gap:6px;padding:2px 5px}.bk .bm .a.r{border-left:3px solid var(--red)}.bk .bm .a.b{border-left:3px solid var(--blue)}.bk .bm .a.w{font-weight:bold;background:var(--hi)}
.bk .bm .a span.t{font-size:11px;color:var(--muted);font-weight:normal}
.st a.vid{color:var(--red);font-size:10px;text-decoration:none}.st a.vid:hover{color:var(--fg)}
.st td.wrap{white-space:normal;min-width:16em}.st .sub{font-size:12px;color:var(--muted);margin-top:1px}
.st a.vtag{font-size:10px;color:var(--red);white-space:nowrap;text-decoration:none}.st a.vtag:hover{text-decoration:underline}
.st a.tn b.num{color:var(--link);font-weight:normal;margin-right:2px}.st .sub.ind{margin-left:26px}
.st thead th,.st tr.thead th{white-space:normal;vertical-align:bottom;line-height:1.15}
.st tr.thead th{position:static;cursor:default;border-top:1px solid var(--frame);border-bottom:1px solid var(--frame)}
.st tr.over th{text-align:center;vertical-align:bottom;cursor:default;border:1px solid var(--frame)}.st tr.over th.sp{background:none;border-color:transparent transparent var(--frame)}
.hs{font-size:11px;font-weight:bold;white-space:nowrap}.hs-ok{color:var(--win)}.hs-warn{color:var(--pollen)}.hs-fail{color:var(--red)}.hs-info{color:var(--muted)}
.tabs .pill{align-self:center;text-transform:uppercase;font-weight:bold}.env-staging{color:#fff;background:var(--pollen);border-color:var(--pollen)}.env-production{color:#fff;background:var(--red);border-color:var(--red)}
.meter{display:inline-block;width:140px;height:8px;background:var(--head);border:1px solid var(--line);vertical-align:middle;margin-right:6px}.meter span{display:block;height:100%;background:var(--rule)}
.st .sub.r{color:var(--red)}
.clips{display:flex;flex-wrap:wrap;gap:2px 12px;margin:3px 0;font-size:13px}
form.shift{display:flex;flex-wrap:wrap;gap:3px;align-items:center}form.shift .go{padding:0 5px;font-size:11px}
.ssel{font-size:13px;padding:1px 4px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
.seasons td.g{font-size:15px;font-weight:bold}
footer{max-width:1200px;margin:0 auto;padding:12px 16px 30px;color:var(--muted);font-size:12px;border-top:1px solid var(--line)}
footer .fl-links{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px;font-size:13px}
.acct{font-size:13px;white-space:nowrap}
.signin{display:flex;flex-direction:column;gap:10px;margin:14px 0 18px;max-width:300px}
.sso{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:40px;padding:0 12px;border:1px solid;border-radius:4px;font:500 14px/1 Roboto,var(--ff);letter-spacing:.25px;cursor:pointer;position:relative}
.sso svg{width:20px;height:20px;position:absolute;left:12px}.sso:hover{filter:brightness(.96)}.sso:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.sso-google{background:var(--gsi-bg);color:var(--gsi-fg);border-color:var(--gsi-line)}
.sso-github{background:#24292f;color:#fff;border-color:var(--gh-line)}.sso-github:hover{filter:brightness(1.15)}
.sso-dev{background:var(--head);color:var(--fg);border-color:var(--frame);border-style:dashed}
.ok{color:var(--win);font-weight:bold}.err{color:var(--red);font-weight:bold}
.prose{max-width:720px;line-height:1.55}.prose li{margin:3px 0}.prose code{font-size:13px;background:var(--head);padding:0 3px}
@media (max-width:640px){.top form{margin-left:0;width:100%;order:9}.score .pts{font-size:26px}.sb{min-width:80px;padding:4px 8px}.sbv{font-size:18px}.tt{margin-left:auto}.top input{width:100%;max-width:none}h1{font-size:23px}tr.mhide{display:none}.st th,.st td{padding:3px 5px}}
`.replace(/\n/g, "");

/**
 * Click-to-sort for every table.st. Numbers sort descending first (stats convention).
 * Long tables repeat their header row every 20 rows, as on Sports-Reference; the copies are
 * rebuilt after each sort. Week-grouped bodies (.wkh) are left alone.
 */
export const SORT_JS =
  `function rh(t){[].forEach.call(t.querySelectorAll("tr.thead"),function(r){r.remove()});
var h=t.tHead&&t.tHead.rows[t.tHead.rows.length-1];if(!h)return;
[].forEach.call(t.tBodies,function(b){if(b.querySelector(".wkh"))return;var rows=[].slice.call(b.rows);
for(var i=20;i<rows.length-4;i+=20){var c=h.cloneNode(true);c.className="thead";c.setAttribute("aria-hidden","true");
[].forEach.call(c.cells,function(x){delete x.dataset.dir;x.removeAttribute("id")});b.insertBefore(c,rows[i])}})}
[].forEach.call(document.querySelectorAll("table.st"),rh);
document.addEventListener("click",function(e){var h=e.target.closest(".st thead tr:not(.over) th");if(!h)return;
var t=h.closest("table");var i=[].indexOf.call(h.parentNode.children,h);
var asc=h.dataset.dir==="desc";[].forEach.call(h.parentNode.children,function(x){delete x.dataset.dir});h.dataset.dir=asc?"asc":"desc";
var v=function(r){var c=r.children[i];if(!c)return"";var s=c.dataset.v!=null?c.dataset.v:c.textContent.trim();var n=parseFloat(s.replace(/,/g,""));return isNaN(n)?s.toLowerCase():n};
[].forEach.call(t.querySelectorAll("tr.thead"),function(r){r.remove()});
[].forEach.call(t.tBodies,function(b){var rows=[].filter.call(b.rows,function(r){return !r.classList.contains("wkh")});
rows.sort(function(a,c){var x=v(a),y=v(c);if(x===y)return 0;var r=typeof x==="number"&&typeof y==="number"?x-y:String(x)<String(y)?-1:1;return asc?r:-r});
rows.forEach(function(r){b.appendChild(r)})});rh(t)});`.replace(/\n/g, "");

/** Orange pennant. Inlined as a data URI in <head>; also served at /favicon.svg. */
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect x="3" y="1" width="3.5" height="30" rx="1.75" fill="#6b2f10"/>' +
  '<path d="M6 2.5 31 12.5 6 22.5Z" fill="#f07a32"/>' +
  '<path d="M6 12.5H31L6 22.5Z" fill="#c4561d"/></svg>';

export const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;

/** Runs in <head> before first paint so a saved theme never flashes the wrong colors. */
export const THEME_HEAD_JS =
  'try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}' +
  'try{if(/(?:^|; )stats=all(?:;|$)/.test(document.cookie))document.documentElement.dataset.stats="all"}catch(e){}';

/** Header button: cycles auto → light → dark, remembered per browser. */
export const THEME_TOGGLE_JS =
  `(function(){var b=document.getElementById("tt");if(!b)return;
var L={auto:"◐ Auto",light:"☀ Light",dark:"☾ Dark"},N={auto:"light",light:"dark",dark:"auto"};
var cur=function(){return document.documentElement.dataset.theme||"auto"};
var show=function(){var c=cur();b.textContent=L[c];b.title="Theme: "+c+" (click to change)"};show();
b.addEventListener("click",function(){var n=N[cur()],r=document.documentElement;
if(n==="auto")delete r.dataset.theme;else r.dataset.theme=n;
try{n==="auto"?localStorage.removeItem("theme"):localStorage.setItem("theme",n)}catch(e){}show()})})();` +
  `(function(){var a=document.getElementById("os");if(!a)return;var on=function(){return document.documentElement.dataset.stats==="all"};
var show=function(){var v=on();a.setAttribute("aria-checked",v?"true":"false");a.title=v?"Including off-season events in records and leaderboards":"Off-season events are left out of records and leaderboards"};
show();a.addEventListener("click",function(e){e.preventDefault();var u=new URL(location.href);u.searchParams.set("stats",on()?"official":"all");location.href=u.pathname+u.search})})();` +
  `document.addEventListener("keydown",function(e){var a=document.activeElement;if(e.key==="/"&&!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))){var i=document.querySelector(".top input");if(i){e.preventDefault();i.focus()}}});`.replace(
    /\n/g,
    "",
  );
