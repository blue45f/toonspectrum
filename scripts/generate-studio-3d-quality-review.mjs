import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const output = join(root, "artifacts/studio-3d-quality-review");
const items = [];
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const link = path => relative(output, path).split("/").map(encodeURIComponent).join("/");

for (const group of [
  { kind: "prop", directory: "artifacts/studio-asset-quality-v8/previews", expected: 11 },
  { kind: "environment", directory: "artifacts/studio-environment-quality-v6", expected: 12 },
]) {
  const directory = join(root, group.directory);
  const names = (await readdir(directory)).filter(name => name.endsWith("-before.png")).sort();
  if (names.length !== group.expected) throw new Error(`${group.kind}: expected ${group.expected} before renders, found ${names.length}`);
  for (const name of names) {
    const after = name.replace(/-before\.png$/u, "-after.png");
    await stat(join(directory, after));
    items.push({ kind: group.kind, name: name.replace(/-before\.png$/u, "").replaceAll("_", " "),
      before: link(join(directory, name)), after: link(join(directory, after)) });
  }
}

for (const name of ["mega-angel", "alicia", "rubin", "unicorn-person", "vivi"]) {
  const directory = join(root, "apps/web/public/assets/3d/characters/thumbnails");
  await stat(join(directory, "refined-v1", `${name}.png`));
  items.push({ kind: "avatar", name: name.replaceAll("-", " "),
    before: link(join(directory, `${name}.png`)), after: link(join(directory, "refined-v1", `${name}.png`)) });
}

const cards = items.map(item => `<article data-kind="${item.kind}">
  <header><span class="kind">${item.kind === "avatar" ? "Avatar preview" : item.kind}</span><h2>${escapeHtml(item.name)}</h2></header>
  <div class="comparison"><figure><img loading="lazy" src="${escapeHtml(item.before)}" alt="${escapeHtml(item.name)} before"><figcaption>Before</figcaption></figure>
  <figure><img loading="lazy" src="${escapeHtml(item.after)}" alt="${escapeHtml(item.name)} after"><figcaption>${item.kind === "avatar" ? "Same model, refined preview" : "Revised model"}</figcaption></figure></div>
</article>`).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ToonStudio | 3D Asset Review</title>
<style>
:root{--paper:#f3f0e9;--ink:#263637;--muted:#697273;--line:#c9cfca;--accent:#a64d30}
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:radial-gradient(ellipse at 0 0,#e2e9df,transparent 65%),var(--paper);font:15px/1.6 Georgia,serif}
.page{max-width:1500px;margin:auto;padding:50px 32px 70px}.eyebrow,.kind,button,.numbers,figcaption{font-family:Verdana,sans-serif}.eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
h1{font-weight:400;font-size:clamp(38px,6vw,76px);line-height:1.08;letter-spacing:-.045em;margin:14px 0 20px}.intro{max-width:760px;font-size:18px;color:var(--muted)}
.numbers{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0 30px;font-size:12px}.numbers strong{font-size:27px;font-weight:400;margin-right:6px}
nav{position:sticky;top:0;z-index:2;display:flex;gap:8px;flex-wrap:wrap;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--paper)}
button{min-height:44px;padding:8px 18px;border:1px solid var(--line);border-radius:0;background:transparent;color:var(--ink);font-size:12px;cursor:pointer}button[aria-pressed=true]{background:var(--ink);color:white;border-color:var(--ink)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 24px;padding-top:30px}article{border-bottom:1px solid var(--line);padding-bottom:20px;min-width:0}article[hidden]{display:none}article header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px}.kind{text-transform:uppercase;font-size:9px;letter-spacing:.14em;color:var(--accent)}h2{font-size:22px;line-height:1.2;font-weight:400;text-transform:capitalize;margin:0}
.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}figure{margin:0;min-width:0}img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#faf9f5}figcaption{font-size:10px;color:var(--muted);padding:8px 0;text-transform:uppercase;letter-spacing:.07em}.note{border-top:1px solid var(--line);margin-top:36px;padding-top:18px;color:var(--muted);font-size:14px}#count{margin-left:auto;align-self:center;font:12px Verdana,sans-serif;color:var(--muted)}
@media(max-width:850px){.grid{grid-template-columns:1fr}.page{padding:30px 16px}.intro{font-size:16px}#count{margin-left:0;width:100%}.numbers{gap:18px}}@media(prefers-reduced-motion:no-preference){article{animation:reveal .4s ease-out}@keyframes reveal{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
</style></head><body><div class="page">
<div class="eyebrow">ToonStudio / Asset library / Revision review</div><h1>More form.<br>More readable detail.</h1>
<p class="intro">Compare the actual Blender model revisions and original VRM renders. Each pair keeps its original source available; avatar changes improve the camera and backdrop without replacing the character.</p>
<div class="numbers"><span><strong>11</strong> revised props</span><span><strong>12</strong> revised environments</span><span><strong>5</strong> avatar previews</span></div>
<nav aria-label="Review category"><button type="button" data-filter="all" aria-pressed="true">All 28</button><button type="button" data-filter="prop" aria-pressed="false">Props 11</button><button type="button" data-filter="environment" aria-pressed="false">Environments 12</button><button type="button" data-filter="avatar" aria-pressed="false">Avatar previews 5</button><span id="count" role="status">28 comparisons</span></nav>
<main class="grid">${cards}</main><p class="note">These comparisons show the reviewed camera views. They are evidence of specific revisions, not a claim that every asset in the entire library has passed an artistic review from every angle. Existing project model files and identifiers remain available.</p>
</div><script>
for(const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click',()=>{
const filter=button.dataset.filter;let count=0;
for(const item of document.querySelectorAll('article[data-kind]')){item.hidden=filter!=='all'&&item.dataset.kind!==filter;if(!item.hidden)count++;}
for(const control of document.querySelectorAll('[data-filter]'))control.setAttribute('aria-pressed',String(control===button));
document.querySelector('#count').textContent=count+' comparisons';
});
</script></body></html>`;

await mkdir(output, { recursive: true });
await writeFile(join(output, "index.html"), html);
await writeFile(join(output, "comparisons.json"), `${JSON.stringify(items, null, 2)}\n`);
console.log(JSON.stringify({ output: join(output, "index.html"), comparisons: items.length }));
