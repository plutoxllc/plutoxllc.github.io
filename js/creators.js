/* ============ NexLaunch — Creator Outreach ============
   Demo module. Real integrations plug in here:
   - Creator discovery: TikTok Creator Marketplace API / Kalodata-style feed
     → replace CREATORS
   - DM drafts + UGC briefs: POST to your Claude proxy (same pattern as the
     AI Listing Builder note in app.js) → replace draftDM() / draftBrief()
   Pipeline entries are REAL user data (localStorage.nexlaunch_creators);
   only the creator directory below is demo. */

/* ---------------- demo creator directory ---------------- */
const CREATORS = [
  { handle: "@kayla.unboxes", name: "Kayla M.", category: "Beauty", followers: 84200, er: 7.8, avgViews: 96000, sellsLive: true },
  { handle: "@dormroomfinds", name: "Priya S.", category: "Home & Kitchen", followers: 41200, er: 9.1, avgViews: 58000, sellsLive: false },
  { handle: "@techtoktavi", name: "Tavi R.", category: "Electronics", followers: 128000, er: 5.2, avgViews: 112000, sellsLive: false },
  { handle: "@cleantokjess", name: "Jess W.", category: "Home & Kitchen", followers: 215000, er: 6.4, avgViews: 240000, sellsLive: true },
  { handle: "@petdadmike", name: "Mike D.", category: "Pet Supplies", followers: 56800, er: 8.9, avgViews: 71000, sellsLive: false },
  { handle: "@glowwithnina", name: "Nina K.", category: "Beauty", followers: 312000, er: 4.8, avgViews: 205000, sellsLive: true },
  { handle: "@gymratghost", name: "Andre B.", category: "Sports & Outdoors", followers: 97400, er: 6.9, avgViews: 88000, sellsLive: false },
  { handle: "@kitchenwitchkat", name: "Kat L.", category: "Home & Kitchen", followers: 68900, er: 10.2, avgViews: 94000, sellsLive: true },
  { handle: "@budgetbeautybri", name: "Bri T.", category: "Beauty", followers: 23400, er: 11.6, avgViews: 39000, sellsLive: false },
  { handle: "@deskgoblin", name: "Sam O.", category: "Office Products", followers: 47700, er: 7.3, avgViews: 52000, sellsLive: false },
  { handle: "@midnightgamer.gg", name: "Leo V.", category: "Electronics", followers: 183000, er: 5.9, avgViews: 160000, sellsLive: false },
  { handle: "@thecatladyclub", name: "Rosa E.", category: "Pet Supplies", followers: 132000, er: 7.1, avgViews: 118000, sellsLive: true },
  { handle: "@sunrisewithsara", name: "Sara H.", category: "Home & Kitchen", followers: 29800, er: 12.4, avgViews: 44000, sellsLive: false },
  { handle: "@matchamornings", name: "Yui N.", category: "Grocery", followers: 51200, er: 9.7, avgViews: 63000, sellsLive: false }
];

const CR_STAGES = ["Contacted", "Replied", "Sample Sent", "Posted", "Converting"];

/* ---------------- pipeline persistence ---------------- */
function crLoad() { return JSON.parse(localStorage.getItem("nexlaunch_creators") || "[]"); }
function crSave(rows) { localStorage.setItem("nexlaunch_creators", JSON.stringify(rows)); }

/* ---------------- commission math ----------------
   Margin guardrail: on TikTok Shop the seller keeps
   price − product cost − ~8% platform fee − creator commission − ~$2.20 ship.
   Uses the same tiktokFees() engine as the rest of the app. */
function crUnitEcon(product, commissionPct) {
  const fees = tiktokFees(product.price, commissionPct / 100);
  const net = product.price - fees.total - product.cost - 2.2;
  return { fees, net, margin: net / product.price };
}
/* Highest whole-% commission that still clears $1 + 10% margin per unit. */
function crMaxCommission(product) {
  for (let c = 40; c >= 0; c--) {
    const { net, margin } = crUnitEcon(product, c);
    if (net >= 1 && margin >= 0.10) return c;
  }
  return 0;
}

/* ---------------- creator finder ---------------- */
function crMatchScore(c) {
  // Demo heuristic: engagement counts 2x follower scale (log). Mirrors the
  // webinar-era wisdom that mid-tier creators convert best.
  return Math.round(c.er * 6 + Math.log10(c.followers) * 8 + (c.sellsLive ? 8 : 0));
}

