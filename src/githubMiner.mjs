import { execFile } from 'node:child_process';

/**
 * Pain Wedge Categories: maps raw GitHub complaints into actionable product wedges
 */
export const PAIN_CATEGORIES = [
  {
    id: 'missing_feature',
    icon: '🧩',
    label: '高频刚需长期缺失',
    desc: '大量用户投票跪求但官方迟迟不做的核心功能',
    keywords: ['support', 'feature', 'add ', 'allow', 'please', 'template', 'export', 'import', 'plugin', 'api', 'table', 'sync', 'webhook', 'mcp'],
  },
  {
    id: 'setup_os',
    icon: '🪟',
    label: '安装劝退 / 跨平台兼容差',
    desc: 'Windows 报错、Docker 繁琐、环境配置劝退普通用户',
    keywords: ['windows', 'install', 'setup', 'docker', 'build', 'compile', 'path', 'wsl', 'macos', 'linux', 'arm64', 'portable', 'exe'],
  },
  {
    id: 'bloat_perf',
    icon: '🐢',
    label: '臃肿卡顿 / 内存CPU暴涨',
    desc: '启动慢、吃内存、发热严重，极适合用轻量方案降维打击',
    keywords: ['slow', 'memory', 'ram', 'cpu', 'lag', 'performance', 'freeze', 'heavy', 'bloat', 'leak', 'high usage', 'hang', 'startup'],
  },
  {
    id: 'cloud_paywall',
    icon: '🔒',
    label: '强绑云端 / 离线受限 / 收费墙',
    desc: '强制登录、隐私上传、API 限制或昂贵订阅，适合本地优先平替',
    keywords: ['offline', 'local', 'self-host', 'privacy', 'login', 'account', 'cloud', 'limit', 'quota', 'pricing', 'free', 'openkey', 'ollama'],
  },
  {
    id: 'bug_crash',
    icon: '🐛',
    label: '核心报错 / 稳定性硬伤',
    desc: '高频崩溃、丢数据或关键链路失效',
    keywords: ['bug', 'crash', 'error', 'fail', 'broken', 'not working', 'exception', 'corrupt', 'lost', 'blank', '500', 'timeout'],
  },
  {
    id: 'ux_dx',
    icon: '🎨',
    label: '交互反人类 / 中文体验差',
    desc: '快捷键别扭、UI 复杂难用、多语言/中文排版乱码',
    keywords: ['ui', 'ux', 'dark mode', 'shortcut', 'hotkey', 'font', 'chinese', 'cjk', 'i18n', 'language', 'mobile', 'responsive', 'confusing'],
  },
];

export const NICHE_PRESETS = {
  ai_agent: { label: '🤖 AI Agent & 自动化', query: 'agent OR mcp stars:1500..45000' },
  canvas_notes: { label: '📝 白板 / 笔记 / 知识库', query: 'whiteboard OR markdown OR notes stars:2000..80000' },
  dev_cli: { label: '🛠️ 开发者工具 & CLI', query: 'cli OR terminal OR devtools stars:1500..40000' },
  media_video: { label: '🎬 音视频 / 字幕 / 创作', query: 'video OR tts OR subtitle OR audio stars:1500..45000' },
  desktop_app: { label: '💻 桌面效率工具', query: 'desktop OR launcher OR clipboard stars:1500..45000' },
};

function ghApiJson(endpoint, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['api', endpoint],
      { timeout: timeoutMs, maxBuffer: 12 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || 'gh api failed').trim()));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseErr) {
          reject(new Error(`Failed to parse GitHub response: ${parseErr.message}`));
        }
      }
    );
  });
}

export function parseRepoSlug(input = '') {
  const cleaned = String(input).trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const urlMatch = cleaned.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned)) return cleaned;
  throw new Error('请输入合法的 GitHub 仓库名（如 excalidraw/excalidraw）或完整 GitHub 网址');
}

export function classifyIssue(title = '', body = '', labels = []) {
  const text = `${title} ${labels.join(' ')} ${(body || '').slice(0, 600)}`.toLowerCase();
  const matched = [];

  for (const cat of PAIN_CATEGORIES) {
    let hits = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) hits++;
    }
    if (hits > 0) matched.push({ id: cat.id, hits });
  }

  matched.sort((a, b) => b.hits - a.hits);
  return matched.length > 0 ? matched[0].id : 'missing_feature';
}

