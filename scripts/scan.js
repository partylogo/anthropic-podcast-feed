#!/usr/bin/env node
// scan-podcasts.js — 抓 RSS feed，append 新 episode 到 episodes.jsonl
//
// 用法：node scripts/scan-podcasts.js
// 設計：append-only，用 guid 去重，永遠不重抓已知集數

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const FEEDS_PATH = path.join(__dirname, '..', 'data', 'feeds.json');
const EP_PATH = path.join(__dirname, '..', 'data', 'episodes.jsonl');

const feeds = JSON.parse(fs.readFileSync(FEEDS_PATH, 'utf8'));

// 讀已知 guid（dedup）
const known = new Set();
if (fs.existsSync(EP_PATH)) {
  for (const line of fs.readFileSync(EP_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { known.add(JSON.parse(line).guid); } catch {}
  }
}
console.log(`[init] ${known.size} episodes already known`);

const parser = new Parser({ timeout: 30000, headers: { 'User-Agent': 'anthropic-digest-scanner/1.0' } });
const out = fs.createWriteStream(EP_PATH, { flags: 'a' });

let totalNew = 0;

(async () => {
  for (const feed of feeds) {
    try {
      const f = await parser.parseURL(feed.url);
      let added = 0;
      for (const item of (f.items || [])) {
        const guid = item.guid || item.id || item.link;
        if (!guid || known.has(guid)) continue;
        const row = {
          guid,
          feed: feed.name,
          feed_url: feed.url,
          title: item.title || '',
          link: item.link || '',
          pub_date: item.isoDate || item.pubDate || new Date().toISOString(),
          description: (item.contentSnippet || item.content || item.summary || '').slice(0, 2000),
          author: item.creator || item.author || '',
          scanned_at: new Date().toISOString(),
        };
        out.write(JSON.stringify(row) + '\n');
        known.add(guid);
        added++;
      }
      console.log(`[${feed.name}] +${added} new (total feed items: ${f.items?.length || 0})`);
      totalNew += added;
    } catch (e) {
      console.log(`[${feed.name}] ERR: ${e.message}`);
    }
  }
  out.end();
  console.log(`[done] +${totalNew} new episodes → ${EP_PATH}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
