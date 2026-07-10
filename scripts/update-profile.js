#!/usr/bin/env node
/* scripts/update-profile.js
   GitHub Actions에서 실행: Supabase 공개 데이터 → reference_profile.json 갱신 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAX_FETCH = 1000;
const MIN_SAMPLES = 20;
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
      for (let r = 0; r < 4; r++)
        if (b & (1 << bits[r])) g[cr * 4 + r][cc * 2 + side] = 1;
    }
  }
  return g;
}

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

function calcStats(values) {
  if (!values.length) return null;
  const n = values.length;
  const mean = values.reduce((a,v)=>a+v,0)/n;
  const std = Math.sqrt(values.reduce((a,v)=>a+(v-mean)**2,0)/n);
  return { mean:+mean.toFixed(4), std:+std.toFixed(4),
    min:+Math.min(...values).toFixed(4), max:+Math.max(...values).toFixed(4) };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('SUPABASE_URL 또는 SUPABASE_ANON_KEY 환경변수가 없습니다.');
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { transport: ws }
  });

  // 페이지네이션으로 전체 수집
  let allData = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('graphics')
      .select('items, category')
      .eq('status', 'published')
      .range(from, from + 499);
    if (error || !data || !data.length) break;
    allData = allData.concat(data);
    if (data.length < 500) break;
    from += 500;
    if (allData.length >= MAX_FETCH) break;
  }

  console.log(`수집된 데이터: ${allData.length}건`);

  // 전체 stats
  const allStats = [];
  const catStats = {};
  for (const row of allData) {
    if (!row.items || !row.items[0] || !row.items[0].data) continue;
    try {
      const g = hexToGrid(row.items[0].data);
      const st = gridStats(g);
      if (!st || st.dots < 60) continue;
      allStats.push(st);
      const cat = row.category || '기타';
      if (!catStats[cat]) catStats[cat] = [];
      catStats[cat].push(st);
    } catch (e) {}
  }

  if (allStats.length < MIN_SAMPLES) {
    console.log(`샘플 부족 (${allStats.length}/${MIN_SAMPLES}), 갱신 건너뜀`);
    process.exit(0);
  }

  const keys = ['coverage','solid_frac','holes','components','bbox_fill','density','dots'];
  const stats = {};
  for (const k of keys) {
    const vals = allStats.map(s=>s[k]).filter(v=>v!=null&&isFinite(v));
    stats[k] = calcStats(vals);
  }

  // 카테고리별 프로파일
  const categoryProfiles = {};
  for (const [cat, cStats] of Object.entries(catStats)) {
    if (cStats.length < 5) continue;
    const catProfile = { n: cStats.length, stats: {} };
    for (const k of keys) {
      const vals = cStats.map(s=>s[k]).filter(v=>v!=null&&isFinite(v));
      catProfile.stats[k] = calcStats(vals);
    }
    categoryProfiles[cat] = catProfile;
  }

  const profile = {
    n: allStats.length,
    updated_at: new Date().toISOString(),
    stats,
    category_profiles: categoryProfiles
  };

  const outPath = path.join(__dirname, '..', 'reference_profile.json');
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2), 'utf-8');
  console.log(`reference_profile.json 갱신 완료 (n=${allStats.length}, 카테고리 ${Object.keys(categoryProfiles).length}개)`);
}

main().catch(e => { console.error(e); process.exit(1); });
