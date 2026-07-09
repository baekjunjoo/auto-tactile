/* learn.js — 공개 데이터 기반 자동 학습 시스템 v2
   개선 항목:
   - C: 랜덤 키워드 중복 방지 (최근 30개 이력 관리)
   - D: 아이콘 소스 선호도 학습 (PREFER_PREFIXES 자동 재정렬)
   - G: 카테고리별 reference_profile 분리
   - 기존: reference_profile + APP_TUNING 자동 갱신 */

(() => {
'use strict';

const MIN_SAMPLES    = 20;
const MAX_FETCH      = 500;
const STORAGE_KEY    = 'at_learned_v2';
const RAND_HIST_KEY  = 'at_rand_hist';
const RAND_HIST_MAX  = 30;   // C: 최근 30개 키워드 이력
const CACHE_TTL      = 24 * 60 * 60 * 1000;  // 24시간

const W = 60, H = 40;
const LEFT_BITS = [0, 1, 2, 6], RIGHT_BITS = [3, 4, 5, 7];

/* ---------- hex → grid ---------- */
function hexToGrid(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  const g = Array.from({ length: H }, () => new Array(W).fill(0));
  for (let cr = 0; cr < 10; cr++) for (let cc = 0; cc < 30; cc++) {
    const b = bytes[cr * 30 + cc];
    for (let side = 0; side < 2; side++) {
      const bits = side === 0 ? LEFT_BITS : RIGHT_BITS;
      for (let r = 0; r < 4; r++)
        if (b & (1 << bits[r])) g[cr * 4 + r][cc * 2 + side] = 1;
    }
  }
  return g;
}

/* ---------- gridStats ---------- */
function gridStats(g) {
  let dots = 0;
  for (const row of g) for (const v of row) dots += v;
  if (dots === 0) return null;
  let solid = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!g[y][x]) continue; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if ((dx||dy) && x+dx>=0 && x+dx<W && y+dy>=0 && y+dy<H && g[y+dy][x+dx]) n++;
    if (n >= 6) solid++;
  }
  const seen = Array.from({length:H}, ()=>new Array(W).fill(0));
  let holeCount = 0;
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    if (g[sy][sx] || seen[sy][sx]) continue;
    const st = [[sx,sy]], cells = []; let touches = false; seen[sy][sx] = 1;
    while (st.length) {
      const [cx,cy] = st.pop(); cells.push([cx,cy]);
      if (cx===0||cx===W-1||cy===0||cy===H-1) touches = true;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx=cx+dx, yy=cy+dy;
        if (xx>=0&&xx<W&&yy>=0&&yy<H&&!g[yy][xx]&&!seen[yy][xx]) { seen[yy][xx]=1; st.push([xx,yy]); }
      }
    }
    if (!touches && cells.length >= 3) holeCount++;
  }
  const seen2 = Array.from({length:H}, ()=>new Array(W).fill(0));
  let comps = 0;
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    if (!g[sy][sx]||seen2[sy][sx]) continue; comps++;
    const st = [[sx,sy]]; seen2[sy][sx]=1;
    while (st.length) {
      const [cx,cy] = st.pop();
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx=cx+dx, yy=cy+dy;
        if (xx>=0&&xx<W&&yy>=0&&yy<H&&g[yy][xx]&&!seen2[yy][xx]) { seen2[yy][xx]=1; st.push([xx,yy]); }
      }
    }
  }
  let x0=W, y0=H, x1=-1, y1=-1;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (g[y][x]) {
    if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y;
  }
  const bw=x1-x0+1, bh=y1-y0+1;
  return { dots, coverage: dots/(W*H), solid_frac: solid/dots, holes: holeCount,
    components: comps, bbox_fill: (bw*bh)/(W*H), density: dots/(bw*bh) };
}

/* ---------- 통계 계산 ---------- */
function calcStats(values) {
  if (!values.length) return null;
  const n = values.length;
  const mean = values.reduce((a,v)=>a+v,0)/n;
  const std = Math.sqrt(values.reduce((a,v)=>a+(v-mean)**2,0)/n);
  return { mean:+mean.toFixed(4), std:+std.toFixed(4),
    min:+Math.min(...values).toFixed(4), max:+Math.max(...values).toFixed(4) };
}

/* ---------- APP_TUNING 커버리지 갱신 ---------- */
function deriveTuning(allStats) {
  const coverages = allStats.map(s=>s.coverage).sort((a,b)=>a-b);
  const n = coverages.length;
  const lo = coverages[Math.floor(n*0.05)];
  const hi = coverages[Math.floor(n*0.95)];
  return {
    coverage_min: +Math.max(0.04, lo-0.01).toFixed(3),
    coverage_max: +Math.min(0.40, hi+0.01).toFixed(3)
  };
}

/* ---------- D: 아이콘 소스 선호도 집계 ---------- */
function deriveIconPrefs(data) {
  // graphics 테이블에 icon_source 컬럼이 없으면 tags에서 추정
  const prefixCount = {};
  for (const row of data) {
    const src = row.icon_source || (row.tags && row.tags.find(t => t.includes(':')));
    if (!src) continue;
    const prefix = src.split(':')[0];
    prefixCount[prefix] = (prefixCount[prefix] || 0) + 1;
  }
  if (!Object.keys(prefixCount).length) return null;
  return Object.entries(prefixCount)
    .sort((a,b) => b[1]-a[1])
    .map(([p]) => p);
}

