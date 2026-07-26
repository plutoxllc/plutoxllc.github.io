/* ============ NexLaunch — demo dataset + estimation engine ============
   All data below is DEMO data. Real integrations plug in here:
   - Amazon: Keepa / SP-API / Apify scraper  → replace AMZ_PRODUCTS + xrayLookup()
   - TikTok Shop: Kalodata-style API / Apify → replace TT_PRODUCTS
   - AI listings: POST to your Claude proxy  → see generateListing() in app.js
*/

// Category coefficients for BSR → monthly sales power-law model: sales = a * bsr^(-b)
const BSR_MODEL = {
  "Electronics":        { a: 96000, b: 0.55 },
  "Home & Kitchen":     { a: 132000, b: 0.52 },
  "Sports & Outdoors":  { a: 78000, b: 0.55 },
  "Beauty":             { a: 118000, b: 0.53 },
  "Grocery":            { a: 105000, b: 0.52 },
  "Toys & Games":       { a: 88000, b: 0.54 },
  "Pet Supplies":       { a: 72000, b: 0.54 },
  "Office Products":    { a: 61000, b: 0.56 },
  "default":            { a: 90000, b: 0.54 }
};

function estimateSalesFromBSR(bsr, category) {
  const m = BSR_MODEL[category] || BSR_MODEL.default;
  return Math.max(1, Math.round(m.a * Math.pow(bsr, -m.b)));
}

// Amazon fee model (approximate 2026 rates)
function amazonFees(price, weightLb = 1) {
  const referral = price * 0.15;
  const fba = weightLb <= 1 ? 3.55 : weightLb <= 2 ? 4.35 : 5.9 + (weightLb - 3) * 0.35;
  return { referral, fba, total: referral + fba };
}

// TikTok Shop fee model
function tiktokFees(price, affiliatePct = 0.10) {
  const platform = price * 0.08;          // marketplace commission
  const affiliate = price * affiliatePct; // creator commission
  return { platform, affiliate, total: platform + affiliate };
}

const fmtUSD = (n, dec = 0) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtNum = (n) => Number(n).toLocaleString("en-US");

