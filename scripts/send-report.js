#!/usr/bin/env node
/* scripts/send-report.js
   매일 자가학습 현황 보고서를 이메일로 발송 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REPORT_TO    = process.env.REPORT_TO || 'mason@dotincorp.com';

const W = 60, H = 40;
const LEFT_BITS  = [0, 1, 2, 3];
const RIGHT_BITS = [4, 5, 6, 7];

function hexToGrid(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  const g = Array.from({ length: H }, () => new Array(W).fill(0));
  for (let cr = 0; cr < 10; cr++) for (let cc = 0; cc < 30; cc++) {
    const b = bytes[cr * 30 + cc];
    for (let side = 0; side < 2; side++) {
      const bits = side === 0 ? LEFT_BITS : RIGHT_BITS;
      for (let r = 0; r < 4; r++) if (b & (1 << bits[r])) g[cr * 4 + r][cc * 2 + side] = 1;
    }
  }
  return g;
}

function gridStats(g) {
  let dots = 0;
  for (const row of g) for (const v of row) dots += v;
  if (dots === 0) return null;
  return { dots, coverage: +(dots / (W * H)).toFixed(4) };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('SUPABASE_URL 또는 SUPABASE_ANON_KEY 없음'); process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { transport: ws } });
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 전체 공개 그래픽 수
  const { count: totalCount } = await sb.from('graphics')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');

  // 오늘 새로 추가된 그래픽
  const { data: todayData, count: todayCount } = await sb.from('graphics')
    .select('title, category, icon_source', { count: 'exact' })
    .eq('status', 'published')
    .gte('published_at', today + 'T00:00:00Z')
    .order('published_at', { ascending: false })
    .limit(20);

  // 카테고리별 집계
  const { data: allData } = await sb.from('graphics')
    .select('category, items')
    .eq('status', 'published')
    .limit(1000);

  const catCount = {};
  const allStats = [];
  for (const row of (allData || [])) {
    const cat = row.category || '기타';
    catCount[cat] = (catCount[cat] || 0) + 1;
    if (row.items?.[0]?.data) {
      try {
        const st = gridStats(hexToGrid(row.items[0].data));
        if (st) allStats.push(st);
      } catch (e) {}
    }
  }

  // 품질 통계
  const coverages = allStats.map(s => s.coverage);
  const avgCoverage = coverages.length ? (coverages.reduce((a, b) => a + b, 0) / coverages.length).toFixed(4) : 'N/A';
  const avgDots = allStats.length ? Math.round(allStats.reduce((a, s) => a + s.dots, 0) / allStats.length) : 'N/A';

  // reference_profile 읽기
  let profileInfo = '';
  try {
    const profilePath = path.join(__dirname, '..', 'reference_profile.json');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    profileInfo = `샘플 수: ${profile.n}개 | 갱신: ${profile.updated_at.slice(0, 16)}`;
  } catch (e) {}

  // 카테고리 테이블 HTML
  const catRows = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, cnt]) => `<tr><td style="padding:4px 12px">${cat}</td><td style="padding:4px 12px;text-align:right"><b>${cnt}</b>개</td></tr>`)
    .join('');

  // 오늘 추가된 그래픽 목록
  const todayRows = (todayData || []).slice(0, 10)
    .map(r => `<tr><td style="padding:4px 12px">${r.title || '-'}</td><td style="padding:4px 12px;color:#666">${r.category || '-'}</td><td style="padding:4px 12px;color:#999;font-size:12px">${r.icon_source || '-'}</td></tr>`)
    .join('') || '<tr><td colspan="3" style="padding:8px 12px;color:#999">오늘 새로 추가된 그래픽 없음</td></tr>';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; color: #222; background: #f9f9f9; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; color: #666; font-weight: 400; margin: 0 0 16px; }
  .stat { display: inline-block; margin-right: 24px; }
  .stat .val { font-size: 28px; font-weight: 700; color: #FF4F00; }
  .stat .lbl { font-size: 12px; color: #999; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  tr:nth-child(even) { background: #f5f5f5; }
  .badge { display: inline-block; background: #FF4F00; color: #fff; border-radius: 6px; padding: 2px 8px; font-size: 11px; }
</style></head>
<body>
  <div class="card">
    <h1>🤖 Auto Tactile 자가학습 보고서</h1>
    <h2>${today} 기준 | ${profileInfo}</h2>
    <div>
      <div class="stat"><div class="val">${totalCount || 0}</div><div class="lbl">총 공개 그래픽</div></div>
      <div class="stat"><div class="val">${todayCount || 0}</div><div class="lbl">오늘 추가</div></div>
      <div class="stat"><div class="val">${(Number(avgCoverage) * 100).toFixed(1)}%</div><div class="lbl">평균 coverage</div></div>
      <div class="stat"><div class="val">${avgDots}</div><div class="lbl">평균 dots</div></div>
    </div>
  </div>

  <div class="card">
    <h2>📂 카테고리별 현황</h2>
    <table>${catRows}</table>
  </div>

  <div class="card">
    <h2>✨ 오늘 추가된 그래픽 (최대 10개)</h2>
    <table>
      <tr style="color:#999;font-size:12px"><td style="padding:4px 12px">제목</td><td style="padding:4px 12px">카테고리</td><td style="padding:4px 12px">아이콘</td></tr>
      ${todayRows}
    </table>
  </div>

  <p style="color:#ccc;font-size:12px;text-align:center">Auto Tactile · auto-tactile GitHub Actions · 매일 UTC 03:00 발송</p>
</body>
</html>`;

  // Resend API로 이메일 발송
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY 없음 — 보고서 내용만 출력:');
    console.log(`총 공개: ${totalCount}, 오늘 추가: ${todayCount}, 평균 coverage: ${avgCoverage}`);
    return;
  }

  const payload = JSON.stringify({
    from: 'Auto Tactile <onboarding@resend.dev>',
    to: [REPORT_TO],
    subject: `[Auto Tactile] 자가학습 보고서 ${today} — 총 ${totalCount}개, 오늘 +${todayCount}개`,
    html
  });

  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ 보고서 발송 완료 → ${REPORT_TO} (HTTP ${res.statusCode})`);
          resolve();
        } else {
          reject(new Error(`Resend API 오류 ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  console.log(`   총 ${totalCount}개, 오늘 +${todayCount}개, 평균 coverage ${avgCoverage}`);
}

main().catch(e => { console.error(e); process.exit(1); });
