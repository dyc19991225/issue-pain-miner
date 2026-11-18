import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseRepoSlug,
  classifyIssue,
  computeOpportunityScore,
  buildInstantBlueprint,
} from '../src/githubMiner.mjs';
import { createPainMinerServer } from '../src/server.mjs';

test('parseRepoSlug accepts owner/repo and full GitHub URLs', () => {
  assert.equal(parseRepoSlug('excalidraw/excalidraw'), 'excalidraw/excalidraw');
  assert.equal(parseRepoSlug('https://github.com/ollama/ollama/'), 'ollama/ollama');
  assert.throws(() => parseRepoSlug('not-a-repo'));
});

test('classifyIssue & computeOpportunityScore categorize real complaints accurately', () => {
  assert.equal(classifyIssue('High memory usage and slow startup on large files', '', []), 'bloat_perf');
  assert.equal(classifyIssue('Windows 11 install fails with path error', '', ['os:windows']), 'setup_os');
  assert.equal(classifyIssue('Allow offline mode without cloud account login', '', []), 'cloud_paywall');

  const opp = computeOpportunityScore({
    stars: 42000,
    openIssues: 950,
    topIssues: Array.from({ length: 10 }, (_, i) => ({
      number: 100 + i,
      title: 'Please support table templates',
      thumbsUp: 120,
      negVotes: 5,
      comments: 45,
      staleDays: 600,
    })),
  });
  assert.ok(opp.score >= 80 && opp.score <= 99);
  assert.equal(opp.avgStaleDays, 600);
});

test('Pain Miner HTTP server mines, caches, and retrieves saved competitor reports', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-miner-test-'));
  const mockMiner = async (slug) => {
    const repo = {
      fullName: slug,
      name: slug.split('/')[1],
      description: 'Mock whiteboard tool',
      url: `https://github.com/${slug}`,
      stars: 50000,
      forks: 4000,
      openIssues: 800,
      language: 'TypeScript',
      license: 'MIT',
    };
    const topIssues = [
      {
        number: 4847,
        title: 'Please add a table template',
        url: `https://github.com/${slug}/issues/4847`,
        thumbsUp: 260,
        negVotes: 0,
        comments: 147,
        staleDays: 980,
        category: 'missing_feature',
        severity: 950,
        excerpt: 'Users desperately want native tables',
        topQuotes: [{ user: 'alice', likes: 24, text: 'Still waiting after 3 years!' }],
      },
    ];
    const clusters = [
      { id: 'missing_feature', icon: '🧩', label: '高频刚需长期缺失', count: 1, totalVotes: 260, totalWeight: 950, issues: topIssues },
    ];
    const opportunity = computeOpportunityScore({ stars: 50000, openIssues: 800, topIssues });
    return {
      minedAt: new Date().toISOString(),
      repo,
      opportunity,
      clusters,
      topIssues,
      instantBlueprint: buildInstantBlueprint(repo, clusters, topIssues, opportunity),
    };
  };

  const { server, closeAll } = createPainMinerServer({ rootDir: tmpDir, mockMiner });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const mRes = await fetch(`${base}/api/mine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'excalidraw/excalidraw' }),
    });
    const mData = await mRes.json();
    assert.equal(mData.ok, true);
    assert.equal(mData.report.topIssues[0].number, 4847);
    assert.equal(mData.savedReports.length, 1);

    const gRes = await fetch(`${base}/api/report?repo=excalidraw/excalidraw`);
    const gData = await gRes.json();
    assert.equal(gData.ok, true);
    assert.equal(gData.report.repo.fullName, 'excalidraw/excalidraw');
  } finally {
    await closeAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
