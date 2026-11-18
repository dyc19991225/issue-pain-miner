let currentReport = null;
let selectedCluster = 'all';
let activeJobId = null;
let liveStreamBuffer = '';
let liveTimerInterval = null;
let toastTimeout = null;

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * Clean, XSS-safe Markdown -> Editorial HTML renderer (supports headings, lists, tables, blockquotes, fenced code)
 */
function renderMarkdownHtml(md = '') {
  if (!md) return '';
  const blocks = [];
  // Extract fenced code blocks first
  const withPlaceholders = md.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code>${esc(code.trim())}</code></pre>`);
    return `\n@@CODEBLOCK_${idx}@@\n`;
  });

  const lines = withPlaceholders.split(/\r?\n/);
  const html = [];
  let inUl = false;
  let inOl = false;
  let tableRows = [];

  const flushLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const filtered = tableRows.filter((r) => !/^\s*\|?[\s:-]+\|[\s|:-]*$/.test(r));
    if (filtered.length > 0) {
      html.push('<table>');
      filtered.forEach((row, idx) => {
        const cells = row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const tag = idx === 0 ? 'th' : 'td';
        html.push(`<tr>${cells.map((c) => `<${tag}>${formatInline(c)}</${tag}>`).join('')}</tr>`);
      });
      html.push('</table>');
    }
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushLists();
      flushTable();
      continue;
    }

    const codeMatch = line.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (codeMatch) {
      flushLists();
      flushTable();
      html.push(blocks[Number(codeMatch[1])]);
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      flushLists();
      tableRows.push(line);
      continue;
    }
    flushTable();

    if (/^---+$/.test(line)) {
      flushLists();
      continue;
    }
    if (line.startsWith('### ')) {
      flushLists();
      html.push(`<h3>${formatInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushLists();
      html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      flushLists();
      html.push(`<h1>${formatInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('> ')) {
      flushLists();
      html.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    flushLists();
    html.push(`<p>${formatInline(line)}</p>`);
  }

  flushLists();
  flushTable();
  return html.join('\n');
}

function humanWaitDuration(days) {
  if (days >= 365) return `${(days / 365).toFixed(1)} 年`;
  if (days >= 60) return `${Math.round(days / 30)} 个月`;
  return `${days} 天`;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

function switchStep(stepName) {
  document.querySelectorAll('.step-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.step === stepName);
  });
  document.querySelectorAll('.step-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `step-${stepName}`);
  });
}

function renderSavedChips(saved = []) {
  const row = document.getElementById('history-row');
  const box = document.getElementById('saved-chips');
  if (!saved || saved.length === 0) {
    row.classList.add('hidden');
    return;
  }
  row.classList.remove('hidden');
  box.innerHTML = saved
    .map(
      (s) => `
      <button class="saved-chip ${currentReport?.repo?.fullName === s.fullName ? 'active' : ''}" data-load-repo="${esc(s.fullName)}">
        <span>${esc(s.fullName)}</span>
        <span class="chip-score">${s.score}分${s.hasAiPrd ? ' · 含AI方案' : ''}</span>
      </button>
    `
    )
    .join('');

  box.querySelectorAll('[data-load-repo]').forEach((btn) => {
    btn.onclick = () => loadSavedReport(btn.dataset.loadRepo);
  });
}

async function loadSavedReport(slug) {
  const res = await fetch(`/api/report?repo=${encodeURIComponent(slug)}`);
  const data = await res.json();
  if (data.ok) {
    document.getElementById('repo-input').value = slug;
    selectedCluster = 'all';
    renderReport(data.report);
  }
}

async function loadDiscovery(presetKey) {
  const statusEl = document.getElementById('discover-status');
  statusEl.textContent = '⏳ 正在查找该分类下的高热度开源软件...';
  document.querySelectorAll('.preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.preset === presetKey));

  try {
    const res = await fetch(`/api/discover?q=${encodeURIComponent(presetKey)}`);
    const data = await res.json();
    const items = data.items || [];
    statusEl.textContent = `找到 ${items.length} 个用户量大、待解决反馈较多的项目（点击任意卡片直接分析）：`;
    const grid = document.getElementById('discover-grid');
    grid.innerHTML = items
      .map(
        (r) => `
        <div class="target-card" data-mine-target="${esc(r.fullName)}">
          <div class="target-name">${esc(r.fullName)}</div>
          <div class="target-meta">⭐ ${(r.stars / 1000).toFixed(1)}k 星 · 📬 ${r.openIssues} 条未解反馈</div>
          <div class="target-desc">${esc(r.description)}</div>
        </div>
      `
      )
      .join('');
    grid.querySelectorAll('[data-mine-target]').forEach((card) => {
      card.onclick = () => {
        document.getElementById('finder-drawer').classList.add('hidden');
        document.getElementById('repo-input').value = card.dataset.mineTarget;
        runMine(card.dataset.mineTarget);
      };
    });
  } catch {
    statusEl.textContent = '暂时无法加载推荐列表，请在上方直接输入仓库名';
  }
}

function extractPromptBlock(markdown = '') {
  const m = markdown.match(/```(?:text|markdown|prompt)?\s*([\s\S]*?)```/);
  return m && m[1].trim().length > 40 ? m[1].trim() : null;
}

function renderReport(report) {
  currentReport = report;
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('report-view').classList.remove('hidden');

  const r = report.repo;
  const opp = report.opportunity;
  const nameEl = document.getElementById('r-name');
  nameEl.textContent = `${r.fullName} ↗`;
  nameEl.href = r.url;

  document.getElementById('r-lang').textContent = r.language;
  document.getElementById('r-stars').textContent = `⭐ ${r.stars.toLocaleString()} 星`;
  document.getElementById('r-open').textContent = `📬 ${r.openIssues.toLocaleString()} 条未解决反馈`;
  document.getElementById('r-desc').textContent = r.description || '';

  const waitHuman = humanWaitDuration(opp.avgStaleDays);
  document.getElementById('r-human-insight').innerHTML =
    `💡 <strong>一句话看懂机会</strong>：这个项目虽然很火，但呼声最高的前 10 个需求共有 <strong>${opp.top10Votes} 人点赞催更</strong>，官方平均已经拖了 <strong>${waitHuman}（${opp.avgStaleDays} 天）</strong> 还没解决——这就是你做轻量改进版最好的切入口！`;

  document.getElementById('r-score').textContent = String(opp.score);
  document.getElementById('r-verdict').textContent = opp.verdict;
  document.getElementById('tab-pain-count').textContent = `${report.topIssues.length} 条高赞痛点`;

  // Update active highlight on saved chips
  document.querySelectorAll('[data-load-repo]').forEach((c) => {
    c.classList.toggle('active', c.dataset.loadRepo === r.fullName);
  });

  renderPainList();

  // Step 2: Takeaway + AI Document
  document.getElementById('bp-headline').textContent = `⚡ ${report.instantBlueprint.headline}`;
  document.getElementById('bp-bullets').innerHTML = (report.instantBlueprint.bullets || [])
    .map((line) => `<li>${formatInline(line)}</li>`)
    .join('');

  document.getElementById('build-prompt-box').value = report.instantBlueprint.buildPrompt;

  const docCard = document.getElementById('ai-doc-card');
  if (report.aiPrd?.markdown) {
    docCard.classList.remove('hidden');
    document.getElementById('tab-plan-badge').textContent = '✅ 已生成完整方案';
    document.getElementById('ai-status-text').textContent = `✨ AI 完整立项方案（由 ${report.aiPrd.engine.toUpperCase()} 撰写 · 耗时 ${report.aiPrd.durationSec}s）`;
    document.getElementById('ai-timer').textContent = '';
    document.getElementById('ai-prd-rendered').innerHTML = renderMarkdownHtml(report.aiPrd.markdown);
    const extracted = extractPromptBlock(report.aiPrd.markdown);
    if (extracted) document.getElementById('build-prompt-box').value = extracted;
  } else {
    docCard.classList.add('hidden');
    document.getElementById('tab-plan-badge').textContent = '可调用 AI 撰写';
  }
}

function renderPainList() {
  const clusters = (currentReport.clusters || []).filter((c) => c.count > 0);
  const pillsEl = document.getElementById('cluster-pills');

  pillsEl.innerHTML = [
    `<button class="filter-pill ${selectedCluster === 'all' ? 'active' : ''}" data-cid="all">全部痛点 (${currentReport.topIssues.length})</button>`,
    ...clusters.map(
      (c) =>
        `<button class="filter-pill ${selectedCluster === c.id ? 'active' : ''}" data-cid="${c.id}">${c.icon} ${esc(c.label)} (${c.count})</button>`
    ),
  ].join('');

  pillsEl.querySelectorAll('[data-cid]').forEach((btn) => {
    btn.onclick = () => {
      selectedCluster = btn.dataset.cid;
      renderPainList();
    };
  });

  const catMap = Object.fromEntries((currentReport.clusters || []).map((c) => [c.id, `${c.icon} ${c.label}`]));
  const list =
    selectedCluster === 'all'
      ? currentReport.topIssues
      : currentReport.topIssues.filter((i) => i.category === selectedCluster);

  const listEl = document.getElementById('issues-list');
  listEl.innerHTML = list
    .map((it, idx) => {
      const voices = (it.topQuotes || [])
        .map(
          (q) =>
            `<div class="voice-item">💬 高赞用户评论 (@${esc(q.user)}${q.likes ? ` · ${q.likes}赞` : ''})：“${esc(
              String(q.text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()
            )}”</div>`
        )
        .join('');

      return `
        <article class="pain-card">
          <div class="pain-top">
            <div class="pain-rank-group">
              <span class="rank-badge">TOP ${idx + 1}</span>
              <span class="cat-tag">${esc(catMap[it.category] || '核心需求')}</span>
            </div>
            <div class="pain-metrics">
              <span class="metric-up">👍 ${it.thumbsUp} 人点赞 · 💬 ${it.comments} 条讨论</span>
              <span class="metric-wait">⏰ 已拖延 ${humanWaitDuration(it.staleDays)}未修</span>
              <a class="metric-link" href="${esc(it.url)}" target="_blank">原帖 #${it.number} ↗</a>
            </div>
          </div>

          <div class="pain-zh-title">💡 ${esc(it.zhSummary || it.title)}</div>
          <div class="pain-orig-title">原标题：${esc(it.title)}</div>
          ${it.excerpt ? `<div class="pain-excerpt">详情节选：${esc(it.excerpt)}...</div>` : ''}
          ${voices ? `<div class="user-voices">${voices}</div>` : ''}
        </article>
      `;
    })
    .join('');
}

async function runMine(repoStr) {
  const btn = document.getElementById('btn-mine');
  btn.disabled = true;
  btn.textContent = '正在分析中...';
  showToast(`🔍 正在读取 ${repoStr} 的高赞未解决反馈...`);

  try {
    const res = await fetch('/api/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: repoStr }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '分析失败');
    selectedCluster = 'all';
    switchStep('pains');
    renderSavedChips(data.savedReports);
    renderReport(data.report);
    showToast(`✅ 分析完成！已提炼 ${data.report.topIssues.length} 条真实高赞痛点`);
  } catch (e) {
    showToast(`❌ ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '开始分析痛点';
  }
}

async function init() {
  const res = await fetch('/api/bootstrap');
  const boot = await res.json();

  // Engine selector
  const sel = document.getElementById('ai-engine-select');
  sel.innerHTML = Object.values(boot.engines || {})
    .map((e) => `<option value="${e.id}" ${!e.installed ? 'disabled' : ''}>${e.name}${e.installed ? '' : ' (未安装)'}</option>`)
    .join('');

  // Step Tabs
  document.querySelectorAll('.step-tab').forEach((tab) => {
    tab.onclick = () => switchStep(tab.dataset.step);
  });

  document.getElementById('btn-goto-build').onclick = () => switchStep('build');

  // Toggle Target Finder Drawer
  const drawer = document.getElementById('finder-drawer');
  document.getElementById('btn-toggle-finder').onclick = () => {
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden') && !drawer.dataset.loaded) {
      drawer.dataset.loaded = '1';
      loadDiscovery('ai_agent');
    }
  };

  // Preset buttons inside Finder Drawer
  const pillsEl = document.getElementById('preset-pills');
  pillsEl.innerHTML = Object.entries(boot.presets || {})
    .map(([k, v]) => `<button type="button" class="preset-btn" data-preset="${k}">${esc(v.label)}</button>`)
    .join('');
  pillsEl.querySelectorAll('[data-preset]').forEach((b) => {
    b.onclick = () => loadDiscovery(b.dataset.preset);
  });

  const saved = boot.savedReports || [];
  renderSavedChips(saved);

  // Auto-open most recent analyzed report if available so user immediately sees clean readable results!
  if (saved.length > 0) {
    await loadSavedReport(saved[0].fullName);
  } else {
    document.getElementById('empty-state').classList.remove('hidden');
  }

  document.getElementById('mine-form').onsubmit = (e) => {
    e.preventDefault();
    const val = document.getElementById('repo-input').value.trim();
    if (val) runMine(val);
  };

  document.querySelectorAll('[data-quick]').forEach((b) => {
    b.onclick = () => {
      document.getElementById('repo-input').value = b.dataset.quick;
      runMine(b.dataset.quick);
    };
  });

  // Live SSE for AI PRD Generation
  const aiBtn = document.getElementById('btn-run-ai');
  const cancelBtn = document.getElementById('btn-cancel-ai');

  const es = new EventSource('/api/stream');
  es.addEventListener('ai_start', (e) => {
    const d = JSON.parse(e.data);
    activeJobId = d.jobId;
    liveStreamBuffer = '';
    document.getElementById('ai-doc-card').classList.remove('hidden');
    document.getElementById('ai-prd-rendered').innerHTML = '<p class="muted-hint">正在结合真实用户吐槽撰写完整中文产品方案，预计约需 30–60 秒...</p>';
    document.getElementById('ai-status-text').textContent = `⏳ 正在调用 ${d.engine.toUpperCase()} 撰写完整产品立项方案...`;
    aiBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');

    const started = Date.now();
    clearInterval(liveTimerInterval);
    liveTimerInterval = setInterval(() => {
      document.getElementById('ai-timer').textContent = `已用时 ${Math.round((Date.now() - started) / 1000)}s`;
    }, 1000);
  });

  es.addEventListener('ai_progress', (e) => {
    const d = JSON.parse(e.data);
    if (d.chunk) {
      liveStreamBuffer += d.chunk;
      document.getElementById('ai-prd-rendered').innerHTML = renderMarkdownHtml(liveStreamBuffer);
    }
  });

  es.addEventListener('ai_done', (e) => {
    const d = JSON.parse(e.data);
    clearInterval(liveTimerInterval);
    aiBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    document.getElementById('tab-plan-badge').textContent = '✅ 已生成完整方案';
    document.getElementById('ai-status-text').textContent = `✨ AI 完整立项方案（由 ${d.aiPrd.engine.toUpperCase()} 撰写 · 耗时 ${d.aiPrd.durationSec}s）`;
    document.getElementById('ai-timer').textContent = '';
    document.getElementById('ai-prd-rendered').innerHTML = renderMarkdownHtml(d.aiPrd.markdown);
    const extracted = extractPromptBlock(d.aiPrd.markdown);
    if (extracted) document.getElementById('build-prompt-box').value = extracted;
  });

  aiBtn.onclick = async () => {
    if (!currentReport) return;
    try {
      const r = await fetch('/api/ai-prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: currentReport.repo.fullName,
          engine: sel.value || 'claude',
        }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error);
      currentReport.aiPrd = data.aiPrd;
      renderSavedChips(data.savedReports);
      showToast('✨ AI 完整中文产品方案已生成！');
    } catch (err) {
      clearInterval(liveTimerInterval);
      aiBtn.classList.remove('hidden');
      cancelBtn.classList.add('hidden');
      showToast(`❌ ${err.message}`);
    }
  };

  cancelBtn.onclick = async () => {
    if (!activeJobId) return;
    await fetch('/api/ai-cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: activeJobId }),
    });
    clearInterval(liveTimerInterval);
    aiBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    showToast('⏹ 已停止生成');
  };

  document.getElementById('btn-copy-prompt').onclick = async () => {
    await navigator.clipboard.writeText(document.getElementById('build-prompt-box').value);
    showToast('📋 已复制开发指令！直接粘贴发给 AI 即可开始写代码');
  };

  document.getElementById('btn-send-foreman').onclick = async () => {
    if (!currentReport) return;
    const prompt = document.getElementById('build-prompt-box').value;
    const goal = `改进复刻 ${currentReport.repo.name} 高赞痛点新项目`;
    const r = await fetch('/api/dispatch-foreman', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, prompt, worker: 'codex' }),
    });
    const d = await r.json();
    if (d.ok) {
      showToast('⚡ 已派单至本地 Pocket Foreman (http://127.0.0.1:4788) 队列！');
    } else {
      await navigator.clipboard.writeText(prompt);
      showToast('📋 已复制开发指令（打开 Pocket Foreman 粘贴即可开工）');
    }
  };

  document.getElementById('btn-export-md').onclick = () => {
    if (!currentReport) return;
    const r = currentReport.repo;
    const lines = [
      `# ${r.fullName} 用户痛点与新产品机会分析报告`,
      `- 原项目地址: ${r.url} (⭐ ${r.stars.toLocaleString()} 星 | ${r.openIssues.toLocaleString()} 条未关闭反馈)`,
      `- 新产品机会评分: ${currentReport.opportunity.score} / 100 (${currentReport.opportunity.verdict})\n`,
      `## 一、核心结论`,
      ...currentReport.instantBlueprint.bullets.map((b) => `- ${b}`),
      '',
      currentReport.aiPrd?.markdown ? `## 二、AI 完整立项方案\n\n${currentReport.aiPrd.markdown}\n` : '',
      `## 三、Top 15 高赞未解决痛点清单`,
      ...currentReport.topIssues.slice(0, 15).map(
        (it, i) => `${i + 1}. **${it.zhSummary}** — [#${it.number} ${it.title}](${it.url}) (${it.thumbsUp}赞 / 拖延${it.staleDays}天)`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pain-report-${r.name}.md`;
    a.click();
  };
}

init();
