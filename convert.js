/* Auto Tactile — 브라우저 변환 엔진 (dotpad 파이썬 패키지의 JS 포팅).
   순수 클라이언트: Iconify SVG 수급 → canvas 래스터화 → R형(rich/ref) 변환 →
   .dtm hex 인코딩 + 품질/레퍼런스 유사도. GitHub Pages(정적)에서 그대로 동작.
   알고리즘은 dotpad/{grid,convert,quality,categorize}.py와 1:1 대응. */
(() => {
'use strict';
const W = 60, H = 40;
const LEFT_BITS = [0, 1, 2, 6], RIGHT_BITS = [3, 4, 5, 7];
const REF_HOLE_FILL_MAX = 40, REF_ACCENT_MAX = 80;

/* ---------- .dtm 인코딩 ---------- */
function toHex(g) {                       // g: H×W 0/1
  const b = new Uint8Array(30 * 10);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!g[y][x]) continue;
    const cc = x >> 1, side = x & 1, cr = y >> 2, r = y & 3;
    const ci = cr * 30 + cc, bit = (side === 0 ? LEFT_BITS : RIGHT_BITS)[r];
    b[ci] |= (1 << bit);
  }
  return Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
}

/* ---------- 배열 유틸 ---------- */
const zeros = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const clone = g => g.map(r => r.slice());
const sumAll = g => g.reduce((a, r) => a + r.reduce((b, v) => b + v, 0), 0);

/* ---------- 래스터화 & 픽셀 준비 ---------- */
function rasterize(img, targetH = 480) {   // img: HTMLImageElement → white-bg canvas
  const iw = img.naturalWidth || img.width || targetH;
  const ih = img.naturalHeight || img.height || targetH;
  const sc = targetH / ih;
  const w = Math.max(1, Math.round(iw * sc)), h = targetH;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
function toGray(id) {                       // ImageData → {w,h,g:Uint8Array}
  const { width: w, height: h, data: d } = id, g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const a = d[i + 3] / 255;
    // 투명 픽셀은 흰 배경으로 합성
    const r = d[i] * a + 255 * (1 - a), gg = d[i + 1] * a + 255 * (1 - a), b = d[i + 2] * a + 255 * (1 - a);
    g[p] = Math.round(0.299 * r + 0.587 * gg + 0.114 * b);
  }
  return { w, h, g };
}
function autocontrast(gray, cutoff = 1) {   // PIL autocontrast(cutoff=1), in-place LUT
  const { g } = gray, n = g.length, hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) hist[g[i]]++;
  const cut = Math.floor(n * cutoff / 100);
  let lo = 0, hi = 255, c = 0;
  for (let i = 0; i < 256; i++) { c += hist[i]; if (c > cut) { lo = i; break; } }
  c = 0;
  for (let i = 255; i >= 0; i--) { c += hist[i]; if (c > cut) { hi = i; break; } }
  if (hi <= lo) return;
  const scale = 255 / (hi - lo), lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(255, Math.round((i - lo) * scale)));
  for (let i = 0; i < n; i++) g[i] = lut[g[i]];
}
function autocropBox(gray, bg = 245) {      // 근백색 배경 크롭 bbox (inclusive)
  const { w, h, g } = gray;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (g[y * w + x] < bg) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return { x0, y0, x1, y1 };
}
// 크롭 영역을 tw×th에 aspect 보존·중앙 배치(흰 배경), 그레이 2D 반환. (thumbnail+paste 대응)
function grayFit(gray, box, tw, th) {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const sc = Math.min(tw / bw, th / bh);
  const nw = Math.max(1, Math.min(tw, Math.round(bw * sc)));
  const nh = Math.max(1, Math.min(th, Math.round(bh * sc)));
  const ox = (tw - nw) >> 1, oy = (th - nh) >> 1;
  const out = Array.from({ length: th }, () => new Array(tw).fill(255));
  for (let ny = 0; ny < nh; ny++) for (let nx = 0; nx < nw; nx++) {
    const sx = box.x0 + Math.min(bw - 1, Math.floor(nx / sc));
    const sy = box.y0 + Math.min(bh - 1, Math.floor(ny / sc));
    out[oy + ny][ox + nx] = gray.g[sy * gray.w + sx];
  }
  return out;
}
// 컬러(RGB) 버전: box를 tw×th 중앙 배치, [th][tw][3] 반환 (rich 모드용)
function rgbFit(id, box, tw, th) {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const sc = Math.min(tw / bw, th / bh);
  const nw = Math.max(1, Math.min(tw, Math.round(bw * sc)));
  const nh = Math.max(1, Math.min(th, Math.round(bh * sc)));
  const ox = (tw - nw) >> 1, oy = (th - nh) >> 1, d = id.data, iw = id.width;
  const out = Array.from({ length: th }, () => Array.from({ length: tw }, () => [255, 255, 255]));
  for (let ny = 0; ny < nh; ny++) for (let nx = 0; nx < nw; nx++) {
    const sx = box.x0 + Math.min(bw - 1, Math.floor(nx / sc));
    const sy = box.y0 + Math.min(bh - 1, Math.floor(ny / sc));
    const i = (sy * iw + sx) * 4, a = d[i + 3] / 255;
    out[oy + ny][ox + nx] = [Math.round(d[i] * a + 255 * (1 - a)),
      Math.round(d[i + 1] * a + 255 * (1 - a)), Math.round(d[i + 2] * a + 255 * (1 - a))];
  }
  return out;
}