/* ---------------- Amazon demo products ---------------- */
const AMZ_PRODUCTS = [
  { asin: "B0CX1EARBD", emoji: "🎧", name: "Wireless Earbuds with Charging Case", category: "Electronics", sub: "Headphones", price: 29.99, bsr: 1247, reviews: 45892, rating: 4.4, cost: 6.8, weight: 0.5, trend: 12.4 },
  { asin: "B0CYOGAMAT", emoji: "🧘", name: "Premium Yoga Mat with Alignment Lines", category: "Sports & Outdoors", sub: "Yoga", price: 34.99, bsr: 3421, reviews: 12456, rating: 4.7, cost: 8.2, weight: 2.4, trend: 8.1 },
  { asin: "B0CBOTTLE1", emoji: "🥤", name: "Insulated Stainless Steel Water Bottle 32oz", category: "Home & Kitchen", sub: "Water Bottles", price: 24.95, bsr: 5892, reviews: 28934, rating: 4.5, cost: 5.1, weight: 1.1, trend: -3.2 },
  { asin: "B0CRINGLT9", emoji: "💡", name: "LED Ring Light with Tripod Stand 12\"", category: "Electronics", sub: "Lighting", price: 45.99, bsr: 8934, reviews: 8567, rating: 4.3, cost: 11.4, weight: 2.9, trend: 5.7 },
  { asin: "B0CMATCHA7", emoji: "🍵", name: "Organic Ceremonial Matcha Powder 100g", category: "Grocery", sub: "Tea", price: 19.99, bsr: 2156, reviews: 15678, rating: 4.6, cost: 4.3, weight: 0.3, trend: 18.9 },
  { asin: "B0CKEYBRGB", emoji: "⌨️", name: "Mechanical Gaming Keyboard RGB Hot-Swap", category: "Electronics", sub: "Keyboards", price: 69.99, bsr: 4521, reviews: 9834, rating: 4.4, cost: 19.5, weight: 2.2, trend: -1.8 },
  { asin: "B0CPETFOUN", emoji: "🐱", name: "Cat Water Fountain Stainless 84oz", category: "Pet Supplies", sub: "Cat Supplies", price: 32.99, bsr: 1893, reviews: 21440, rating: 4.5, cost: 7.9, weight: 1.8, trend: 9.3 },
  { asin: "B0CSUNRISE", emoji: "⏰", name: "Sunrise Alarm Clock Wake-Up Light", category: "Home & Kitchen", sub: "Clocks", price: 38.99, bsr: 2764, reviews: 17205, rating: 4.4, cost: 9.6, weight: 1.4, trend: 14.2 },
  { asin: "B0CDESKPAD", emoji: "🖥️", name: "Extended Leather Desk Pad 36x17", category: "Office Products", sub: "Desk Accessories", price: 21.99, bsr: 3310, reviews: 11876, rating: 4.6, cost: 4.9, weight: 1.6, trend: 3.5 },
  { asin: "B0CGUASHA1", emoji: "💆", name: "Ice Roller & Gua Sha Facial Set", category: "Beauty", sub: "Skin Care Tools", price: 16.99, bsr: 1544, reviews: 33012, rating: 4.3, cost: 2.7, weight: 0.6, trend: 22.6 },
  // Low-review "opportunity" listings — the weak-competition tier the research
  // table and launch screen exist to surface.
  { asin: "B0CWALLETM", emoji: "📱", name: "Magnetic Phone Wallet Stand MagSafe-Compatible", category: "Electronics", sub: "Phone Accessories", price: 21.99, bsr: 9800, reviews: 412, rating: 4.5, cost: 3.9, weight: 0.3, trend: 16.8 },
  { asin: "B0CDOGBEDX", emoji: "🐶", name: "Orthopedic Dog Bed Memory Foam XL", category: "Pet Supplies", sub: "Dog Beds", price: 54.99, bsr: 6120, reviews: 687, rating: 4.6, cost: 16.5, weight: 7.2, trend: 11.9 },
  { asin: "B0CWORKBRD", emoji: "💪", name: "At-Home Push-Up Workout Board Set", category: "Sports & Outdoors", sub: "Strength Training", price: 42.99, bsr: 7430, reviews: 523, rating: 4.4, cost: 11.2, weight: 5.5, trend: 7.6 },
  { asin: "B0CSHOWRST", emoji: "🚿", name: "Rainfall Shower Head High Pressure Chrome", category: "Home & Kitchen", sub: "Bath", price: 26.99, bsr: 8200, reviews: 894, rating: 4.3, cost: 6.1, weight: 1.9, trend: 5.2 }
];

