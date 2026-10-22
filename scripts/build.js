#!/usr/bin/env node
// Generador estático de Blog Web3. Sin dependencias externas a propósito:
// lee content/posts/*.md y escribe index.html, articulos/*.html, sitemap.xml,
// rss.xml, llms.txt y robots.txt. Se corre a mano (`node scripts/build.js`)
// antes de cada commit; nada de esto se ejecuta como build step en Vercel.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const SITE_URL = "https://www.blogweb3.com";
const SITE_NAME = "Blog Web3";
const SITE_DESC = "Noticias y análisis sobre Web3, activos digitales, blockchain y tokenización en México y Latinoamérica.";

const AI_AND_SEARCH_BOTS = [
  "Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot", "Applebot-Extended", "CCBot", "Amazonbot",
  "cohere-ai", "DuckDuckBot",
];

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Post sin frontmatter válido");
  const [, fm, body] = match;
  const meta = {};
  for (const line of fm.split("\n")) {
    if (!line.trim()) continue;
    const i = line.indexOf(":");
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    meta[key] = value;
  }
  meta.tags = (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  return { meta, body: body.trim() };
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Markdown -> HTML minimalista: encabezados, párrafos, listas, negritas, enlaces, citas.
function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let inList = false;

  function inline(text) {
    text = escapeHtml(text);
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
      const external = /^https?:\/\//.test(url) && !url.includes("blogweb3.com");
      const attrs = external ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${url}"${attrs}>${label}</a>`;
    });
    return text;
  }

  function closeList() {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { closeList(); i++; continue; }
    if (line.startsWith("### ")) { closeList(); out.push(`<h3>${inline(line.slice(4))}</h3>`); i++; continue; }
    if (line.startsWith("## ")) { closeList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); i++; continue; }
    if (line.startsWith("# ")) { closeList(); out.push(`<h1>${inline(line.slice(2))}</h1>`); i++; continue; }
    if (line.startsWith("> ")) { closeList(); out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`); i++; continue; }
    if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      i++; continue;
    }
    closeList();
    // párrafo: junta líneas seguidas hasta línea en blanco
    let para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|>|- )/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  closeList();
  return out.join("\n    ");
}

function loadPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((f) => {
    const slug = f.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    return {
      slug,
      title: meta.title,
      date: meta.date,
      excerpt: meta.excerpt,
      tags: meta.tags,
      bodyHtml: mdToHtml(body),
      url: `${SITE_URL}/articulos/${slug}.html`,
    };
  });
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}

function pageShell({ title, description, bodyHtml, canonical, jsonLd }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="${SITE_URL}/rss.xml" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>" />
  <link rel="stylesheet" href="${canonical.includes("/articulos/") ? "../styles.css" : "styles.css"}" />
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function header(isArticle) {
  const prefix = isArticle ? "../" : "";
  return `  <header class="site-header">
    <div class="container header-inner">
      <a class="logo" href="${prefix}index.html">Blog<span>Web3</span></a>
      <nav>
        <a href="${prefix}index.html#articulos">Noticias</a>
        <a href="${prefix}index.html#sobre">Sobre el blog</a>
        <a href="${prefix}index.html#contacto">Contacto</a>
      </nav>
    </div>
  </header>`;
}

function footer() {
  return `  <footer id="contacto" class="site-footer">
    <div class="container footer-inner">
      <div>
        <strong>Contacto</strong>
        <p>Email: <a href="mailto:felipe@binkio.com">felipe@binkio.com</a></p>
        <p>Web: <a href="https://www.binkio.com" target="_blank" rel="noopener">www.binkio.com</a></p>
        <p>WhatsApp: <a href="https://wa.me/523223481432" target="_blank" rel="noopener">+52 322 348 1432</a></p>
      </div>
      <div>
        <p>Más información institucional en <a href="https://criptorealestate.io/" target="_blank" rel="noopener">criptorealestate.io</a></p>
        <p class="copyright">© <span id="year"></span> Blog Web3. Todos los derechos reservados.</p>
      </div>
    </div>
  </footer>
  <script>document.getElementById('year').textContent = new Date().getFullYear();</script>`;
}

function buildIndex(posts) {
  const cards = posts.map((p) => `        <article class="card">
          <span class="tag">${escapeHtml(p.tags[0] || "Web3")}</span>
          <h3><a href="articulos/${p.slug}.html">${escapeHtml(p.title)}</a></h3>
          <p>${escapeHtml(p.excerpt)}</p>
          <a class="read-more" href="articulos/${p.slug}.html">Leer artículo →</a>
        </article>`).join("\n\n");

  const body = `${header(false)}

  <section class="hero">
    <div class="container">
      <h1>Web3, activos digitales y tokenización — al día</h1>
      <p>Noticias, análisis y cobertura de eventos sobre blockchain, activos digitales y tokenización en México y Latinoamérica.</p>
    </div>
  </section>

  <main class="container">
    <section id="articulos">
      <h2>Últimos artículos</h2>
      <div class="grid">
${cards}
      </div>
    </section>

    <section id="sobre" class="about">
      <h2>Sobre este blog</h2>
      <p>
        Cobertura informativa sobre Web3, activos digitales, blockchain y tokenización —
        regulación, eventos y casos en México y Latinoamérica, sin tecnicismos innecesarios.
      </p>
    </section>
  </main>

${footer()}`;

  return pageShell({
    title: `${SITE_NAME} · Noticias de Web3, activos digitales y tokenización`,
    description: SITE_DESC,
    bodyHtml: body,
    canonical: `${SITE_URL}/`,
  });
}

function buildPost(post) {
  const body = `${header(true)}

  <article class="article">
    <a class="back" href="../index.html">← Volver a artículos</a>
    <span class="tag">${escapeHtml(post.tags[0] || "Web3")}</span>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="meta">${post.date}</p>

    ${post.bodyHtml}
  </article>

${footer()}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    url: post.url,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return pageShell({
    title: `${post.title} · ${SITE_NAME}`,
    description: post.excerpt,
    bodyHtml: body,
    canonical: post.url,
    jsonLd,
  });
}