/* ---------- 임계 & 잉크 ---------- */
function otsu2d(gray2d) {
  const hist = new Array(256).fill(0); let total = 0, sumv = 0;
  for (const row of gray2d) for (const v of row) { hist[v]++; total++; sumv += v; }
  let sumB = 0, wB = 0, maxv = 0, thr = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (wB === 0) continue;
    const wF = total - wB; if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sumv - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > maxv) { maxv = between; thr = i; }
  }
  return thr;
}
const ink2d = (gray2d, thr) => gray2d.map(row => row.map(v => v < thr ? 1 : 0));

/* ---------- 모폴로지 (convert.py 대응) ---------- */
function boundary(ink) {
  const h = ink.length, w = ink[0].length, out = zeros(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!ink[y][x]) continue;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= w || yy < 0 || yy >= h || !ink[yy][xx]) { edge = true; break; }
    }
    if (edge) out[y][x] = 1;
  }
  return out;
}
function close1(grid) {
  const h = grid.length, w = grid[0].length, dil = zeros(h, w), out = zeros(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x])
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) dil[yy][xx] = 1;
    }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dil[y][x]) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (!(yy >= 0 && yy < h && xx >= 0 && xx < w && dil[yy][xx])) { ok = false; break; }
    }
    out[y][x] = ok ? 1 : 0;
  }
  return out;
}
function erode(grid) {
  const h = grid.length, w = grid[0].length, out = zeros(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (grid[y][x] && x > 0 && grid[y][x - 1] && x < w - 1 && grid[y][x + 1]
      && y > 0 && grid[y - 1][x] && y < h - 1 && grid[y + 1][x]) out[y][x] = 1;
  return out;
}
function bridge4(grid) {
  const h = grid.length, w = grid[0].length, out = clone(grid);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    if (grid[y][x] && grid[y + 1][x + 1] && !grid[y][x + 1] && !grid[y + 1][x]) out[y][x + 1] = 1;
    if (grid[y][x + 1] && grid[y + 1][x] && !grid[y][x] && !grid[y + 1][x + 1]) out[y + 1][x + 1] = 1;
  }
  return out;
}
function components(grid) {                 // 4-conn
  const h = grid.length, w = grid[0].length, seen = zeros(h, w), comps = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!grid[y][x] || seen[y][x]) continue;
    const st = [[x, y]]; seen[y][x] = 1; const cells = [];
    while (st.length) {
      const [cx, cy] = st.pop(); cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && grid[yy][xx] && !seen[yy][xx]) { seen[yy][xx] = 1; st.push([xx, yy]); }
      }
    }
    comps.push(cells);
  }
  return comps;
}
function dropSmall(grid, minsize = 4) {
  const out = clone(grid);
  for (const c of components(grid)) if (c.length < minsize) for (const [x, y] of c) out[y][x] = 0;
  return out;
}
function holes(ink) {                       // 밀폐 배경 성분
  const h = ink.length, w = ink[0].length, seen = zeros(h, w), res = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (ink[y][x] || seen[y][x]) continue;
    const st = [[x, y]]; seen[y][x] = 1; const cells = []; let touches = false;
    while (st.length) {
      const [cx, cy] = st.pop(); cells.push([cx, cy]);
      if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touches = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && !ink[yy][xx] && !seen[yy][xx]) { seen[yy][xx] = 1; st.push([xx, yy]); }
      }
    }
    if (!touches) res.push(cells);
  }
  return res;
}
function widestRun(row) { let best = 0, cur = 0; for (const v of row) { cur = v ? cur + 1 : 0; if (cur > best) best = cur; } return best; }
function strayCells(grid, bottomRows = 10, topRows = 2, maxFrac = 0.5, bandGapRow = 26, bandMaxH = 5, bandMinW = 12) {
  const h = grid.length, w = grid[0].length, stray = new Set();
  let comps = components(grid);
  if (comps.length > 1) {
    comps = comps.slice().sort((a, b) => b.length - a.length);
    const mainN = comps[0].length;
    for (const c of comps.slice(1)) {
      const ys = c.map(p => p[1]); const mn = Math.min(...ys), mx = Math.max(...ys);
      if ((mn >= h - bottomRows || mx < topRows) && c.length < maxFrac * mainN)
        for (const [x, y] of c) stray.add(y * w + x);
    }
  }
  const rowsum = grid.map(r => r.reduce((a, v) => a + v, 0));
  const nz = []; for (let y = 0; y < h; y++) if (rowsum[y]) nz.push(y);
  if (nz.length) {
    const bottom = Math.max(...nz);
    for (let y0 = bandGapRow; y0 < bottom; y0++) {
      if (rowsum[y0] === 0 && rowsum.slice(0, y0).some(v => v) && rowsum.slice(y0 + 1, bottom + 1).some(v => v)) {
        const below = []; for (let k = y0 + 1; k <= bottom; k++) if (rowsum[k]) below.push(k);
        if (below.length && (below[below.length - 1] - below[0] + 1) <= bandMaxH) {
          const widest = Math.max(...below.map(k => widestRun(grid[k])));
          if (widest >= bandMinW) for (const k of below) for (let x = 0; x < w; x++) if (grid[k][x]) stray.add(k * w + x);
        }
        break;
      }
    }
  }
  return stray;
}
function stripStray(grid) {
  const stray = strayCells(grid); if (!stray.size) return grid;
  const w = grid[0].length, out = clone(grid);
  for (const key of stray) out[Math.floor(key / w)][key % w] = 0;
  return out;
}
function legibility(grid) {
  const h = grid.length, w = grid[0].length, out = clone(grid);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x]) continue;
    const up = y > 0 && grid[y - 1][x], dn = y < h - 1 && grid[y + 1][x];
    const lf = x > 0 && grid[y][x - 1], rt = x < w - 1 && grid[y][x + 1];
    if ((up + dn + lf + rt) >= 3) out[y][x] = 1;  // 평행선 사이 강제 채움 제거
  }
  return out;
}
function zhangSuen(grid) {
  const h = grid.length, w = grid[0].length, g = clone(grid);
  const nb = (x, y) => [g[y - 1][x], g[y - 1][x + 1], g[y][x + 1], g[y + 1][x + 1],
    g[y + 1][x], g[y + 1][x - 1], g[y][x - 1], g[y - 1][x - 1]];
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const rem = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!g[y][x]) continue;
        const P = nb(x, y), C = P.reduce((a, v) => a + v, 0);
        if (C < 2 || C > 6) continue;
        let A = 0; for (let i = 0; i < 8; i++) if (P[i] === 0 && P[(i + 1) % 8] === 1) A++;
        if (A !== 1) continue;
        const [p2, p3, p4, p5, p6, p7, p8, p9] = P;
        if (step === 0) { if (p2 * p4 * p6) continue; if (p4 * p6 * p8) continue; }
        else { if (p2 * p4 * p8) continue; if (p2 * p6 * p8) continue; }
        rem.push([x, y]);
      }
      if (rem.length) { changed = true; for (const [x, y] of rem) g[y][x] = 0; }
    }
  }
  return g;
}
function cleanup(grid) {
  const h = grid.length, w = grid[0].length, out = clone(grid);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!grid[y][x]) continue; let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy >= 0 && yy < h && grid[yy][xx]) n++;
    }
    if (n === 0) out[y][x] = 0;
  }
  return out;
}

