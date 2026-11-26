// The token radar's model: radar-2 value model based entirely on snapshot figures.
// No protocol name is ever special-cased: the same function scores every row.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_breadth_max: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 1.2,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.6,
  maturity_days: 1460,
  unknown_age_days: 365,
  chain_breadth_max: 5,
};

export const MODEL_VERSION = 'radar-2';

export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist: string[];
  rows: RadarRow[];
  board: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Category multiples (base = TVL x category multiple):
 * - Dexs: 0.35 (high volume and fee capture)
 * - Lending: 0.30 (core DeFi utility and TVL stickiness)
 * - Risk Curators: 0.30 (curated yield and credit risk management)
 * - Derivatives: 0.30 (high leverage and margin turnover)
 * - Yield / Yield Aggregator: 0.28 (efficient capital routing)
 * - Onchain Capital Allocator: 0.28 (smart treasury and liquidity routing)
 * - Liquidity Manager: 0.25 (concentrated liquidity tooling)
 * - Leveraged Farming: 0.25 (yield optimization with leverage)
 * - RWA: 0.22 (real-world asset backing, regulatory friction)
 * - Basis Trading: 0.22 (neutral hedging and delta capture)
 * - CDP: 0.08 (low multiple: stablecoin/CDP token IS the product, no separate launch to value)
 * - Stablecoins: 0.08 (low multiple: stablecoin token IS the product)
 * - Any other category: 0.20
 * - Null category: 0.18
 */
export function getCategoryMultiple(category: string | null): number {
  if (category === null) return 0.18;
  const c = category.toLowerCase();
  if (c.includes('dex')) return 0.35;
  if (c.includes('lending')) return 0.30;
  if (c.includes('risk curator') || c.includes('curator')) return 0.30;
  if (c.includes('derivative') || c.includes('perpetual')) return 0.30;
  if (c.includes('yield') || c.includes('aggregator')) return 0.28;
  if (c.includes('capital allocator') || c.includes('allocator')) return 0.28;
  if (c.includes('liquidity manager')) return 0.25;
  if (c.includes('leveraged farming')) return 0.25;
  if (c.includes('rwa')) return 0.22;
  if (c.includes('basis trading')) return 0.22;
  if (c.includes('cdp')) return 0.08;
  if (c.includes('stablecoin')) return 0.08;
  return 0.20;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; baseMult: number; baseVal: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const baseMult = getCategoryMultiple(protocol.category);
  const baseVal = Math.round(protocol.tvl_usd * baseMult);
  
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;

  const chainCount = protocol.chains.length;
  const chainMult = 1 + Math.min(Math.max(chainCount - 1, 0), model.chain_breadth_max) * 0.03;

  const implied = Math.max(1, Math.round(baseVal * growthMult * maturityMult * chainMult));
  return { implied, baseMult, baseVal, growthPct, growthMult, maturityMult, chainMult, age };
}

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const WHOLE_WORD_REGEX = /\b(wrapped|staked|staking)\b/i;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WHOLE_WORD_REGEX.test(p.name)) return false;
  for (const ex of EXCHANGES) {
    if (p.name.toLowerCase().startsWith(ex.toLowerCase())) return false;
  }
  if (VERSIONED.test(p.name)) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const res = impliedValue(p, snapshot.as_of, model);
    return { p, ...res };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.baseMult,
      base_value_usd: s.baseVal,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function gasDescription(chain: string): { step1: string; step2: string; weekly: string } {
  const c = chain.toLowerCase();
  if (c.includes('solana') || c.includes('sol')) {
    return { step1: 'about $0.05 of gas on Solana', step2: 'about $0.05 of gas', weekly: 'about $0.05 of gas per week' };
  }
  if (c.includes('arbitrum') || c.includes('optimism') || c.includes('base') || c.includes('polygon') || c.includes('blast') || c.includes('linea') || c.includes('scroll')) {
    return { step1: `about $1.00 of gas on ${chain}`, step2: 'about $1.50 of gas', weekly: 'about $0.50 of gas per week' };
  }
  if (c.includes('ethereum') || c.includes('mainnet') || c.includes('eth')) {
    return { step1: 'about $12 of gas on Ethereum', step2: 'about $15 of gas', weekly: 'about $5 of gas per week' };
  }
  return { step1: `about $2.00 of gas on ${chain}`, step2: 'about $2.50 of gas', weekly: 'about $1.00 of gas per week' };
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral to ${name} on ${chain} and maintain the position.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s primary pool on ${chain} and keep the position active.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC across chains using ${name} and interact with its destination app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} equivalent of native assets through ${name} on ${chain} and retain receipt tokens.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC margin on ${name} and execute one hedged position.`;
  if (c.includes('prediction')) return `Commit $${capital} and take a balanced position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of stable assets through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of yield-bearing RWA tokens via ${name} on ${chain}.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and maintain the active position.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasDescription(chain);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Set up a dedicated fresh wallet for ${chain} with zero prior history, keep your seed phrase offline, and ensure you only claim rewards from ${p.name}'s official interface.`,
      cost: gas.step1,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} capital and ${gas.step2}`,
      time: '15 minutes setup',
    },
    {
      text: `Perform one qualifying onchain action weekly (such as compounding, rebalancing, borrowing, or voting) on ${chain}.`,
      cost: gas.weekly,
      time: '10 minutes weekly',
    },
    {
      text: `Hold the farm position continuously for at least ${hold} days to qualify across multiple snapshot evaluations.`,
      cost: `locked allocation of $${capital}`,
      time: `${hold} days`,
    },
    {
      text: `Visit ${p.name}'s official governance and rewards portal, verify URLs, and claim earned points or tokens securely.`,
      cost: 'zero claim fee',
      time: '10 minutes',
    },
    {
      text: `Record all wallet interactions, transaction hashes, dates, and capital allocations in a local farm log for auditing.`,
      cost: 'no monetary cost',
      time: '5 minutes',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    watchlist: snapshot.watchlist,
    rows: board.map(radarRow),
    board,
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
