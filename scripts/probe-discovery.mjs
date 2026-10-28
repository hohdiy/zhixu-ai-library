import fs from 'node:fs/promises';
import { testModules } from './test-module-loader.mjs';
const modules = await testModules();
try {
  const { discoverFeed } = await modules.load('lib/feed-discovery.ts');
  const feeds = JSON.parse(await fs.readFile(new URL('../data/feed-registry.json', import.meta.url), 'utf8')).filter(f => f.priority === 'core' && f.following);
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < feeds.length) {
      const feed = feeds[cursor++];
      try { const found = await discoverFeed(feed); console.log(JSON.stringify({ id: feed.id, count: found.length, first: found[0] })); }
      catch (e) { console.log(JSON.stringify({ id: feed.id, error: e.message })); }
    }
  }));
} finally { await modules.cleanup(); }