/* ---------- 컬러 판정 & rich ---------- */
function isColorful(id, minFrac = 0.03) {   // ImageData 기준
  const d = id.data; let fig = 0, chroma = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]; if (a < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r >= 200 && g >= 200 && b >= 200) continue;
    fig++; if (Math.max(r, g, b) - Math.min(r, g, b) >= 25) chroma++;
  }
  return fig > 0 && chroma / fig >= minFrac;
}
function richSub(id, gw, gh, holeFillMax, accentMax, sc = 4) {
  const tw = gw * sc, th = gh * sc;
  const gray = toGray(id), box = autocropBox(gray, 245);
  const px = rgbFit(id, box, tw, th);       // [th][tw][3], 흰배경
  const lab = (r, g, b) => (r >= 200 && g >= 200 && b >= 200) ? null : ((r / 48 | 0) * 100 + (g / 48 | 0) * 10 + (b / 48 | 0));
  const labels = px.map(row => row.map(([r, g, b]) => lab(r, g, b)));
  let fig = 0, chroma = 0;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    if (labels[y][x] === null) continue; fig++;
    const [r, g, b] = px[y][x]; if (Math.max(r, g, b) - Math.min(r, g, b) >= 25) chroma++;
  }
  if (fig === 0 || chroma / fig < 0.03) return null;  // 모노 → ref 폴백
  // 소영역 병합
  const minRegion = sc * sc * 4, seen = zeros(th, tw);
  for (let y0 = 0; y0 < th; y0++) for (let x0 = 0; x0 < tw; x0++) {
    if (seen[y0][x0] || labels[y0][x0] === null) continue;
    const l0 = labels[y0][x0], st = [[x0, y0]]; seen[y0][x0] = 1;
    const cells = [], nbCount = new Map();
    while (st.length) {
      const [x, y] = st.pop(); cells.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= tw || yy < 0 || yy >= th) continue;
        const l2 = labels[yy][xx];
        if (l2 === l0) { if (!seen[yy][xx]) { seen[yy][xx] = 1; st.push([xx, yy]); } }
        else if (l2 !== null) nbCount.set(l2, (nbCount.get(l2) || 0) + 1);
      }
    }
    if (cells.length < minRegion && nbCount.size) {
      let best = null, bn = -1; for (const [k, v] of nbCount) if (v > bn) { bn = v; best = k; }
      for (const [x, y] of cells) labels[y][x] = best;
    }
  }
  // 색 경계 엣지맵
  const ehi = zeros(th, tw);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const l = labels[y][x];
    if (x + 1 < tw && labels[y][x + 1] !== l && (l !== null || labels[y][x + 1] !== null)) ehi[y][x] = 1;
    if (y + 1 < th && labels[y + 1][x] !== l && (l !== null || labels[y + 1][x] !== null)) ehi[y][x] = 1;
  }
  let sub = zeros(gh, gw);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let n = 0; for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) n += ehi[gy * sc + yy][gx * sc + xx];
    if (n >= sc) sub[gy][gx] = 1;
  }
  sub = zhangSuen(close1(sub));
  // 어두운 소영역 → 솔리드 악센트
  const dark = zeros(gh, gw);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const [r, g, b] = px[gy * sc + (sc >> 1)][gx * sc + (sc >> 1)];
    if (0.299 * r + 0.587 * g + 0.114 * b < 90) dark[gy][gx] = 1;
  }
  const lim = Math.max(holeFillMax, accentMax);
  for (const c of components(dark)) if (c.length <= lim) for (const [x, y] of c) sub[y][x] = 1;
  return sub;
}