/* ---------- G: 카테고리별 프로파일 ---------- */
function buildCategoryProfiles(data) {
  const catStats = {};
  for (const row of data) {
    const cat = row.category || '기타';
    if (!row.items || !row.items[0] || !row.items[0].data) continue;
    try {
      const g = hexToGrid(row.items[0].data);
      const st = gridStats(g);
      if (!st || st.dots < 60) continue;
      if (!catStats[cat]) catStats[cat] = [];
      catStats[cat].push(st);
    } catch (e) {}
  }
  const profiles = {};
  const keys = ['coverage','solid_frac','holes','components','bbox_fill','density','dots'];
  for (const [cat, stats] of Object.entries(catStats)) {
    if (stats.length < 5) continue;  // 최소 5개 이상
    const catProfile = { n: stats.length, stats: {} };
    for (const k of keys) {
      const vals = stats.map(s=>s[k]).filter(v=>v!=null&&isFinite(v));
      catProfile.stats[k] = calcStats(vals);
    }
    profiles[cat] = catProfile;
  }
  return profiles;
}

/* ---------- 메인 ---------- */
async function run(supabase, { force = false } = {}) {
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        _apply(cached);
        console.log(`[learn] 캐시 적용 (n=${cached.profile.n}, ${new Date(cached.ts).toLocaleString()})`);
        return { skipped: true, reason: 'cache', ...cached };
      }
    } catch (e) {}
  }

  console.log('[learn] 공개 데이터 수집 중…');
  const { data, error } = await supabase
    .from('graphics')
    .select('items, category, icon_source, tags')
    .eq('status', 'published')
    .limit(MAX_FETCH);

  if (error || !data) {
    console.warn('[learn] 데이터 수집 실패:', error);
    return { skipped: true, reason: 'fetch_error' };
  }

  // 전체 stats
  const allStats = [];
  for (const row of data) {
    if (!row.items || !row.items[0] || !row.items[0].data) continue;
    try {
      const g = hexToGrid(row.items[0].data);
      const st = gridStats(g);
      if (st && st.dots >= 60) allStats.push(st);
    } catch (e) {}
  }

  if (allStats.length < MIN_SAMPLES) {
    console.log(`[learn] 샘플 부족 (${allStats.length}/${MIN_SAMPLES})`);
    return { skipped: true, reason: 'insufficient_data', n: allStats.length };
  }

  // 전체 프로파일
  const keys = ['coverage','solid_frac','holes','components','bbox_fill','density','dots'];
  const stats = {};
  for (const k of keys) {
    const vals = allStats.map(s=>s[k]).filter(v=>v!=null&&isFinite(v));
    stats[k] = calcStats(vals);
  }
  const profile = { n: allStats.length, updated_at: new Date().toISOString(), stats };

  // APP_TUNING 갱신
  const tuningPatch = deriveTuning(allStats);

  // D: 아이콘 소스 선호도
  const iconPrefs = deriveIconPrefs(data);

  // G: 카테고리별 프로파일
  const categoryProfiles = buildCategoryProfiles(data);

  const result = { ts: Date.now(), profile, tuning: tuningPatch, iconPrefs, categoryProfiles };
  _apply(result);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch (e) {}

  const catCount = Object.keys(categoryProfiles).length;
  console.log(`[learn] 갱신 완료 — n=${allStats.length}, coverage ${tuningPatch.coverage_min}~${tuningPatch.coverage_max}, 카테고리 ${catCount}개`);
  return result;
}

function _apply(cached) {
  const { profile, tuning, iconPrefs, categoryProfiles } = cached;
  window.AutoLearn.profile = profile;
  window.AutoLearn.categoryProfiles = categoryProfiles || {};
  if (window.AutoTactile && tuning) {
    const AT = window.AutoTactile;
    if (AT.APP_TUNING) {
      AT.APP_TUNING.coverage_min = tuning.coverage_min;
      AT.APP_TUNING.coverage_max = tuning.coverage_max;
    }
    // D: 학습된 선호 prefix를 PREFER_PREFIXES 앞에 배치
    if (iconPrefs && iconPrefs.length && AT.PREFER_PREFIXES) {
      const rest = AT.PREFER_PREFIXES.filter(p => !iconPrefs.includes(p));
      AT.PREFER_PREFIXES.length = 0;
      AT.PREFER_PREFIXES.push(...iconPrefs, ...rest);
    }
  }
}

/* ---------- C: 랜덤 키워드 중복 방지 ---------- */
function getRecentKeywords() {
  try { return JSON.parse(localStorage.getItem(RAND_HIST_KEY) || '[]'); } catch (e) { return []; }
}
function recordKeyword(kw) {
  const hist = getRecentKeywords();
  const updated = [kw, ...hist.filter(k => k !== kw)].slice(0, RAND_HIST_MAX);
  try { localStorage.setItem(RAND_HIST_KEY, JSON.stringify(updated)); } catch (e) {}
}
function pickRandom(pool) {
  if (!pool.length) return null;
  const recent = new Set(getRecentKeywords());
  const fresh = pool.filter(k => !recent.has(k));
  const source = fresh.length > 0 ? fresh : pool;  // 모두 최근이면 전체에서 선택
  const kw = source[Math.floor(Math.random() * source.length)];
  recordKeyword(kw);
  return kw;
}

/* ---------- G: 카테고리별 프로파일 조회 ---------- */
function getProfileForCategory(cat) {
  const catProfiles = window.AutoLearn.categoryProfiles || {};
  return catProfiles[cat] || window.AutoLearn.profile;
}

function getProfile() { return window.AutoLearn.profile; }

window.AutoLearn = {
  run, getProfile, getProfileForCategory, pickRandom, recordKeyword,
  profile: null, categoryProfiles: {}
};
})();
