import type { Catalogue, CatalogueTheme } from "@/lib/inventory/types";

import { mapLimit, releasePhotos, renderPhotoDataUrl } from "./images";
import { catalogueFooter, coverPhoto, type CatalogueItem, type PhotoRef } from "./model";

/**
 * The catalogue as a web page, in the catalogue's design. The same markup is
 * shown in the app (with live photo links) and downloaded to share (with
 * photos embedded as data URLs, since signed storage links expire).
 */

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Behind transparent (background-removed) cover photos. */
const COVER_FILL: Partial<Record<CatalogueTheme, string>> = { Lookbook: "#151412", Boutique: "#fcf6f1" };

const coverRef = (catalogue: Catalogue, items: CatalogueItem[]): PhotoRef => {
  const ref = coverPhoto(items);
  return { ...ref, backdrop: ref.backdrop ?? COVER_FILL[catalogue.theme] };
};

/** CSS `background` for a photo, matching `photoBackground()` in the dashboard. */
/** 2.5px stripes: 1.875pt, as in the PDF. */
const STRIPES = "repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 2.5px, rgba(0,0,0,0) 2.5px 5px)";

export function photoCss({ hex, imageUrl, backdrop }: PhotoRef) {
  // Transparent (background-removed) photos sit on the striped backdrop tone.
  if (imageUrl) return `center / cover no-repeat url("${imageUrl}")${backdrop ? `, ${STRIPES}, ${backdrop}` : ""}`;
  return `${STRIPES}, ${hex || "#d9d1c4"}`;
}

/** A photo block; with a link it opens the product's WhatsApp catalogue item in a new tab. */
function photoHtml(className: string, background: string, label: string, link?: string) {
  const style = `background:${escape(background)}`;
  if (!link) return `<div class="${className}" role="img" aria-label="${escape(label)}" style="${style}"></div>`;
  const name = label ? `${label} on WhatsApp` : "View on WhatsApp";
  return `<a class="${className}" href="${escape(link)}" target="_blank" rel="noopener" aria-label="${escape(name)}" title="${escape(name)}" style="${style}"></a>`;
}

type HtmlInput = {
  catalogue: Catalogue;
  items: CatalogueItem[];
  storeName: string;
  /** CSS backgrounds for the cover and each item; live photo links when left out. */
  photos?: { cover: string; items: string[] };
};

