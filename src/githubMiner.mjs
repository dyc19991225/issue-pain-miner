import { execFile } from 'node:child_process';

export const PAIN_CATEGORIES = [
  {
    id: 'missing_feature',
    icon: '🧩',
    label: '缺核心功能',
    desc: '大量用户投票想要、但官方迟迟没做的实用功能',
    keywords: ['support', 'feature', 'add ', 'allow', 'please', 'template', 'export', 'import', 'plugin', 'api', 'table', 'sync', 'webhook', 'mcp', 'tabs', 'latex', 'highlight'],
  },
  {
    id: 'setup_os',
    icon: '🪟',
    label: '安装配置难',
    desc: 'Windows 报错、Docker 繁琐、环境搭建劝退普通人',
    keywords: ['windows', 'install', 'setup', 'docker', 'build', 'compile', 'path', 'wsl', 'macos', 'linux', 'arm64', 'portable', 'exe', 'self host', 'self-host'],
  },
  {
    id: 'bloat_perf',
    icon: '🐢',
    label: '卡顿占内存',
    desc: '启动慢、吃内存、大文件卡死，适合做轻量极速替代版',
    keywords: ['slow', 'memory', 'ram', 'cpu', 'lag', 'performance', 'freeze', 'heavy', 'bloat', 'leak', 'high usage', 'hang', 'startup'],
  },
  {
    id: 'cloud_paywall',
    icon: '🔒',
    label: '绑云端或贵',
    desc: '强制注册登录、不支持纯本地离线使用或限制太多',
    keywords: ['offline', 'local', 'privacy', 'login', 'account', 'cloud', 'limit', 'quota', 'pricing', 'free', 'ollama'],
  },
  {
    id: 'bug_crash',
    icon: '🐛',
    label: '报错与闪退',
    desc: '经常崩溃、报错或关键功能失灵',
    keywords: ['bug', 'crash', 'error', 'fail', 'broken', 'not working', 'exception', 'corrupt', 'lost', 'blank', '500', 'timeout'],
  },
  {
    id: 'ux_dx',
    icon: '🎨',
    label: '操作不好用',
    desc: '界面复杂、快捷键反直觉、中文排版或移动端体验差',
    keywords: ['ui', 'ux', 'dark mode', 'shortcut', 'hotkey', 'font', 'chinese', 'cjk', 'i18n', 'language', 'mobile', 'responsive', 'confusing', 'stylus', 'eraser'],
  },
];

export const NICHE_PRESETS = {
  ai_agent: { label: '🤖 AI 工具', query: 'agent OR mcp stars:1500..45000' },
  canvas_notes: { label: '📝 笔记与白板', query: 'whiteboard OR markdown OR notes stars:2000..150000' },
  dev_cli: { label: '🛠️ 开发者工具', query: 'cli OR terminal OR devtools stars:1500..45000' },
  media_video: { label: '🎬 音视频工具', query: 'video OR tts OR subtitle OR audio stars:1500..45000' },
  desktop_app: { label: '💻 桌面效率软件', query: 'desktop OR launcher OR clipboard stars:1500..45000' },
};

/**
 * Generates an instant plain-Chinese summary hint for common English GitHub issue titles
 * so non-native readers understand every issue card in 1 second!
 */