/* ---------------- TikTok Shop demo products ---------------- */
const TT_PRODUCTS = [
  { id: "TT-7412", emoji: "🦷", name: "V34 Purple Teeth Whitening Serum", category: "Beauty", price: 14.99, views7d: 48200000, videos7d: 3120, creators: 812, commission: 0.20, unitsMo: 61400, trend: 41.2, cost: 2.1 },
  { id: "TT-8830", emoji: "🧴", name: "Heatless Curl Silk Ribbon Kit", category: "Beauty", price: 11.99, views7d: 22100000, videos7d: 1870, creators: 545, commission: 0.15, unitsMo: 38700, trend: 17.8, cost: 1.6 },
  { id: "TT-6651", emoji: "🍚", name: "Mini Rice Cooker with Steamer 2-Cup", category: "Home & Kitchen", price: 27.99, views7d: 9800000, videos7d: 640, creators: 203, commission: 0.12, unitsMo: 12900, trend: 9.4, cost: 8.8 },
  { id: "TT-9917", emoji: "🔦", name: "Stanley-Style Tumbler 40oz w/ Handle", category: "Home & Kitchen", price: 22.99, views7d: 31500000, videos7d: 2410, creators: 688, commission: 0.10, unitsMo: 45200, trend: -6.3, cost: 5.4 },
  { id: "TT-3384", emoji: "🐾", name: "Interactive Cat Chase Toy (Auto)", category: "Pet Supplies", price: 18.99, views7d: 15400000, videos7d: 1230, creators: 391, commission: 0.18, unitsMo: 22600, trend: 28.9, cost: 4.2 },
  { id: "TT-5520", emoji: "💪", name: "Grip Strength Trainer Counter", category: "Sports & Outdoors", price: 9.99, views7d: 12700000, videos7d: 980, creators: 276, commission: 0.15, unitsMo: 19800, trend: 12.1, cost: 1.3 },
  { id: "TT-2098", emoji: "✨", name: "Galaxy Star Projector Night Light", category: "Electronics", price: 25.99, views7d: 18900000, videos7d: 1440, creators: 462, commission: 0.14, unitsMo: 17300, trend: 6.7, cost: 6.9 },
  { id: "TT-7745", emoji: "🧹", name: "Electric Spin Scrubber Cordless", category: "Home & Kitchen", price: 39.99, views7d: 26800000, videos7d: 1990, creators: 573, commission: 0.16, unitsMo: 24100, trend: 33.5, cost: 12.2 },
  // Early-stage products with few creators attached — the uncrowded feed
  // the creator-outreach play works best on.
  { id: "TT-4410", emoji: "🚗", name: "Collapsible Car Trunk Organizer", category: "Home & Kitchen", price: 24.99, views7d: 3100000, videos7d: 210, creators: 64, commission: 0.15, unitsMo: 5200, trend: 21.4, cost: 6.7 },
  { id: "TT-1177", emoji: "👁️", name: "Magnetic Eyelash Kit No-Glue", category: "Beauty", price: 13.99, views7d: 2400000, videos7d: 180, creators: 88, commission: 0.18, unitsMo: 4100, trend: 15.2, cost: 2.4 }
];

/* Deterministic pseudo-random from a string — lets X-Ray produce stable
   estimates for arbitrary ASINs/URLs not in the demo set. */
function seededFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/* X-Ray lookup: known demo product by ASIN/name match, else deterministic synthesis */
function xrayLookup(query) {
  const q = query.trim();
  const asinMatch = q.toUpperCase().match(/B0[A-Z0-9]{8}/);
  const asin = asinMatch ? asinMatch[0] : null;

  let p = AMZ_PRODUCTS.find(x =>
    (asin && x.asin === asin) ||
    x.name.toLowerCase().includes(q.toLowerCase()) && q.length > 3
  );
  if (p) return { ...p, source: "demo" };

  const rnd = seededFrom(q.toLowerCase());
  const cats = Object.keys(BSR_MODEL).filter(c => c !== "default");
  const category = cats[Math.floor(rnd() * cats.length)];
  const price = Math.round((8 + rnd() * 62) * 100) / 100;
  return {
    asin: asin || "B0" + q.replace(/[^A-Z0-9]/gi, "").toUpperCase().padEnd(8, "X").slice(0, 8),
    emoji: "📦",
    name: asin ? "Amazon Product " + asin : q.slice(0, 60),
    category, sub: category,
    price,
    bsr: Math.floor(400 + rnd() * 19600),
    reviews: Math.floor(80 + rnd() * 42000),
    rating: Math.round((3.6 + rnd() * 1.3) * 10) / 10,
    cost: Math.round(price * (0.18 + rnd() * 0.14) * 100) / 100,
    weight: Math.round((0.3 + rnd() * 2.8) * 10) / 10,
    trend: Math.round((rnd() * 36 - 8) * 10) / 10,
    source: "synth"
  };
}
