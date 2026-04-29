#!/usr/bin/env node
// filter-podcasts.js — 純規則過濾（不需 API key）
// 讀 episodes.jsonl → 寫 episodes-curated.jsonl
//
// 規則：
//   strong：title 含 roster 任一名字 OR title 含 "Anthropic"
//   medium：description 第一段含 roster 任一名字 OR 含 "Anthropic"
//   weak：description 後段提及（可能只是 cite）
//   miss：完全沒命中
//
// 只有 strong + medium 寫入 curated（is_anthropic=true）。weak 標 false 但保留紀錄。

const fs = require('fs');
const path = require('path');

const ROSTER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/roster.json')));
const EP_PATH = path.join(__dirname, '..', 'data/episodes.jsonl');
const OUT_PATH = path.join(__dirname, '..', 'data/episodes-curated.jsonl');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const SINCE_DAYS = parseInt((args.since || '60d').replace('d',''), 10);
const SINCE = new Date(Date.now() - SINCE_DAYS * 86400_000);

// 已 curated guid → skip
const done = new Set();
if (fs.existsSync(OUT_PATH)) {
  for (const line of fs.readFileSync(OUT_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).guid); } catch {}
  }
}
console.log(`[init] ${done.size} episodes already filtered`);

// 名字匹配工具
function namesIn(text, names) {
  const matched = [];
  for (const r of ROSTER) {
    const candidates = [r.name, ...(r.aliases || [])];
    for (const c of candidates) {
      if (!c || c.length < 3) continue;
      const re = new RegExp(`\\b${escapeRe(c)}\\b`, 'i');
      if (re.test(text)) {
        matched.push(r.name);
        break;
      }
    }
  }
  return matched;
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const ANTHROPIC_RE = /\bAnthropic\b/i;

// 處理
const out = fs.createWriteStream(OUT_PATH, { flags: 'a' });
const stats = { processed: 0, strong: 0, medium: 0, weak: 0, miss: 0 };
const hits = [];

for (const line of fs.readFileSync(EP_PATH, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let ep;
  try { ep = JSON.parse(line); } catch { continue; }
  if (done.has(ep.guid)) continue;
  if (new Date(ep.pub_date) < SINCE) continue;

  const title = ep.title || '';
  const desc = ep.description || '';
  const descHead = desc.slice(0, 500);
  const descTail = desc.slice(500);

  const titleNames = namesIn(title, ROSTER);
  const headNames = namesIn(descHead, ROSTER);
  const tailNames = namesIn(descTail, ROSTER);
  const allNames = [...new Set([...titleNames, ...headNames, ...tailNames])];

  const titleAnthropic = ANTHROPIC_RE.test(title);
  const headAnthropic = ANTHROPIC_RE.test(descHead);
  const tailAnthropic = ANTHROPIC_RE.test(descTail);

  let confidence, is_anthropic, reason;
  if (titleNames.length || titleAnthropic) {
    confidence = 'rule:strong';
    is_anthropic = true;
    reason = titleNames.length
      ? `title 含 ${titleNames.join(', ')}`
      : 'title 含 "Anthropic"';
  } else if (headNames.length || headAnthropic) {
    confidence = 'rule:medium';
    is_anthropic = true;
    reason = headNames.length
      ? `description 開頭含 ${headNames.join(', ')}`
      : 'description 開頭含 "Anthropic"';
  } else if (tailNames.length || tailAnthropic) {
    confidence = 'rule:weak';
    is_anthropic = false;  // 預設不算（多是 cite）
    reason = tailNames.length
      ? `description 後段提及 ${tailNames.join(', ')}（可能只是 cite）`
      : 'description 後段提及 "Anthropic"（可能只是 cite）';
  } else {
    confidence = 'miss';
    is_anthropic = false;
    reason = '無 roster / Anthropic 字串';
  }

  const row = {
    guid: ep.guid,
    feed: ep.feed,
    title: ep.title,
    link: ep.link,
    pub_date: ep.pub_date,
    is_anthropic,
    matched_names: allNames,
    confidence,
    reason,
    filtered_at: new Date().toISOString(),
  };
  out.write(JSON.stringify(row) + '\n');
  stats.processed++;
  if (is_anthropic) {
    if (confidence === 'rule:strong') stats.strong++;
    else stats.medium++;
    hits.push(`[${confidence}] ${ep.feed} | ${title.slice(0, 80)} → ${allNames.join(', ') || 'Anthropic mention'}`);
  } else if (confidence === 'rule:weak') stats.weak++;
  else stats.miss++;
}

out.end();
console.log(`[done] processed=${stats.processed} strong=${stats.strong} medium=${stats.medium} weak=${stats.weak} miss=${stats.miss}`);
if (hits.length) {
  console.log('\n=== HITS ===');
  for (const h of hits) console.log(h);
}
