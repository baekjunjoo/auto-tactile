/* learn.js — 공개된 그래픽 데이터를 분석하여 reference_profile과 APP_TUNING을 자동 갱신.
   window.AutoLearn.run(supabaseClient) 호출로 실행.
   결과는 메모리 내 window.AutoTactile.APP_TUNING과 window.AutoLearn.profile에 반영됨.
   최소 데이터 수(MIN_SAMPLES) 미달 시 갱신하지 않음. */

(() => {
'use strict';

const MIN_SAMPLES = 20;       // 최소 20개 이상 공개 데이터 있어야 갱신
const MAX_FETCH   = 500;      // 최대 수집 건수
const STORAGE_KEY = 'at_learned_profile_v1';
const TUNING_KEY  = 'at_learned_tuning_v1';

/* ---------- hex → 60×40 grid ---------- */
const W = 60, H = 40;
const LEFT_BITS = [0, 1, 2, 6], RIGHT_BITS = [3, 4, 5, 7];

function hexToGrid(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  const g = Array.from({ length: H }, () => new Array(W).fill(0));
  for (let cr = 0; cr < 10; cr++) for (let cc = 0; cc < 30; cc++) {
    const b = bytes[cr * 30 + cc];
    for (let side = 0; side < 2; side++) {
      const bits = side === 0 ? LEFT_BITS : RIGHT_BITS;
      for (let r = 0; r < 4; r++) {
        if (b & (1 << bits[r])) g[cr * 4 + r][cc * 2 + side] = 1;
      }
    }
  }
  return g;
}

/* ---------- gridStats (convert.js의 gridStats와 동일 로직) ---------- */
function gridStats(g) {
  let dots = 0;
  for (const row of g) for (const v of row) dots += v;
  if (dots === 0) return null;

  // solid_frac: 8방향 이웃 6개 이상인 점 비율
  let solid = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!g[y][x]) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && x+dx >= 0 && x+dx < W && y+dy >= 0 && y+dy < H && g[y+dy][x+dx]) n++;
    }
    if (n >= 6) solid++;
  }

  // holes: 밀폐 배경 성분 (3픽셀 이상)
  const seen = Array.from({ length: H }, () => new Array(W).fill(0));
  let holeCount = 0;
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    if (g[sy][sx] || seen[sy][sx]) continue;
    const st = [[sx, sy]], cells = []; let touches = false;
    seen[sy][sx] = 1;
    while (st.length) {
      const [cx, cy] = st.pop(); cells.push([cx, cy]);
      if (cx === 0 || cx === W-1 || cy === 0 || cy === H-1) touches = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx = cx+dx, yy = cy+dy;
        if (xx>=0&&xx<W&&yy>=0&&yy<H&&!g[yy][xx]&&!seen[yy][xx]) { seen[yy][xx]=1; st.push([xx,yy]); }
      }
    }
    if (!touches && cells.length >= 3) holeCount++;
  }

  // components
  const seen2 = Array.from({ length: H }, () => new Array(W).fill(0));
  let comps = 0;
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    if (!g[sy][sx] || seen2[sy][sx]) continue; comps++;
    const st = [[sx, sy]]; seen2[sy][sx] = 1;
    while (st.length) {
      const [cx, cy] = st.pop();
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx=cx+dx, yy=cy+dy;
        if (xx>=0&&xx<W&&yy>=0&&yy<H&&g[yy][xx]&&!seen2[yy][xx]) { seen2[yy][xx]=1; st.push([xx,yy]); }
      }
    }
  }

  // bbox
  let x0=W, y0=H, x1=-1, y1=-1;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (g[y][x]) {
    if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y;
  }
  const bw=x1-x0+1, bh=y1-y0+1;

  return {
    dots,
    coverage: dots / (W * H),
    solid_frac: solid / dots,
    holes: holeCount,
    components: comps,
    bbox_fill: (bw * bh) / (W * H),
    density: dots / (bw * bh)
  };
}

/* ---------- 통계 계산 ---------- */
function calcStats(values) {
  if (!values.length) return null;
  const n = values.length;
  const mean = values.reduce((a, v) => a + v, 0) / n;
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  return { mean: +mean.toFixed(4), std: +std.toFixed(4), min: +Math.min(...values).toFixed(4), max: +Math.max(...values).toFixed(4) };
}

/* ---------- APP_TUNING 갱신 ---------- */
function deriveTuning(allStats) {
  const coverages = allStats.map(s => s.coverage).sort((a, b) => a - b);
  const n = coverages.length;
  // 하위 5%, 상위 5% 제거 후 범위 설정
  const lo = coverages[Math.floor(n * 0.05)];
  const hi = coverages[Math.floor(n * 0.95)];
  return {
    coverage_min: +Math.max(0.04, lo - 0.01).toFixed(3),
    coverage_max: +Math.min(0.40, hi + 0.01).toFixed(3)
  };
}

/* ---------- 메인 ---------- */
async function run(supabase, { force = false } = {}) {
  // 캐시 확인 (24시간)
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) {
        _apply(cached.profile, cached.tuning);
        console.log(`[learn] 캐시 적용 (n=${cached.profile.n}, ${new Date(cached.ts).toLocaleString()})`);
        return { skipped: true, reason: 'cache', profile: cached.profile };
      }
    } catch (e) {}
  }

  // Supabase에서 공개된 그래픽의 hex 데이터 수집
  console.log('[learn] 공개 데이터 수집 중…');
  const { data, error } = await supabase
    .from('graphics')
    .select('items')
    .eq('status', 'published')
    .limit(MAX_FETCH);

  if (error || !data) {
    console.warn('[learn] 데이터 수집 실패:', error);
    return { skipped: true, reason: 'fetch_error' };
  }

  // hex → grid → stats
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
    console.log(`[learn] 샘플 부족 (${allStats.length}/${MIN_SAMPLES}), 갱신 건너뜀`);
    return { skipped: true, reason: 'insufficient_data', n: allStats.length };
  }

  // reference_profile 계산
  const keys = ['coverage', 'solid_frac', 'holes', 'components', 'bbox_fill', 'density', 'dots'];
  const stats = {};
  for (const k of keys) {
    const vals = allStats.map(s => s[k]).filter(v => v != null && isFinite(v));
    stats[k] = calcStats(vals);
  }
  const profile = { n: allStats.length, updated_at: new Date().toISOString(), stats };

  // APP_TUNING 커버리지 범위 갱신
  const tuningPatch = deriveTuning(allStats);

  // 적용 및 캐시 저장
  _apply(profile, tuningPatch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), profile, tuning: tuningPatch }));
  } catch (e) {}

  console.log(`[learn] 갱신 완료 — n=${allStats.length}, coverage ${tuningPatch.coverage_min}~${tuningPatch.coverage_max}`);
  return { profile, tuning: tuningPatch, n: allStats.length };
}

function _apply(profile, tuningPatch) {
  // window.AutoLearn.profile 갱신 (convert.js의 generateCandidates가 참조)
  window.AutoLearn.profile = profile;
  // APP_TUNING 커버리지 범위 패치
  if (window.AutoTactile && tuningPatch) {
    const AT = window.AutoTactile;
    if (AT.APP_TUNING) {
      AT.APP_TUNING.coverage_min = tuningPatch.coverage_min;
      AT.APP_TUNING.coverage_max = tuningPatch.coverage_max;
    }
  }
}

function getProfile() { return window.AutoLearn.profile; }

window.AutoLearn = { run, getProfile, profile: null };
})();
