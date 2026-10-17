import type { Catalogue } from "@/lib/inventory/types";

import { mapLimit, releasePhotos, renderPhotoDataUrl } from "./images";
import { catalogueFooter, coverPhoto, type CatalogueItem } from "./model";

/**
 * A self-contained catalogue web page to download and share. Photos are
 * embedded as data URLs (signed storage links expire), and the layout matches
 * the in-app web view. Browser-only.
 */

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function buildCatalogueHtml({
  catalogue,
  items,
  storeName,
}: {
  catalogue: Catalogue;
  items: CatalogueItem[];
  storeName: string;
}) {
  try {
    const photos = await mapLimit(items, 4, (item) => renderPhotoDataUrl(item.cover, { width: 640, height: 800 }));
    const hero = catalogue.cover ? await renderPhotoDataUrl(coverPhoto(items), { width: 1200, height: 1400 }) : "";
    const store = escape(storeName);
    const title = escape(catalogue.title || catalogue.name || "Catalogue");
    const subtitle = escape(catalogue.subtitle);
    const pieces = `${items.length} ${items.length === 1 ? "piece" : "pieces"}`;

    const cards = items
      .map((item, i) => {
        const price = catalogue.showPrices && item.price ? `<span class="price">${escape(item.price)}</span>` : "";
        const colours =
          catalogue.showColours && item.colours.length
            ? `<div class="colours">${item.colours
                .map((c) => `<span><i style="background:${escape(c.hex)}"></i>${escape(c.name)}</span>`)
                .join("")}</div>`
            : "";
        return `<article>
  <img src="${photos[i]}" alt="${escape(item.name)}" loading="lazy" width="640" height="800">
  <div class="row"><h3>${escape(item.name)}</h3>${price}</div>
  ${colours}
</article>`;
      })
      .join("\n");

    const cover = catalogue.cover
      ? `<section class="cover">
  <div class="cover-text">
    <div class="eyebrow">${store}</div>
    <div class="cover-title"><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
    <div class="eyebrow">${pieces}</div>
  </div>
  <div class="cover-photo" style="background-image:url('${hero}')"></div>
</section>`
      : `<div class="plain-head"><div class="eyebrow">${store}</div><h1>${title}</h1></div>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${store}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#f5f2ec;color:#1a1714;font-family:Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h3{font-family:'Instrument Serif',Georgia,serif;font-weight:400;margin:0}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a9186}
.cover{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));min-height:78vh;background:#1a1714;color:#f2ede4}
.cover-text{padding:clamp(28px,6vw,80px);display:flex;flex-direction:column;justify-content:space-between;gap:48px}
.cover-title{display:flex;flex-direction:column;gap:18px}
.cover h1{font-style:italic;font-size:clamp(56px,8vw,120px);line-height:.9;letter-spacing:-.02em;text-wrap:balance}
.cover p{margin:0;font-size:18px;color:#c9c0b3;max-width:440px;line-height:1.5}
.cover-photo{min-height:420px;background:#2b2621 center/cover no-repeat}
main{max-width:1240px;margin:0 auto;padding:clamp(40px,6vw,88px) clamp(20px,4vw,48px)}
.plain-head{display:flex;flex-direction:column;gap:12px;margin-bottom:56px}
.plain-head .eyebrow{color:#6b645b}
.plain-head h1{font-style:italic;font-size:clamp(48px,7vw,96px);line-height:.92;letter-spacing:-.02em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:56px 28px}
article{display:flex;flex-direction:column;gap:14px;min-width:0}
article img{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:4px;background:#ebe5db}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
h3{font-size:26px;line-height:1.1}
.price{font-size:16px;font-weight:500;white-space:nowrap}
.colours{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:#6b645b}
.colours span{display:flex;align-items:center;gap:6px}
.colours i{width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
footer{border-top:1px solid #e5dfd5;margin-top:80px;padding-top:22px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;color:#8a8278}
</style>
</head>
<body>
${catalogue.cover ? cover : ""}
<main>
${catalogue.cover ? "" : cover}
<div class="grid">
${cards}
</div>
<footer><span>${store}</span><span>${escape(catalogueFooter(catalogue, storeName))}</span></footer>
</main>
</body>
</html>
`;
  } finally {
    releasePhotos();
  }
}