/* ---------- thick_line 전용 유틸 ---------- */
function dilate1(grid) {  // 3x3 팽창 (1픽셀 확장)
  const h = grid.length, w = grid[0].length, out = zeros(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x])
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy][xx] = 1;
    }
  return out;
}
function thickOutline(ink) {
  // 외부 팽창 XOR 원본 → 외부 1픽셀 윤곽
  const outer = dilate1(ink);
  const h = ink.length, w = ink[0].length, out = zeros(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (outer[y][x] && !ink[y][x]) out[y][x] = 1;  // 외부 경계
  // 내부 1픽셀 윤곽 (boundary) 합산 → 총 2픽셀 두께
  const inner = boundary(ink);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (inner[y][x]) out[y][x] = 1;
  return out;
}
function extractFeatures(ink, maxSize = 60) {
  // 독립된 작은 덩어리(눈, 코 등)를 솔리드 특징으로 보존
  const comps = components(ink);
  if (!comps.length) return zeros(ink.length, ink[0].length);
  const biggest = Math.max(...comps.map(c => c.length));
  const feat = zeros(ink.length, ink[0].length);
  for (const c of comps)
    if (c.length < biggest && c.length >= 3 && c.length <= maxSize)
      for (const [x, y] of c) feat[y][x] = 1;
  return feat;
}

/* ---------- imageToGrid ---------- */
function placeGrid(sub, margin) {
  const g = zeros(H, W);
  for (let y = 0; y < sub.length; y++) for (let x = 0; x < sub[0].length; x++)
    if (sub[y][x]) { const gx = x + margin, gy = y + margin; if (gx >= 0 && gx < W && gy >= 0 && gy < H) g[gy][gx] = 1; }
  return g;
}
function imageToGrid(id, mode, margin = 2, holeFillMax = REF_HOLE_FILL_MAX, accentMax = REF_ACCENT_MAX) {
  if (mode === 'rich') {
    let sub = richSub(id, W - 2 * margin, H - 2 * margin, holeFillMax, accentMax);
    if (sub === null) return imageToGrid(id, 'ref', margin, holeFillMax, accentMax);
    sub = bridge4(sub); sub = dropSmall(sub, 3); sub = stripStray(sub);
    sub = legibility(sub); sub = bridge4(sub); sub = cleanup(sub);
    return placeGrid(sub, margin);
  }
  const gray = toGray(id); autocontrast(gray, 1);
  const box = autocropBox(gray, 245);
  const fit = grayFit(gray, box, W - 2 * margin, H - 2 * margin);
  let sub;
  if (mode === 'ref') {
    // close1을 boundary 이후로 이동: 이진화 직후 팩장으로 외곽선이 두꺼워지는 문제 방지
    const ink = ink2d(fit, otsu2d(fit));
    let u = boundary(ink);
    u = close1(u);  // 외곽선 추출 후 닫힌 연산으로 끊어진 선 보완
    for (const cells of holes(ink)) if (cells.length <= holeFillMax) for (const [hx, hy] of cells) u[hy][hx] = 1;
    const comps = components(ink);
    if (comps.length) {
      const big = Math.max(...comps.map(c => c.length));
      for (const c of comps) if (c.length < big && c.length <= accentMax) for (const [hx, hy] of c) u[hy][hx] = 1;
    }
    u = bridge4(u); u = dropSmall(u, 3); u = stripStray(u); u = legibility(u); u = bridge4(u);
    sub = u;
  } else if (mode === 'thick_line') {
    // 2픽셀 균일 외곽선 + 독립 특징(눈, 코 등) 솔리드 보존
    const ink = ink2d(fit, otsu2d(fit));
    let u = thickOutline(ink);
    // 독립된 작은 덩어리(눈, 코 등)를 솔리드로 덮어씌움
    const feat = extractFeatures(ink, accentMax);
    for (let y = 0; y < u.length; y++) for (let x = 0; x < u[0].length; x++)
      if (feat[y][x]) u[y][x] = 1;
    u = bridge4(u); u = dropSmall(u, 3); u = stripStray(u); u = bridge4(u);
    sub = u;
  } else if (mode === 'thin') {
    sub = boundary(ink2d(fit, otsu2d(fit)));
  } else { // line (2도트 윤곽)
    const ink = close1(ink2d(fit, otsu2d(fit)));
    let e = ink; for (let i = 0; i < 2; i++) e = erode(e);
    let u = fit.map((row, y) => row.map((_, x) => (ink[y][x] && !e[y][x]) ? 1 : 0));
    u = bridge4(u); u = close1(u); u = bridge4(u); u = dropSmall(u, 4);
    u = stripStray(u); u = legibility(u); u = bridge4(u);
    sub = u;
  }
  sub = cleanup(sub);
  return placeGrid(sub, margin);
}

/* ---------- 품질 & 유사도 ---------- */
function gridMetrics(g) {
  const dots = sumAll(g);
  const seen = zeros(H, W); let comps = 0;
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    if (!g[sy][sx] || seen[sy][sx]) continue; comps++;
    const st = [[sx, sy]]; seen[sy][sx] = 1;
    while (st.length) { const [x, y] = st.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H && g[yy][xx] && !seen[yy][xx]) { seen[yy][xx] = 1; st.push([xx, yy]); }
      }
    }
  }
  let iso = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) {
    let has = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H && g[yy][xx]) has = true; }
    if (!has) iso++;
  }
  const stray = strayCells(g).size;
  let clipped = 0;
  for (let x = 0; x < W; x++) { clipped += g[0][x] + g[H - 1][x]; }
  for (let y = 0; y < H; y++) { clipped += g[y][0] + g[y][W - 1]; }
  let congestion = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++)
    if (!g[y][x] && ((g[y - 1][x] && g[y + 1][x]) || (g[y][x - 1] && g[y][x + 1]))) congestion++;
  return { dots, coverage: dots / (W * H), components: comps, isolated: iso, stray, clipped, congestion };
}
function qualityScore(m, t) {
  let s = 100;
  s -= Math.min(45, m.isolated * 9);
  if (m.stray > 0) s -= Math.min(60, 25 + m.stray * 4);
  if (m.coverage < t.coverage_min) s -= (t.coverage_min - m.coverage) * 500;
  if (m.coverage > t.coverage_max) s -= (m.coverage - t.coverage_max) * 300;
  if (m.components > 10) s -= (m.components - 10) * 1.5;
  if (m.clipped > 0) s -= Math.min(20, 4 + m.clipped * 1.5);
  if (m.congestion > 4) s -= Math.min(15, (m.congestion - 4) * 1.5);
  return Math.max(0, Math.min(100, Math.round(s * 10) / 10));
}
function gridStats(g) {
  const dots = sumAll(g);
  if (dots === 0) return { dots: 0, coverage: 0, solid_frac: 0, holes: 0, components: 0, bbox_fill: 0, density: 0 };
  let solid = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!g[y][x]) continue; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && g[y + dy][x + dx]) n++;
    if (n >= 6) solid++;
  }
  const hz = holes(g).filter(c => c.length >= 3).length;
  const comps = components(g).length;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  return { dots, coverage: dots / (W * H), solid_frac: solid / dots, holes: hz, components: comps,
    bbox_fill: (bw * bh) / (W * H), density: dots / (bw * bh) };
}
const LIKENESS_KEYS = { coverage: 1.0, solid_frac: 1.5, holes: 1.0, bbox_fill: 1.0, density: 1.0 };
function refLikeness(g, profile) {
  if (!profile || !profile.stats) return null;
  const st = gridStats(g); let total = 0, wsum = 0;
  for (const k in LIKENESS_KEYS) {
    const ps = profile.stats[k]; if (!ps || !(k in st)) continue;
    const std = Math.max(ps.std, 1e-4), z = Math.abs(st[k] - ps.mean) / std;
    total += LIKENESS_KEYS[k] * Math.min(z, 3.0); wsum += LIKENESS_KEYS[k];
  }
  if (wsum === 0) return null;
  return Math.round(Math.max(0, 100 - 15 * total / wsum) * 10) / 10;
}

