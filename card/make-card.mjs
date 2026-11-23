// Builds card/stats.svg: a year of contributions as a graph plus most-used languages,
// styled like gaknippel.com's home page (white, black frame, Mavora header, Geist, smileys).
// Run: GITHUB_TOKEN=... node card/make-card.mjs   (the GitHub Action does this daily)
import { readFileSync, writeFileSync } from 'node:fs';

const USER = 'gaknippel';
const dir = new URL('./', import.meta.url);
const b64 = (f) => readFileSync(new URL(f, dir)).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is not set');

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query($login: String!) { user(login: $login) {
      contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } }
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
        nodes { languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
      } } }`,
    variables: { login: USER },
  }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
const user = json.data.user;

// --- data ---
const cal = user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks.map((w) => ({
  date: w.contributionDays[0].date,
  count: w.contributionDays.reduce((n, d) => n + d.contributionCount, 0),
}));

const bytes = {};
for (const repo of user.repositories.nodes)
  for (const e of repo.languages.edges) bytes[e.node.name] = (bytes[e.node.name] ?? 0) + e.size;
const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(bytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, size]) => ({ name, pct: (size / totalBytes) * 100 }));

// --- layout ---
const W = 900, H = 640;
const G = { x: 48, y: 190, w: 804, h: 150 }; // graph box
const max = Math.max(1, ...weeks.map((w) => w.count));
const px = (i) => G.x + (i / Math.max(1, weeks.length - 1)) * G.w;
const py = (c) => G.y + G.h - (c / max) * G.h;
const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(w.count).toFixed(1)}`).join(' ');
const area = `${line} L${px(weeks.length - 1).toFixed(1)} ${G.y + G.h} L${G.x} ${G.y + G.h} Z`;
const peak = weeks.reduce((best, w, i) => (w.count > weeks[best].count ? i : best), 0);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthLabels = weeks
  .map((w, i) => ({ i, m: +w.date.slice(5, 7) - 1, prev: i ? +weeks[i - 1].date.slice(5, 7) - 1 : -1 }))
  .filter(({ i, m, prev }) => m !== prev && i > 1 && i < weeks.length - 2)
  .map(({ i, m }) => `<text x="${px(i).toFixed(1)}" y="${G.y + G.h + 28}" class="small" text-anchor="middle">${MONTHS[m]}</text>`)
  .join('');

const FACES = ['grin', 'tongue', 'smug', 'happy', 'cat', 'dizzy'];
const face = (name, x, y, size, delay) =>
  `<g transform="translate(${x} ${y})"><image class="pop" style="animation-delay:${delay}s" href="data:image/png;base64,${b64(`face-${name}.png`)}" width="${size}" height="${size}"/></g>`;

const rows = langs
  .map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 48 + col * 420, y = 450 + row * 58;
    const barW = 260;
    return `
  ${face(FACES[i], x, y - 4, 46, 0.3 + i * (2 / 12))}
  <text x="${x + 60}" y="${y + 14}" class="lang">${esc(l.name)}</text>
  <text x="${x + 60 + barW}" y="${y + 14}" class="small" text-anchor="end">${l.pct.toFixed(1)}%</text>
  <rect x="${x + 60}" y="${y + 24}" width="${barW}" height="10" fill="#e5e5e5"/>
  <rect x="${x + 60}" y="${y + 24}" width="${Math.max(2, (l.pct / langs[0].pct) * barW).toFixed(1)}" height="10" fill="#000"/>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${USER}'s GitHub activity and most used languages">
<style>
  @font-face { font-family: Mavora; src: url(data:font/woff2;base64,${b64('mavora.woff2')}) format('woff2'); }
  @font-face { font-family: Geist; font-weight: 100 900; src: url(data:font/woff2;base64,${b64('geist.woff2')}) format('woff2'); }
  text { font-family: Geist, sans-serif; fill: #000; }
  .head { font-family: Mavora, sans-serif; fill: #fff; font-size: 72px; }
  .sub { font-family: Mavora, sans-serif; font-size: 22px; }
  .big { font-size: 22px; font-weight: 600; }
  .lang { font-size: 20px; font-weight: 600; }
  .small { font-size: 15px; fill: #737373; }
  /* The home page's smiley pop: shoots up thin, lands flat, rebounds. 12fps, each pose held. */
  @keyframes pop {
    0% { transform: scale(0, 0); }
    11.1% { transform: translateY(-8%) scale(0.35, 1.55) rotate(4deg); }
    22.2% { transform: translateY(-34%) scale(0.75, 1.3) rotate(-10deg); }
    33.3% { transform: translateY(-38%) scale(1.05, 0.95) rotate(-6deg); }
    44.4% { transform: translateY(0) scale(1.4, 0.6) rotate(5deg); }
    55.5% { transform: translateY(-14%) scale(0.82, 1.22) rotate(-4deg); }
    66.6% { transform: translateY(0) scale(1.14, 0.86) rotate(2deg); }
    77.7% { transform: translateY(-3%) scale(0.96, 1.05) rotate(-1deg); }
    88.8%, 100% { transform: none; }
  }
  .pop { animation: pop 0.75s steps(1, end) both; transform-box: fill-box; transform-origin: 50% 100%; }
  @media (prefers-reduced-motion: reduce) { .pop { animation: none; } }
</style>
<rect width="${W}" height="${H}" fill="#fff"/>
<rect width="${W}" height="96" fill="#000"/>
<text x="34" y="74" class="head" textLength="${W - 68}" lengthAdjust="spacingAndGlyphs">ACTIVITY</text>

<text x="48" y="132" class="big">${cal.totalContributions.toLocaleString('en-US')} contributions in the last year</text>
<path d="${area}" fill="#000" fill-opacity="0.07"/>
<path d="${line}" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<line x1="${G.x}" y1="${G.y + G.h}" x2="${G.x + G.w}" y2="${G.y + G.h}" stroke="#000" stroke-width="2"/>
${monthLabels}
${face('grin', (px(peak) - 22).toFixed(1), (py(weeks[peak].count) - 48).toFixed(1), 44, 0.1)}

<text x="48" y="420" class="sub">MOST USED LANGUAGES</text>
${rows}

<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="#000" stroke-width="16"/>
</svg>
`;

writeFileSync(new URL('stats.svg', dir), svg);
console.log(`wrote card/stats.svg (${(svg.length / 1024).toFixed(0)} KB): ${cal.totalContributions} contributions, ${langs.map((l) => l.name).join(', ')}`);