export function computeOpportunityScore({ stars, openIssues, topIssues }) {
  // 1. Market validation (0..28): sweet spot 1k..80k stars
  const starScore = Math.min(28, Math.round(Math.log10(Math.max(10, stars)) * 6.2));
  // 2. Backlog pressure (0..22)
  const backlogScore = Math.min(22, Math.round(Math.log10(Math.max(5, openIssues)) * 7.5));
  // 3. Acute user pain votes on top 10 unresolved issues (0..32)
  const top10Votes = topIssues.slice(0, 10).reduce((acc, it) => acc + it.thumbsUp + it.negVotes * 2, 0);
  const voteScore = Math.min(32, Math.round(Math.log10(Math.max(1, top10Votes + 1)) * 11.5));
  // 4. Maintainer neglect / staleness on top 10 issues (0..18)
  const avgStale =
    topIssues.length > 0
      ? topIssues.slice(0, 10).reduce((acc, it) => acc + it.staleDays, 0) / Math.min(10, topIssues.length)
      : 0;
  const neglectScore = Math.min(18, Math.round(avgStale / 25));

  const total = Math.min(99, Math.max(15, starScore + backlogScore + voteScore + neglectScore));
  let verdict = '中等切入机会';
  if (total >= 82) verdict = '🔥 黄金降维打击靶标（需求极大且官方长期积压痛点）';
  else if (total >= 68) verdict = '⚡ 优质差异化切入点（存在明显未满足刚需）';

  return {
    score: total,
    verdict,
    top10Votes,
    avgStaleDays: Math.round(avgStale),
  };
}

export function buildInstantBlueprint(repo, clusters, topIssues, opp) {
  const sortedClusters = [...clusters].sort((a, b) => b.totalWeight - a.totalWeight);
  const primary = sortedClusters[0];
  const secondary = sortedClusters[1];
  const top3 = topIssues.slice(0, 3);

  const wedgeLines = [
    `1. **核心破局定位**：做一个轻量、开箱即用、原生体验拉满的「${repo.name} 极速增强平替」，直接死磕原版呼声最高却拖延了平均 **${opp.avgStaleDays} 天** 未解决的痛点。`,
    primary
      ? `2. **头号痛点狙击（${primary.icon} ${primary.label} · ${primary.count} 个高赞未解 Issue）**：优先把 ${primary.issues
          .slice(0, 2)
          .map((i) => `#${i.number} (${i.thumbsUp}👍 "${i.title.slice(0, 42)}")`)
          .join(' 与 ')} 做成开箱默认内置能力。`
      : '',
    secondary
      ? `3. **第二差异化护城河（${secondary.icon} ${secondary.label}）**：针对 ${secondary.issues
          .slice(0, 2)
          .map((i) => `#${i.number} (${i.thumbsUp}👍)`)
          .join('、')}，提供零配置本地运行 + 原生中文与现代化交互体验。`
      : '',
  ].filter(Boolean);

  const buildPrompt = `我们要基于真实 GitHub 用户痛点，打造一个超越 \`${repo.fullName}\` (${repo.stars.toLocaleString()}★) 的轻量级差异化新项目！

### 原版真实高赞未解决痛点铁证：
${top3
  .map(
    (it, idx) =>
      `${idx + 1}. Issue #${it.number} [${it.thumbsUp}👍 / ${it.comments}条评论 / 拖延${it.staleDays}天]：${it.title}`
  )
  .join('\n')}

### 我们的降维打击 MVP 目标：
1. 零复杂配置（拒绝繁琐 Docker/重度依赖），单命令或纯浏览器开箱即用；
2. 原生内置解决上述 Top 3 用户呼声最高的核心痛点，做成第一屏核心卖点；
3. 提供极致清爽的现代中文/双语界面、完整自动化测试与一键部署配置。