function buildSitemap(posts) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0" },
    ...posts.map((p) => ({ loc: p.url, priority: "0.8" })),
  ];
  const entries = urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function buildRobots() {
  const uas = AI_AND_SEARCH_BOTS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join("\n");
  return `${uas}\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

function buildLlms(posts) {
  const recent = posts.slice(0, 20).map((p) => `- [${p.title}](${p.url}) (${p.date}): ${p.excerpt}`).join("\n");
  return `# ${SITE_NAME}

> ${SITE_DESC}

Blog Web3 (blogweb3.com) cubre noticias, análisis y eventos sobre blockchain, activos digitales y tokenización en México y Latinoamérica. Opera de forma informativa e independiente; no es un canal de venta.

Contacto: felipe@binkio.com · www.binkio.com

## Artículos recientes

${recent}
`;
}

function buildRss(posts) {
  const items = posts.slice(0, 30).map((p) => `  <item>
    <title>${escapeHtml(p.title)}</title>
    <link>${p.url}</link>
    <guid>${p.url}</guid>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <description>${escapeHtml(p.excerpt)}</description>
  </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${SITE_NAME}</title>
  <link>${SITE_URL}/</link>
  <description>${escapeHtml(SITE_DESC)}</description>
  <language>es-MX</language>
${items}
</channel>
</rss>
`;
}

function main() {
  const posts = loadPosts();

  fs.mkdirSync(path.join(ROOT, "articulos"), { recursive: true });
  for (const post of posts) {
    fs.writeFileSync(path.join(ROOT, "articulos", `${post.slug}.html`), buildPost(post));
  }

  fs.writeFileSync(path.join(ROOT, "index.html"), buildIndex(posts));
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), buildSitemap(posts));
  fs.writeFileSync(path.join(ROOT, "robots.txt"), buildRobots());
  fs.writeFileSync(path.join(ROOT, "llms.txt"), buildLlms(posts));
  fs.writeFileSync(path.join(ROOT, "rss.xml"), buildRss(posts));

  console.log(`Build OK: ${posts.length} posts.`);
}

main();
