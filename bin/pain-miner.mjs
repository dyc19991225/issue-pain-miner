#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPainMinerServer } from '../src/server.mjs';
import { mineRepoPains } from '../src/githubMiner.mjs';
import { runAiStrategist } from '../src/aiStrategist.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const sub = args[0] || 'up';

if (sub === 'analyze' && args[1]) {
  const repoSlug = args[1];
  const useAi = args.includes('--ai');
  const engineIdx = args.indexOf('--ai');
  const engine = engineIdx >= 0 && args[engineIdx + 1] && !args[engineIdx + 1].startsWith('-') ? args[engineIdx + 1] : 'claude';

  console.error(`🔍 正在从 GitHub 抓取 ${repoSlug} 的高赞未解决痛点 Issues...`);
  const report = await mineRepoPains(repoSlug);
  console.log(`# 🔍 ${report.repo.fullName} 竞品痛点挖掘报告`);
  console.log(`- ⭐ Stars: ${report.repo.stars.toLocaleString()} | 未解决 Issues: ${report.repo.openIssues.toLocaleString()}`);
  console.log(`- 🎯 商机指数: **${report.opportunity.score} / 100** (${report.opportunity.verdict})`);
  console.log(`- ⏳ Top10 痛点平均拖延: **${report.opportunity.avgStaleDays} 天**\n`);
  console.log(`## Top 8 高赞未解决痛点 Issues`);
  for (const it of report.topIssues.slice(0, 8)) {
    console.log(`- **#${it.number}** [${it.thumbsUp}👍 / ${it.comments}💬 / 拖延${it.staleDays}天] ${it.title} (${it.url})`);
  }
  if (useAi) {
    console.error(`\n🧠 正在调用本地 ${engine} 生成《超越原版降维打击立项书》...`);
    const prd = await runAiStrategist({ engine, report });
    console.log(`\n---\n\n${prd.markdown}`);
  } else {
    console.log(`\n## ⚡ 快速破局建议\n${report.instantBlueprint.bullets.join('\n')}`);
  }
  process.exit(0);
}

let port = 4795;
const pIdx = args.indexOf('--port');
if (pIdx >= 0 && args[pIdx + 1]) port = Number(args[pIdx + 1]) || 4795;

const { server } = createPainMinerServer({ rootDir, port });
server.listen(port, '127.0.0.1', () => {
  console.log(`\n🔍 Issue Pain Miner v1.0 — GitHub 竞品痛点挖掘机 & AI 立项工作台`);
  console.log(`──────────────────────────────────────────────────────────────`);
  console.log(`  🌐 Web 工作台地址 : http://127.0.0.1:${port}/`);
  console.log(`  💻 CLI 速查用法   : node bin/pain-miner.mjs analyze excalidraw/excalidraw --ai claude`);
  console.log(`──────────────────────────────────────────────────────────────\n`);
});