export function buildChineseTakeaway(title = '', category = 'missing_feature') {
  if (/[\u4e00-\u9fa5]{3,}/.test(title)) return title; // Already Chinese!
  const low = title.toLowerCase();
  const topics = [];
  const dict = [
    [/\btable(s)?\b/, '插入与编辑「表格」'],
    [/\bhighlight/, '文字「局部高亮」标记'],
    [/\bcolor(s)?\b.*\btext\b|\brich\s*text\b/, '同一段文字内「多颜色/富文本」样式'],
    [/\btab(s)?\b/, '「多标签页」切换管理'],
    [/\blatex\b|\bmath\b|\bformula/, '「LaTeX 数学公式」渲染'],
    [/\bself[- ]?host/, '简化「私有化/本地部署」流程'],
    [/\bgrid\b/, '「网格/方格纸背景」视图'],
    [/\beraser\b|\bstylus\b|\bpen\b/, '手写笔与「压感橡皮擦」体验优化'],
    [/\bpdf\b/, '「PDF 导入/导出」能力'],
    [/\bmarkdown\b/, '原生「Markdown」双向支持'],
    [/\boffline\b|\blocal\b/, '无需联网的「纯本地离线模式」'],
    [/\bwindows\b/, '修复「Windows 系统」安装与兼容问题'],
    [/\bdocker\b/, '摆脱繁琐「Docker」依赖'],
    [/\bmemory\b|\bram\b|\bleak\b/, '解决「内存占用过高/泄漏」问题'],
    [/\bslow\b|\blag\b|\bperformance\b|\bfreeze\b/, '解决「卡顿掉帧与启动慢」问题'],
    [/\bdark\s*mode\b|\btheme\b/, '完善「深色模式/主题切换」'],
    [/\bplugin(s)?\b|\bextension/, '开放「插件扩展」机制'],
    [/\bmobile\b|\bipad\b|\bandroid\b|\bios\b/, '优化「手机/平板触屏」适配'],
    [/\bshortcut(s)?\b|\bhotkey|\bkeybind/, '支持「自定义快捷键」'],
    [/\bchinese\b|\bcjk\b|\bi18n\b|\bfont/, '改善「中文字体与多语言」支持'],
    [/\bsync\b|\bcloud\b|\bbackup/, '更简单的「多端同步与自动备份」'],
    [/\bsearch\b|\bfind\b/, '全局「搜索与快速定位」功能'],
    [/\bfolder(s)?\b|\bworkspace/, '「文件夹层级整理」管理'],
    [/\bapi\b|\bwebhook|\bmcp\b/, '提供「开放 API / MCP 接口」调用'],
    [/\bcrash|\berror\b|\bfail|\bbroken/, '修复高频触发的「报错闪退」缺陷'],
  ];

  for (const [re, zh] of dict) {
    if (re.test(low)) topics.push(zh);
    if (topics.length >= 2) break;
  }

  if (topics.length > 0) {
    return `用户高赞诉求：${topics.join(' + ')}`;
  }

  const fallbackByCat = {
    missing_feature: '用户高赞呼吁新增此项实用功能（官方长期未做）',
    setup_os: '用户反馈安装部署繁琐或跨平台环境报错',
    bloat_perf: '用户吐槽软件运行卡顿、资源占用偏高',
    cloud_paywall: '用户希望解除云端限制、支持更自由的本地使用',
    bug_crash: '大量用户遇到此功能异常或报错，亟待修复',
    ux_dx: '用户反馈此处交互不够顺手，希望优化操作体验',
  };
  return fallbackByCat[category] || '高赞未解决用户需求';
}

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
  throw new Error('请输入正确的 GitHub 仓库名（例如 excalidraw/excalidraw）或粘贴完整 GitHub 链接');
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
  const starScore = Math.min(28, Math.round(Math.log10(Math.max(10, stars)) * 6.2));
  const backlogScore = Math.min(22, Math.round(Math.log10(Math.max(5, openIssues)) * 7.5));
  const top10Votes = topIssues.slice(0, 10).reduce((acc, it) => acc + it.thumbsUp + it.negVotes * 2, 0);
  const voteScore = Math.min(32, Math.round(Math.log10(Math.max(1, top10Votes + 1)) * 11.5));
  const avgStale =
    topIssues.length > 0
      ? topIssues.slice(0, 10).reduce((acc, it) => acc + it.staleDays, 0) / Math.min(10, topIssues.length)
      : 0;
  const neglectScore = Math.min(18, Math.round(avgStale / 25));

  const total = Math.min(99, Math.max(15, starScore + backlogScore + voteScore + neglectScore));
  let verdict = '有一定改进空间';
  if (total >= 82) verdict = '非常值得做替代品（用户多、痛点攒了好几年没人修）';
  else if (total >= 68) verdict = '值得切入（有明显没被满足的高赞需求）';

  return {
    score: total,
    verdict,
    top10Votes,
    avgStaleDays: Math.round(avgStale),
  };
}