请先设计清晰的目录结构与核心模块，直接搭建出可本地运行验证的 v1.0 完整项目！`;

  return {
    headline: `针对 ${repo.fullName} 的「${primary?.label || '核心痛点'}」降维平替方案`,
    bullets: wedgeLines,
    buildPrompt,
  };
}

export async function discoverTargetRepos(presetOrKeyword = 'ai_agent') {
  const preset = NICHE_PRESETS[presetOrKeyword];
  const rawQuery = preset ? preset.query : `${presetOrKeyword} stars:>500`;
  const q = encodeURIComponent(`${rawQuery} archived:false`);
  const data = await ghApiJson(`search/repositories?q=${q}&sort=updated&order=desc&per_page=16`);

  return (data.items || [])
    .filter((r) => (r.open_issues_count || 0) >= 15)
    .map((r) => {
      const issueRatio = Math.min(40, Math.round(Math.log10(Math.max(10, r.open_issues_count)) * 12));
      const starBase = Math.min(55, Math.round(Math.log10(Math.max(50, r.stargazers_count)) * 11.5));
      return {
        fullName: r.full_name,
        name: r.name,
        description: r.description || '暂无简介',
        stars: r.stargazers_count,
        openIssues: r.open_issues_count,
        language: r.language || 'Unknown',
        hintScore: Math.min(98, issueRatio + starBase),
      };
    })
    .sort((a, b) => b.openIssues - a.openIssues)
    .slice(0, 10);
}

export async function mineRepoPains(repoInput) {
  const slug = parseRepoSlug(repoInput);

  const [repoRaw, byUpvotes, byComments] = await Promise.all([
    ghApiJson(`repos/${slug}`),
    ghApiJson(`search/issues?q=repo:${slug}+is:issue+is:open&sort=reactions-%2B1&order=desc&per_page=25`),
    ghApiJson(`search/issues?q=repo:${slug}+is:issue+is:open&sort=comments&order=desc&per_page=15`),
  ]);

  const mergedMap = new Map();
  for (const item of [...(byUpvotes.items || []), ...(byComments.items || [])]) {
    if (item.pull_request) continue;
    if (!mergedMap.has(item.number)) mergedMap.set(item.number, item);
  }

  const now = Date.now();
  const normalizedIssues = [...mergedMap.values()].map((it) => {
    const rx = it.reactions || {};
    const thumbsUp = rx['+1'] || 0;
    const negVotes = (rx['-1'] || 0) + (rx.confused || 0);
    const heartRocket = (rx.heart || 0) + (rx.rocket || 0) + (rx.hooray || 0);
    const staleDays = Math.max(1, Math.round((now - new Date(it.created_at).getTime()) / 86400000));
    const labels = (it.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
    const category = classifyIssue(it.title, it.body, labels);
    const severity = Math.round(
      thumbsUp * 3.2 + negVotes * 4.5 + heartRocket * 1.5 + (it.comments || 0) * 1.4 + Math.min(30, staleDays / 25)
    );

    return {
      number: it.number,
      title: it.title,
      url: it.html_url,
      thumbsUp,
      negVotes,
      comments: it.comments || 0,
      staleDays,
      createdAt: it.created_at.slice(0, 10),
      labels: labels.slice(0, 4),
      category,
      severity,
      excerpt: String(it.body || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 260),
      topQuotes: [],
    };
  });

  normalizedIssues.sort((a, b) => b.severity - a.severity);
  const topIssues = normalizedIssues.slice(0, 24);

  // Fetch real frustrated user comments on the Top 3 highest-severity issues!
  await Promise.all(
    topIssues.slice(0, 3).map(async (iss) => {
      try {
        const comments = await ghApiJson(`repos/${slug}/issues/${iss.number}/comments?per_page=8`, 8000);
        if (Array.isArray(comments)) {
          iss.topQuotes = comments
            .filter((c) => c.body && c.body.trim().length > 18 && !/bot/i.test(c.user?.login || ''))
            .sort((a, b) => ((b.reactions?.['+1'] || 0) - (a.reactions?.['+1'] || 0)))
            .slice(0, 2)
            .map((c) => ({
              user: c.user?.login || 'user',
              likes: c.reactions?.['+1'] || 0,
              text: String(c.body).replace(/\s+/g, ' ').trim().slice(0, 180),
            }));
        }
      } catch {
        // ignore rate/comment fetch errors on individual issue
      }
    })
  );

  // Build 6-Category Cluster Summary
  const clusters = PAIN_CATEGORIES.map((cat) => {
    const matched = topIssues.filter((i) => i.category === cat.id);
    const totalVotes = matched.reduce((s, i) => s + i.thumbsUp + i.negVotes, 0);
    const totalWeight = matched.reduce((s, i) => s + i.severity, 0);
    return {
      ...cat,
      count: matched.length,
      totalVotes,
      totalWeight,
      issues: matched,
    };
  });

  const repoInfo = {
    fullName: repoRaw.full_name,
    name: repoRaw.name,
    description: repoRaw.description || '',
    url: repoRaw.html_url,
    homepage: repoRaw.homepage || '',
    stars: repoRaw.stargazers_count || 0,
    forks: repoRaw.forks_count || 0,
    openIssues: repoRaw.open_issues_count || 0,
    language: repoRaw.language || 'Multi',
    license: repoRaw.license?.spdx_id || 'Unknown',
    topics: repoRaw.topics || [],
    pushedAt: (repoRaw.pushed_at || '').slice(0, 10),
  };

  const opportunity = computeOpportunityScore({
    stars: repoInfo.stars,
    openIssues: repoInfo.openIssues,
    topIssues,
  });

  const instantBlueprint = buildInstantBlueprint(repoInfo, clusters, topIssues, opportunity);

  return {
    minedAt: new Date().toISOString(),
    repo: repoInfo,
    opportunity,
    clusters,
    topIssues,
    instantBlueprint,
  };
}