function renderCreators() {
  const cat = document.getElementById("cr-category").value;
  const size = document.getElementById("cr-size").value;
  const q = document.getElementById("cr-search").value.trim().toLowerCase();
  const inPipe = new Set(crLoad().map(r => r.handle));

  const rows = CREATORS
    .filter(c => (cat === "all" || c.category === cat)
      && (size === "all"
        || (size === "nano" && c.followers < 50000)
        || (size === "mid" && c.followers >= 50000 && c.followers < 150000)
        || (size === "macro" && c.followers >= 150000))
      && (!q || c.handle.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)))
    .sort((a, b) => crMatchScore(b) - crMatchScore(a));

  document.getElementById("cr-grid").innerHTML = rows.map(c => `
    <div class="cr-card">
      <div class="head">
        <span class="thumb">${c.name.trim()[0]}</span>
        <div><h3>${c.handle}</h3><div class="cat">${c.name} · ${c.category}${c.sellsLive ? " · 🔴 sells live" : ""}</div></div>
        <span class="heat ${c.er >= 9 ? "hot" : c.er >= 6.5 ? "warm" : "cool"}">${c.er.toFixed(1)}% ER</span>
      </div>
      <div class="tt-stats">
        <div class="tt-stat"><div class="l">Followers</div><div class="v">${fmtNum(c.followers)}</div></div>
        <div class="tt-stat"><div class="l">Avg Views</div><div class="v pink">${fmtNum(c.avgViews)}</div></div>
      </div>
      <div class="cr-actions">
        <button class="btn btn-primary btn-sm" data-dm="${c.handle}">✉️ Draft DM</button>
        <button class="btn btn-ghost btn-sm" data-pipe="${c.handle}" ${inPipe.has(c.handle) ? "disabled" : ""}>${inPipe.has(c.handle) ? "✔ In pipeline" : "＋ Pipeline"}</button>
      </div>
    </div>`).join("");
  document.getElementById("cr-count").textContent =
    rows.length + " of " + CREATORS.length + " creators shown · demo directory";

  document.querySelectorAll("[data-dm]").forEach(b => b.addEventListener("click", () => {
    document.getElementById("cr-pick-creator").value = b.dataset.dm;
    crGenerate();
    document.getElementById("cr-kit-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelectorAll("[data-pipe]").forEach(b => b.addEventListener("click", () => {
    crAddToPipeline(b.dataset.pipe);
  }));
}

/* ---------------- outreach kit (DM + brief) ---------------- */
function crSelectedProduct() {
  const id = document.getElementById("cr-pick-product").value;
  return TT_PRODUCTS.find(p => p.id === id) || TT_PRODUCTS[0];
}

function draftDM(creator, product, commissionPct) {
  const first = creator.name.split(" ")[0];
  const niche = creator.category.toLowerCase();
  return `Hey ${first}! Love your ${niche} videos — the recent ones have been getting serious traction 👏

I sell the ${product.name} (${fmtUSD(product.price, 2)} on TikTok Shop) and I think it'd land perfectly with your audience.

Offer: ${commissionPct}% commission on every sale through your videos, plus a free sample shipped this week — zero cost to you, post only if you like it.

Want me to send one over? Happy to do a quick call too if easier.`;
}

function draftBrief(creator, product) {
  const n = product.name;
  return `UGC BRIEF — ${n} × ${creator.handle}

HOOKS (pick one, first 2 seconds):
1. "I was today years old when I found out a ${n.toLowerCase()} could do this…"
2. POV shot: problem moment first, product reveal at second 3.
3. "Things TikTok made me buy that actually work, part 3:"

SHOT LIST:
• 0-2s hook (face + product in frame)
• 2-10s product in real use — one clear benefit, no spec talk
• 10-18s reaction / result close-up
• 18-25s CTA: "it's linked in my showcase" + price mention

RULES: natural lighting, no logos of other brands in frame, caption
mentions #tiktokshopfinds, link product via TikTok Shop affiliate so
commission tracks automatically.`;
}

function crGenerate() {
  const creator = CREATORS.find(c => c.handle === document.getElementById("cr-pick-creator").value) || CREATORS[0];
  const product = crSelectedProduct();
  const commission = parseInt(document.getElementById("cr-commission").value, 10) || 15;

  const { fees, net, margin } = crUnitEcon(product, commission);
  const maxC = crMaxCommission(product);
  const ok = commission <= maxC && net > 0;

  document.getElementById("cr-econ").innerHTML = `
    <div class="grid-4">
      <div class="kpi"><div class="k-label">Sale Price</div><div class="k-value">${fmtUSD(product.price, 2)}</div><div class="k-delta" style="color:var(--muted)">${product.name.slice(0, 24)}…</div></div>
      <div class="kpi"><div class="k-label">Creator Cut (${commission}%)</div><div class="k-value pink">${fmtUSD(fees.affiliate, 2)}</div><div class="k-delta" style="color:var(--muted)">per sale</div></div>
      <div class="kpi"><div class="k-label">Your Net / Unit</div><div class="k-value" style="color:${net > 0 ? "var(--green)" : "var(--red)"}">${fmtUSD(net, 2)}</div><div class="k-delta" style="color:var(--muted)">${Math.round(margin * 100)}% margin</div></div>
      <div class="kpi"><div class="k-label">Max Commission</div><div class="k-value">${maxC}%</div><div class="k-delta" style="color:var(--muted)">keeps $1 + 10% margin</div></div>
    </div>
    <div style="margin-top:14px">${ok
      ? `<span class="verdict good">✅ Commission is affordable — net ${fmtUSD(net, 2)}/unit after creator cut</span>`
      : `<span class="verdict bad">❌ Too generous — at ${commission}% you net ${fmtUSD(net, 2)}/unit. Cap it at ${maxC}%.</span>`}</div>`;

  document.getElementById("cr-dm-out").textContent = draftDM(creator, product, commission);
  document.getElementById("cr-brief-out").textContent = draftBrief(creator, product);
  document.getElementById("cr-kit-out").classList.add("show");
}