export function buildInstantBlueprint(repo, clusters, topIssues, opp) {
  const sortedClusters = [...clusters].filter((c) => c.count > 0).sort((a, b) => b.totalWeight - a.totalWeight);
  const primary = sortedClusters[0];
  const secondary = sortedClusters[1];
  const top3 = topIssues.slice(0, 3);
  const years = (opp.avgStaleDays / 365).toFixed(1);

  const bullets = [
    `原版虽然有 ${(repo.stars / 1000).toFixed(1)}k 星，但前 10 个最高赞需求累计有 ${opp.top10Votes} 人点赞催更，官方平均拖了 ${years} 年（${opp.avgStaleDays} 天）还没解决。`,
    primary
      ? `用户抱怨最集中的是「${primary.label}」（占 ${primary.count} 条高赞反馈），尤其是 #${primary.issues[0]?.number}（${primary.issues[0]?.thumbsUp} 人点赞：${primary.issues[0]?.zhSummary || primary.issues[0]?.title}）。`
      : '',
    secondary
      ? `其次是「${secondary.label}」（${secondary.count} 条反馈）——只要做一个免折腾、开箱自带这些高频功能的轻量版，很容易吸引原版受挫用户。`
      : '只要把排名前 3 的高赞痛点做成开箱即用的主打功能，就能形成清晰的差异化卖点。',
  ].filter(Boolean);

  const buildPrompt = `我们要参考 \`${repo.fullName}\` 的真实用户痛点，做一个更轻快、更好用的改进版新项目！

### 原版用户抱怨最多但官方长期未解决的 3 个痛点：
${top3
  .map(
    (it, idx) =>
      `${idx + 1}. ${it.zhSummary || ''} —— 原帖 #${it.number} (${it.thumbsUp}人点赞 / 拖延${it.staleDays}天): ${it.title}`
  )
  .join('\n')}

### 新项目核心要求：
1. 免复杂安装配置，打开浏览器或单条命令即可直接使用；
2. 原生内置解决上面这 3 个最高赞痛点，作为产品的核心亮点；
3. 界面清爽直观（默认中文友好），包含基础测试与 README 说明。

请先给出清晰的功能设计与目录结构，然后直接写出可运行的完整 v1.0 代码！`;

  return {
    headline: `用更轻快的方式，解决 ${repo.name} 拖了 ${years} 年没修好的核心痛点`,
    bullets,
    buildPrompt,
  };
}

export async function discoverTargetRepos(presetOrKeyword = 'ai_agent') {
  const preset = NICHE_PRESETS[presetOrKeyword];
  const rawQuery = preset ? preset.query : `${presetOrKeyword} stars:>500`;
  const q = encodeURIComponent(`${rawQuery} archived:false`);
  const data = await ghApiJson(`search/repositories?q=${q}&sort=updated&order=desc&per_page=12`);

  return (data.items || [])
    .filter((r) => (r.open_issues_count || 0) >= 15)
    .map((r) => ({
      fullName: r.full_name,
      name: r.name,
      description: r.description || '暂无简介',
      stars: r.stargazers_count,
      openIssues: r.open_issues_count,
      language: r.language || 'Unknown',
    }))
    .sort((a, b) => b.openIssues - a.openIssues)
    .slice(0, 8);
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
    const zhSummary = buildChineseTakeaway(it.title, category);
    const severity = Math.round(
      thumbsUp * 3.2 + negVotes * 4.5 + heartRocket * 1.5 + (it.comments || 0) * 1.4 + Math.min(30, staleDays / 25)
    );

    return {
      number: it.number,
      title: it.title,
      zhSummary,
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
        .slice(0, 220),
      topQuotes: [],
    };
  });

  normalizedIssues.sort((a, b) => b.severity - a.severity);
  const topIssues = normalizedIssues.slice(0, 20);

  await Promise.all(
    topIssues.slice(0, 3).map(async (iss) => {
      try {
        const comments = await ghApiJson(`repos/${slug}/issues/${iss.number}/comments?per_page=8`, 8000);
        if (Array.isArray(comments)) {
          iss.topQuotes = comments
            .filter((c) => c.body && c.body.trim().length > 18 && !/bot/i.test(c.user?.login || ''))
            .sort((a, b) => (b.reactions?.['+1'] || 0) - (a.reactions?.['+1'] || 0))
            .slice(0, 2)
            .map((c) => ({
              user: c.user?.login || 'user',
              likes: c.reactions?.['+1'] || 0,
              text: String(c.body).replace(/!\[.*?\]\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 160),
            }));
        }
      } catch {
        // ignore individual comment fetch failure
      }
    })
  );

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