const BASE_CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h3{font-weight:400;margin:0}
.serif,h1,h3{font-family:'Instrument Serif',Georgia,serif}
.mono{font-family:'Geist Mono',ui-monospace,monospace}
main{max-width:1240px;margin:0 auto;padding:clamp(40px,6vw,88px) clamp(20px,4vw,48px)}
.grid{display:grid}
article{display:flex;flex-direction:column;gap:14px;min-width:0}
.photo{width:100%;aspect-ratio:4/5}
a.photo,a.cover-photo{display:block;cursor:pointer}
.caption{display:flex;flex-direction:column;gap:8px;min-width:0}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.price{white-space:nowrap}
.colours{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}
.colours span{display:flex;align-items:center;gap:6px}
.colours i{flex:none;width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.colours b{font-weight:inherit}
.plain-head{display:flex;flex-direction:column;gap:12px;margin-bottom:56px}
.plain-head p{margin:0;font-size:17px;line-height:1.5;max-width:520px}
.empty{padding:80px 0;text-align:center;font-size:18px}
footer{margin-top:80px;padding-top:22px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px}
`;

const THEME_CSS: Record<CatalogueTheme, string> = {
  Classic: `
body{background:#f5f2ec;color:#1a1714}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a9186}
.cover{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));min-height:78vh;background:#1a1714;color:#f2ede4}
.cover-text{padding:clamp(28px,6vw,80px);display:flex;flex-direction:column;justify-content:space-between;gap:48px}
.cover-title{display:flex;flex-direction:column;gap:18px}
.cover h1{font-style:italic;font-size:clamp(56px,8vw,120px);line-height:.9;letter-spacing:-.02em;text-wrap:balance}
.cover p{margin:0;font-size:18px;color:#c9c0b3;max-width:440px;line-height:1.5}
.cover-photo{min-height:420px}
.plain-head .eyebrow{color:#6b645b}
.plain-head h1{font-style:italic;font-size:clamp(48px,7vw,96px);line-height:.92;letter-spacing:-.02em}
.plain-head p,.colours,.empty{color:#6b645b}
.grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:56px 28px}
.photo{border-radius:4px}
.no{display:none}
h3{font-size:26px;line-height:1.1}
.price{font-size:16px;font-weight:500}
footer{border-top:1px solid #e5dfd5;color:#8a8278}
`,
  Atelier: `
body{background:#fff;color:#111}
.eyebrow{font-size:11px;font-weight:500;letter-spacing:.28em;text-transform:uppercase}
.cover{max-width:1240px;margin:0 auto;padding:clamp(24px,5vw,64px) clamp(20px,4vw,48px) 0;display:flex;flex-direction:column;gap:clamp(24px,4vw,44px)}
.cover-text{display:contents}
.cover .store{order:0;text-align:center}
.cover-photo{order:1;height:min(72vh,760px);min-height:320px}
.cover-title{order:2;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.cover h1,.plain-head h1{font-family:Geist,system-ui,sans-serif;font-weight:500;text-transform:uppercase;letter-spacing:.04em;font-size:clamp(28px,4.4vw,52px);line-height:1.1;text-wrap:balance}
.cover p,.plain-head p{margin:0;color:#6f6f6f;font-size:15px;line-height:1.5;max-width:520px}
.cover .count{order:3;text-align:center;font-family:'Geist Mono',monospace;font-weight:400;letter-spacing:.12em;color:#a3a3a3;border-top:1px solid #e8e8e8;padding-top:18px}
.plain-head{align-items:center;text-align:center;gap:16px;margin-bottom:72px}
.grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:56px 24px}
article{gap:14px}
.caption{gap:6px}
.no{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.1em;color:#a3a3a3}
.row{flex-direction:column;align-items:flex-start;gap:4px}
h3{font-family:Geist,system-ui,sans-serif;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;line-height:1.4}
.price{font-size:13px;color:#6f6f6f}
.colours{gap:5px;margin-top:4px}
.colours i{width:9px;height:9px}
.colours b{display:none}
.empty{color:#6f6f6f}
footer{border-top:1px solid #e8e8e8;color:#a3a3a3;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
`,
  Lookbook: `
body{background:#f4f1eb;color:#151412}
main{max-width:1440px}
.eyebrow{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8f897f}
.cover{position:relative;min-height:100vh;display:flex;background:#151412;color:#f4f1eb}
.cover-photo{position:absolute;inset:0}
.cover::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom,rgba(21,20,18,.5),rgba(21,20,18,0) 22%,rgba(21,20,18,0) 40%,rgba(21,20,18,.82))}
.cover-text{position:relative;z-index:1;flex:1;pointer-events:none;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr;gap:24px;padding:clamp(24px,5vw,56px)}
.cover .store{grid-area:1/1;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:28px;letter-spacing:0;text-transform:none;color:inherit}
.cover .count{grid-area:1/2;align-self:center;color:inherit}
.cover-title{grid-area:2/1/3/3;align-self:end;display:flex;flex-direction:column;gap:18px}
.cover h1{font-size:clamp(64px,11vw,168px);line-height:.88;letter-spacing:-.025em;text-wrap:balance}
.cover p{margin:0;font-size:17px;line-height:1.45;color:#e4ddd1;max-width:480px}
.plain-head h1{font-size:clamp(56px,9vw,128px);line-height:.9;letter-spacing:-.025em}
.plain-head p,.colours,.empty{color:#5f5a52}
.grid{grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr));gap:72px 24px}
.caption{display:grid;grid-template-columns:40px minmax(0,1fr);gap:6px 0;align-items:baseline}
.no{grid-area:1/1;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:22px;color:#8f897f}
.row,.colours{grid-column:2}
h3{font-size:32px;line-height:1.05}
.price{font-size:15px;font-weight:500}
.colours{gap:0}
.colours i{display:none}
.colours span+span::before{content:"·";margin:0 7px}
footer{border-top:1px solid #dcd6cb;color:#8f897f;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
`,
  Boutique: `
body{background:#f6ebe3;color:#3b2320}
.eyebrow{font-size:12px;font-weight:500;letter-spacing:.3em;text-transform:uppercase}
.cover{display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(24px,4vw,40px);padding:clamp(28px,5vw,56px) 20px;background:#b4553d;color:#fbf1e8}
.cover-text{display:contents}
.cover .store{order:0}
.cover-photo{order:1;width:min(440px,78vw);aspect-ratio:3/4;border-radius:999px 999px 0 0}
.cover-title{order:2;display:flex;flex-direction:column;align-items:center;gap:14px}
.cover h1{font-style:italic;font-size:clamp(52px,7vw,96px);line-height:.95;text-wrap:balance}
.cover p{margin:0;font-size:16px;line-height:1.45;color:#f2d6c8;max-width:520px}
.cover .count{order:3;font-family:'Geist Mono',monospace;font-size:11px;font-weight:400;letter-spacing:.14em;color:#f2d6c8}
.plain-head{align-items:center;text-align:center}
.plain-head .eyebrow{color:#b4553d}
.plain-head h1{font-style:italic;font-size:clamp(48px,7vw,88px);line-height:.95}
.plain-head p,.empty{color:#86655b}
.grid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px}
article{background:#fcf6f1;border-radius:18px;padding:14px 14px 22px;text-align:center}
.photo{border-radius:999px 999px 0 0}
.caption{align-items:center;gap:6px}
.no{display:none}
.row{flex-direction:column;align-items:center;gap:4px}
h3{font-size:24px;line-height:1.1}
.price{font-size:14px;font-weight:500;letter-spacing:.04em;color:#b4553d}
.colours{justify-content:center;gap:6px;margin-top:4px}
.colours i{width:10px;height:10px}
.colours b{display:none}
footer{border-top:1px solid #e7d3c7;justify-content:center;column-gap:10px;color:#a88a80;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
footer span+span::before{content:"·";margin-right:10px}
`,
};

/** The page's HTML, ready for an iframe's `srcdoc` or a download. */
export function catalogueHtml({ catalogue, items, storeName, photos }: HtmlInput) {
  const store = escape(storeName);
  const title = escape(catalogue.title || catalogue.name || "Catalogue");
  const subtitle = escape(catalogue.subtitle);
  const pieces = `${items.length} ${items.length === 1 ? "piece" : "pieces"}`;
  const coverBg = photos?.cover ?? photoCss(coverRef(catalogue, items));

  const cards = items
    .map((item, i) => {
      const price = catalogue.showPrices && item.price ? `<span class="price">${escape(item.price)}</span>` : "";
      const colours =
        catalogue.showColours && item.colours.length
          ? `<div class="colours">${item.colours
              .map((c) => `<span title="${escape(c.name)}"><i style="background:${escape(c.hex)}"></i><b>${escape(c.name)}</b></span>`)
              .join("")}</div>`
          : "";
      return `<article>
  ${photoHtml("photo", photos?.items[i] ?? photoCss(item.cover), item.name, item.cover.link)}
  <div class="caption">
    <span class="no">${String(i + 1).padStart(2, "0")}</span>
    <div class="row"><h3>${escape(item.name)}</h3>${price}</div>
    ${colours}
  </div>
</article>`;
    })
    .join("\n");

  const head = catalogue.cover
    ? `<section class="cover">
  <div class="cover-text">
    <div class="eyebrow store">${store}</div>
    <div class="cover-title"><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
    <div class="eyebrow count">${pieces}</div>
  </div>
  ${photoHtml("cover-photo", coverBg, "", coverRef(catalogue, items).link)}
</section>`
    : "";
  const plainHead = catalogue.cover
    ? ""
    : `<header class="plain-head"><div class="eyebrow">${store}</div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</header>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${store}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>${BASE_CSS}${THEME_CSS[catalogue.theme] ?? THEME_CSS.Classic}</style>
</head>
<body>
${head}
<main>
${plainHead}
<div class="grid">
${cards}
</div>
${items.length ? "" : `<p class="empty">No products in this catalogue yet.</p>`}
<footer><span>${store}</span><span>${escape(catalogueFooter(catalogue, storeName))}</span></footer>
</main>
</body>
</html>
`;
}

/** The page to download and share, with every photo embedded. Browser-only. */
export async function buildCatalogueHtml({ catalogue, items, storeName }: Omit<HtmlInput, "photos">) {
  try {
    // Stripes and backdrop tones stay CSS (the same width as in the PDF) rather than
    // being baked into the image, where they'd scale with it.
    const embed = async (ref: PhotoRef, width: number, height: number) => {
      if (!ref.imageUrl) return photoCss(ref);
      const url = await renderPhotoDataUrl({ ...ref, backdrop: undefined }, { width, height });
      return photoCss({ ...ref, imageUrl: url });
    };
    const photoItems = await mapLimit(items, 4, (item) => embed(item.cover, 640, 800));
    const cover = catalogue.cover ? await embed(coverRef(catalogue, items), 1200, 1400) : "";
    return catalogueHtml({ catalogue, items, storeName, photos: { cover, items: photoItems } });
  } finally {
    releasePhotos();
  }
}
