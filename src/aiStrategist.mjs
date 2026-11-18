import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IS_WIN = process.platform === 'win32';
const ACTIVE_JOBS = new Map();

function findCli(bins, extraDirs = []) {
  const locator = IS_WIN ? 'where.exe' : 'which';
  for (const b of bins) {
    try {
      const out = execFileSync(locator, [b], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (out[0] && fs.existsSync(out[0])) return out[0];
    } catch {
      // ignore
    }
  }
  for (const d of extraDirs) {
    for (const b of bins) {
      const p = path.join(d, b);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export function detectAiEngines() {
  const npmBin = path.join(os.homedir(), 'AppData', 'Roaming', 'npm');
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const claudeExe = findCli(IS_WIN ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude'], [npmBin, localBin]);
  const codexExe = findCli(IS_WIN ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex'], [npmBin]);

  return {
    claude: { id: 'claude', name: 'Claude Code', installed: Boolean(claudeExe), exe: claudeExe },
    codex: { id: 'codex', name: 'OpenAI Codex', installed: Boolean(codexExe), exe: codexExe },
  };
}

export function cancelAiJob(jobId) {
  const kill = ACTIVE_JOBS.get(jobId);
  if (kill) {
    kill();
    ACTIVE_JOBS.delete(jobId);
    return true;
  }
  return false;
}

function quoteWin(arg) {
  const s = String(arg);
  if (!/[\s"&|<>^]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

export function buildStrategistPrompt(report) {
  const r = report.repo;
  const opp = report.opportunity;
  const issueLines = report.topIssues
    .slice(0, 12)
    .map((it, i) => {
      const quotes =
        it.topQuotes && it.topQuotes.length > 0
          ? `\n     用户吐槽原话: "${it.topQuotes[0].text}" (${it.topQuotes[0].likes}👍)`
          : '';
      return `${i + 1}. [#${it.number}] (${it.thumbsUp}👍 / ${it.comments}💬 / 已拖延${it.staleDays}天 / 分类:${it.category}) ${it.title}${
        it.excerpt ? `\n     摘要: ${it.excerpt.slice(0, 140)}` : ''
      }${quotes}`;
    })
    .join('\n');

  return `你是一位顶级独立开发者产品总监与架构师。请根据以下刚刚从 GitHub 实时抓取的 \`${r.fullName}\` 真实高赞未解决 Issues 数据，撰写一份一针见血、可直接落地执行的中文《超越原版降维打击立项书 (Giant-Killer Blueprint)》。

## 目标竞品情报
- 仓库：${r.fullName} (${r.stars}★, 未解决 Open Issues: ${r.openIssues}, 主语言: ${r.language}, 协议: ${r.license})
- 简介：${r.description}
- 商机评分：${opp.score}/100（Top10 痛点累计 ${opp.top10Votes} 赞，平均拖延 ${opp.avgStaleDays} 天未解决）

## 真实高赞未解决痛点样本（Top 12）：
${issueLines}

请严格用简洁犀利的中文 Markdown 输出以下 4 个部分（不要寒暄废话，必须引用上面的真实 #Issue 编号作为论据）：
1. **🩸 原版最致命的 3 大软肋**（指出原版为什么架构太重/历史包袱太深改不动，附具体 #Issue 号与赞数）
2. **🗡️ 我们的尖刀破局定位（The Wedge）**（给新项目起一个好记的英文代号 + 一句话定位：如何用极简零配置方案精准吃掉最痛的那批用户）
3. **⚡ 3 天可上线的 MVP 架构与 3 个必杀卖点**（推荐最轻快的技术栈，拒绝过度设计）
4. **🤖 一键建库开工 Prompt**（放在 \`\`\`text 代码块中，可直接复制给 Claude Code / Codex 立即从零写出完整可运行项目）`;
}

export function runAiStrategist({ jobId, engine = 'claude', report, onProgress }) {
  const engines = detectAiEngines();
  const chosen = engines[engine]?.installed ? engines[engine] : engines.claude.installed ? engines.claude : engines.codex;
  if (!chosen?.installed || !chosen.exe) {
    return Promise.reject(new Error('未检测到本地 claude 或 codex CLI'));
  }

  const prompt = buildStrategistPrompt(report);
  const tmpOut = path.join(os.tmpdir(), `pain-miner-${Date.now()}.md`);

  let args = [];
  if (chosen.id === 'claude') {
    args = [
      '-p',
      '--tools',
      '',
      '--max-turns',
      '1',
      '--strict-mcp-config',
      '--disable-slash-commands',
    ];
  } else {
    args = [
      'exec',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '-c',
      'approval_policy=never',
      '--output-last-message',
      tmpOut,
      '-',
    ];
  }

  return new Promise((resolve, reject) => {
    const isCmd = IS_WIN && chosen.exe.toLowerCase().endsWith('.cmd');
    const file = isCmd ? 'cmd.exe' : chosen.exe;
    const finalArgs = isCmd
      ? ['/d', '/s', '/c', `"${quoteWin(chosen.exe)} ${args.map(quoteWin).join(' ')}"`]
      : args;

    const child = spawn(file, finalArgs, {
      windowsHide: true,
      windowsVerbatimArguments: isCmd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const killTree = () => {
      try {
        if (IS_WIN && child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
        else child.kill('SIGKILL');
      } catch {}
    };
    if (jobId) ACTIVE_JOBS.set(jobId, killTree);

    const timeout = setTimeout(() => {
      killTree();
      reject(new Error('AI 推演超时 (120s)'));
    }, 120000);

    let stdout = '';
    let stderr = '';
    const started = Date.now();
    const hb = setInterval(() => {
      onProgress?.({ elapsedSec: Math.round((Date.now() - started) / 1000), chunk: '' });
    }, 3000);

    child.stdout.on('data', (c) => {
      const s = c.toString('utf8');
      stdout += s;
      onProgress?.({ elapsedSec: Math.round((Date.now() - started) / 1000), chunk: s });
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8');
    });

    child.stdin.write(prompt);
    child.stdin.end();

    child.on('close', (code) => {
      clearTimeout(timeout);
      clearInterval(hb);
      if (jobId) ACTIVE_JOBS.delete(jobId);

      let finalMarkdown = stdout.trim();
      if (chosen.id === 'codex' && fs.existsSync(tmpOut)) {
        finalMarkdown = fs.readFileSync(tmpOut, 'utf8').trim() || finalMarkdown;
        try { fs.unlinkSync(tmpOut); } catch {}
      }

      if (code !== 0 && !finalMarkdown) {
        reject(new Error((stderr || `AI CLI exited with code ${code}`).slice(0, 300)));
        return;
      }
      resolve({ engine: chosen.id, markdown: finalMarkdown, durationSec: +((Date.now() - started) / 1000).toFixed(1) });
    });
  });
}