/* ---------- convert_best (rich→ref→line) ---------- */
const APP_TUNING = { modes_try: ['rich', 'thick_line', 'ref', 'line'], coverage_min: 0.05, coverage_max: 0.22,
  min_score: 55, ref_hole_fill_max: REF_HOLE_FILL_MAX, ref_accent_max: REF_ACCENT_MAX };
function convertBest(id, profile, tuning = APP_TUNING) {
  const colorful = isColorful(id), cands = [];
  for (const mode of tuning.modes_try) {
    if (mode === 'rich' && !colorful) continue;
    let g; try { g = imageToGrid(id, mode, 2, tuning.ref_hole_fill_max, tuning.ref_accent_max); } catch (e) { continue; }
    const m = gridMetrics(g), s = qualityScore(m, tuning);
    cands.push({ g, mode, m, s, likeness: refLikeness(g, profile) });
  }
  if (!cands.length) return null;
  for (const pref of ['rich', 'thick_line', 'ref', 'line'])
    for (const c of cands) if (c.mode === pref && c.m.dots >= 60 && c.s >= tuning.min_score) return c;
  return cands.reduce((a, b) => (b.s > a.s ? b : a));
}

/* ---------- categorize ---------- */
const CATEGORY_KEYWORDS = {
  '생물': "lion elephant giraffe zebra horse cow pig sheep goat deer rabbit fox wolf bear tiger leopard cheetah monkey gorilla kangaroo camel rhinoceros rhino hippopotamus hippo panda koala squirrel hedgehog bat dog cat mouse rat hamster donkey buffalo moose crocodile alligator snake turtle tortoise frog toad lizard gecko chameleon iguana dolphin whale shark octopus squid crab lobster shrimp seahorse jellyfish starfish seal walrus clam fish stingray eel coral penguin owl eagle hawk parrot peacock swan duck rooster hen chicken flamingo ostrich pelican pigeon robin sparrow crow toucan woodpecker butterfly bee ant spider snail ladybug beetle dragonfly grasshopper moth caterpillar scorpion worm tyrannosaurus rex triceratops stegosaurus brachiosaurus velociraptor pterodactyl ankylosaurus spinosaurus dinosaur tree palm cactus mushroom flower rose sunflower tulip daisy leaf acorn cone fern bamboo clover seedling sprout vine ivy wheat grass hand eye tooth skull brain heart lung kidney bone skeleton ear nose foot muscle stomach liver cell neuron dna",
  '생활': "house home chair table lamp clock key bell umbrella scissors book teacup cup teapot bulb lightbulb light candle basket mirror broom bucket spoon fork knife plate bottle glass jar box bag backpack wallet glasses watch ring crown envelope mail phone camera television tv radio computer laptop keyboard battery plug robot telephone hammer wrench screwdriver saw drill pliers axe shovel rake nail screw gear magnet ladder ruler pencil pen brush paintbrush car bus train airplane plane sailboat boat ship bicycle bike motorcycle truck rocket anchor helicopter scooter tractor submarine wheel tire apple banana carrot pizza ice cream cupcake cake bread loaf orange grape strawberry watermelon lemon cherry pear peach pineapple corn tomato potato egg donut cookie candy hamburger burger hotdog sandwich taco popcorn lollipop coffee milk cheese fish",
  '사회': "mountain volcano island compass globe map river lake ocean sea desert forest waterfall bridge castle tower lighthouse tent pyramid flag sun moon crescent star planet saturn comet orbit galaxy earth satellite asteroid telescope ufo cloud snowflake snow lightning rain raindrop wind rainbow tornado thermometer storm fog",
  '과학': "atom molecule test tube beaker flask microscope magnet battery circuit bulb gear lab chemistry physics experiment rocket",
  '수학': "bar chart graph line coordinate axes axis pie grid number plus minus equation fraction abacus calculator protractor compass percent infinity angle",
  '도형': "triangle square rectangle pentagon hexagon octagon circle oval ellipse star parallelogram trapezoid rhombus diamond cube sphere cylinder cone pyramid heart arrow checkmark check cross spiral crescent shape polygon",
  '음악': "music note guitar piano drum violin trumpet flute saxophone harp tambourine xylophone microphone headphone speaker clef accordion cello banjo",
  '체육': "soccer ball trophy flag dumbbell basketball baseball football tennis racket bat golf bowling skate ski surfboard medal whistle goal net hockey volleyball boxing glove dart kite",
  '언어': "letter alphabet number numeral digit abc",
};
const CAT_SETS = {}; for (const k in CATEGORY_KEYWORDS) CAT_SETS[k] = new Set(CATEGORY_KEYWORDS[k].split(' '));
const EXPLICIT = { 'ice cream cone': '생활', 'pizza slice': '생활', 'bread loaf': '생활', 'pine cone': '생물', 'palm tree': '생물', 'light bulb': '생활', 'human eye': '생물', 'human skull': '생물', 'lightning bolt': '사회', 'crescent moon': '사회', 'test tube': '과학', 'horseshoe magnet': '과학', 'music note': '음악', 'soccer ball': '체육', 'bar chart': '수학', 'line graph': '수학', 'pie chart': '수학', 'coordinate plane': '수학', 'tyrannosaurus rex': '생물' };
const CAT_ORDER = ['생물', '도형', '수학', '음악', '체육', '과학', '사회', '언어', '생활'];
const SITE_CATEGORIES = ['수학', '과학', '사회', '역사', '지리', '생물', '음악', '미술', '체육', '언어', '생활', '교통', '도형', '기호', '유틸리티', '기타'];
function categorize(name, def = '기타') {
  const low = String(name).toLowerCase().trim();
  if (EXPLICIT[low]) return EXPLICIT[low];
  const words = new Set((low.match(/[a-z]+/g) || []));
  if (!words.size) return def;
  for (const cat of CAT_ORDER) for (const w of words) if (CAT_SETS[cat].has(w)) return cat;
  const singular = new Set(); for (const w of words) if (w.endsWith('s') && w.length > 3) singular.add(w.slice(0, -1));
  for (const cat of CAT_ORDER) for (const w of singular) if (CAT_SETS[cat].has(w)) return cat;
  return def;
}
const siteCategory = kw => { const c = categorize(kw); return SITE_CATEGORIES.includes(c) ? c : '기타'; };

