// Inlined into every page: no extra requests, no render blocking. Pages are edge-cached whole,
// so inlining costs nothing on repeat views.

export const CSS = `
:root{--bg:#fbfaf5;--fg:#1d1d1b;--muted:#6b6a63;--line:#d9d6c8;--head:#efece0;--zebra:#f4f2ea;--hi:#fff6c9;
--link:#0b4f8a;--brand:#a8481a;--brand-fg:#fffaf5;--rule:#a8481a;--dot:#ffc58a;--red:#b3261e;--red-bg:#fbe9e7;--blue:#1f4e9c;--blue-bg:#e7eefb;--pollen:#c58b00}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#17181a;--fg:#e6e4dc;--muted:#9a988f;--line:#34352f;
--head:#22231f;--zebra:#1c1d1a;--hi:#3a3520;--link:#8cbcf0;--brand:#8f3c14;--brand-fg:#fff3ea;--rule:#e07a3c;--dot:#ffb877;--red:#f08a80;--red-bg:#2e1b1a;
--blue:#8fb2f0;--blue-bg:#1a2233;--pollen:#e0b040}}
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
.top form{margin-left:auto}.top input{font:inherit;padding:3px 6px;width:220px;max-width:50vw;border:1px solid #000;border-radius:2px}
main{max-width:1200px;margin:0 auto;padding:10px 16px 40px}
.crumbs{font-size:11px;color:var(--muted);margin-bottom:4px}
.bio{display:flex;flex-wrap:wrap;gap:4px 24px;margin:4px 0 10px}.bio div{white-space:nowrap}.bio b{color:var(--muted);font-weight:normal}
.tabs{display:flex;flex-wrap:wrap;gap:2px 14px;font-size:12px;margin:6px 0;padding:4px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.scroll{overflow-x:auto;max-width:100%}
table.st{border-collapse:collapse;font-size:12px;margin:4px 0 12px;white-space:nowrap}
.st th,.st td{padding:2px 7px;border-bottom:1px solid var(--line);text-align:right}
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
footer{max-width:1200px;margin:0 auto;padding:12px 16px 30px;color:var(--muted);font-size:11px;border-top:1px solid var(--line)}
@media (max-width:640px){.top form{margin-left:0;width:100%}.top input{width:100%;max-width:none}h1{font-size:22px}}
`.replace(/\n/g, "");

/** Click-to-sort for every table.st. Numbers sort descending first (stats convention). */
export const SORT_JS =
  `document.addEventListener("click",function(e){var h=e.target.closest(".st th");if(!h)return;
var t=h.closest("table"),b=t.tBodies[0];if(!b)return;var i=[].indexOf.call(h.parentNode.children,h);
var asc=h.dataset.dir==="desc";[].forEach.call(h.parentNode.children,function(x){delete x.dataset.dir});h.dataset.dir=asc?"asc":"desc";
var v=function(r){var c=r.children[i];if(!c)return"";var s=c.dataset.v!=null?c.dataset.v:c.textContent.trim();var n=parseFloat(s.replace(/,/g,""));return isNaN(n)?s.toLowerCase():n};
var rows=[].slice.call(b.rows).sort(function(a,c){var x=v(a),y=v(c);if(x===y)return 0;var r=typeof x==="number"&&typeof y==="number"?x-y:String(x)<String(y)?-1:1;return asc?r:-r});
rows.forEach(function(r){b.appendChild(r)})});`.replace(/\n/g, "");