function crCopy(btn, srcId) {
  navigator.clipboard.writeText(document.getElementById(srcId).textContent).then(() => {
    const prev = btn.textContent;
    btn.textContent = "✅ Copied";
    setTimeout(() => (btn.textContent = prev), 1500);
  });
}

/* ---------------- pipeline tracker ---------------- */
function crAddToPipeline(handle) {
  const rows = crLoad();
  if (rows.some(r => r.handle === handle)) return;
  const product = crSelectedProduct();
  const commission = parseInt(document.getElementById("cr-commission").value, 10) || 15;
  rows.push({ handle, product: product.name, commission, stage: 0, addedAt: new Date().toISOString() });
  crSave(rows);
  renderPipeline();
  renderCreators(); // refresh "In pipeline" button states
}

function renderPipeline() {
  const rows = crLoad();
  const list = document.getElementById("cr-pipe-list");
  const posted = rows.filter(r => r.stage >= 3).length;
  document.getElementById("cr-pipe-count").textContent = rows.length
    ? `${rows.length} creator${rows.length === 1 ? "" : "s"} in pipeline · ${posted} posted`
    : "Empty — add creators from the directory above.";
  list.innerHTML = rows.map((r, i) => `
    <div class="auto-rule">
      <span class="cr-stage s${r.stage}">${CR_STAGES[r.stage]}</span>
      <div class="desc">
        <div><strong>${r.handle}</strong> · ${r.product}</div>
        <div class="then">${r.commission}% commission · added ${new Date(r.addedAt).toLocaleDateString()}</div>
      </div>
      <button class="cr-move" data-back="${i}" ${r.stage === 0 ? "disabled" : ""} title="Back a stage">←</button>
      <button class="cr-move" data-fwd="${i}" ${r.stage === CR_STAGES.length - 1 ? "disabled" : ""} title="Advance stage">→</button>
      <button class="kill" data-drop="${i}" title="Remove">🗑</button>
    </div>`).join("");
  list.querySelectorAll("[data-fwd]").forEach(b => b.addEventListener("click", () => {
    const rows = crLoad(); rows[b.dataset.fwd].stage++; crSave(rows); renderPipeline();
  }));
  list.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => {
    const rows = crLoad(); rows[b.dataset.back].stage--; crSave(rows); renderPipeline();
  }));
  list.querySelectorAll("[data-drop]").forEach(b => b.addEventListener("click", () => {
    const rows = crLoad(); rows.splice(b.dataset.drop, 1); crSave(rows); renderPipeline(); renderCreators();
  }));
}

/* ---------------- init ---------------- */
(function initCreators() {
  const catSel = document.getElementById("cr-category");
  [...new Set(CREATORS.map(c => c.category))].sort().forEach(c => {
    const o = document.createElement("option"); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  const creatorSel = document.getElementById("cr-pick-creator");
  CREATORS.forEach(c => {
    const o = document.createElement("option"); o.value = c.handle;
    o.textContent = `${c.handle} (${c.category}, ${fmtNum(c.followers)})`;
    creatorSel.appendChild(o);
  });
  const prodSel = document.getElementById("cr-pick-product");
  TT_PRODUCTS.forEach(p => {
    const o = document.createElement("option"); o.value = p.id;
    o.textContent = `${p.emoji} ${p.name} — ${fmtUSD(p.price, 2)}`;
    prodSel.appendChild(o);
  });

  ["cr-category", "cr-size", "cr-search"].forEach(id =>
    document.getElementById(id).addEventListener("input", renderCreators));
  document.getElementById("cr-generate").addEventListener("click", crGenerate);
  document.getElementById("cr-copy-dm").addEventListener("click", e => crCopy(e.target, "cr-dm-out"));
  document.getElementById("cr-copy-brief").addEventListener("click", e => crCopy(e.target, "cr-brief-out"));

  renderCreators();
  renderPipeline();
})();

VIEW_TITLES.creators = "Creator Outreach";