/* ---------- Iconify 수급 ---------- */
const PREFER_PREFIXES = ['openmoji', 'game-icons', 'twemoji', 'material-symbols', 'noto',
  'mdi', 'fluent-emoji', 'fa6-solid', 'streamline-emojis', 'fa-solid', 'ic', 'ph', 'tabler'];
function faceFirst(list) {
  return list.slice().sort((a, b) => {
    const fa = (a.includes('face') || a.includes('head')) ? 0 : 1;
    const fb = (b.includes('face') || b.includes('head')) ? 0 : 1;
    return fa - fb;
  });
}
function rankCandidates(icons, n) {
  if (!icons.length) return [];
  const byPref = {}; for (const p of PREFER_PREFIXES) byPref[p] = faceFirst(icons.filter(ic => ic.startsWith(p + ':')));
  const other = faceFirst(icons.filter(ic => !PREFER_PREFIXES.some(p => ic.startsWith(p + ':'))));
  const ranked = []; let round = 0;
  while (ranked.length < icons.length) {
    let added = false;
    for (const p of PREFER_PREFIXES) { const lst = byPref[p]; if (round < lst.length) { ranked.push(lst[round]); added = true; } }
    if (round < other.length) { ranked.push(other[round]); added = true; }
    if (!added) break; round++;
  }
  return ranked.slice(0, Math.max(1, n));
}
async function searchCandidates(keyword, n = 10) {
  const url = `https://api.iconify.design/search?query=${encodeURIComponent(keyword)}&limit=60`;
  const data = await fetch(url).then(r => r.json());
  return rankCandidates(data.icons || [], n);
}
async function fetchIconImage(iconId) {     // → HTMLImageElement (흰배경 합성은 rasterize가)
  const [prefix, name] = iconId.split(/:(.+)/);
  let svg = await fetch(`https://api.iconify.design/${prefix}/${name}.svg?height=480`).then(r => r.text());
  svg = svg.replace(/currentColor/g, '#000000');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

/* ---------- 미리보기 (biocode 톤) ---------- */
function previewDataURL(g, scale = 6, pad = 4) {
  const c = document.createElement('canvas'); c.width = W * scale + pad * 2; c.height = H * scale + pad * 2;
  const ctx = c.getContext('2d'); ctx.fillStyle = 'rgb(20,18,15)'; ctx.fillRect(0, 0, c.width, c.height);
  const rOn = Math.max(2, (scale >> 1) - 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = pad + x * scale + (scale >> 1), cy = pad + y * scale + (scale >> 1);
    ctx.beginPath();
    if (g[y][x]) { ctx.fillStyle = 'rgb(232,227,213)'; ctx.arc(cx, cy, rOn, 0, 7); }
    else { ctx.fillStyle = 'rgb(45,42,36)'; ctx.arc(cx, cy, 1, 0, 7); }
    ctx.fill();
  }
  return c.toDataURL('image/png');
}

/* ---------- 한 키워드 → 후보들 (앱이 호출) ---------- */
async function generateCandidates(keyword, profile, onProgress) {
  const icons = await searchCandidates(keyword, 10);
  if (!icons.length) return { keyword, candidates: [], error: `'${keyword}' 아이콘을 찾지 못했어요. 영어 키워드를 권장합니다.` };
  const out = []; let failed = 0, doneN = 0;
  for (const icon of icons) {
    try {
      const img = await fetchIconImage(icon);
      const id = rasterize(img, 480);
      const best = convertBest(id, profile);
      if (!best) { failed++; continue; }
      out.push({ icon, mode: best.mode, score: best.s, likeness: best.likeness,
        hex: toHex(best.g), preview: previewDataURL(best.g) });
    } catch (e) { failed++; }
    if (onProgress) onProgress(++doneN, icons.length);
  }
  out.sort((a, b) => ((b.likeness || 0) - (a.likeness || 0)) || (b.score - a.score));
  return { keyword, suggested_title: keyword.trim().replace(/\b\w/g, c => c.toUpperCase()),
    suggested_category: siteCategory(keyword), candidates: out, failed };
}

window.AutoTactile = { generateCandidates, categorize, siteCategory, SITE_CATEGORIES, W, H, toHex };
})();
