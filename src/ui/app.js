let currentReport = null;
let selectedCluster = 'all';
let activeJobId = null;
let liveTimerInterval = null;
let toastTimeout = null;

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

function renderSavedList(saved = []) {
  document.getElementById('saved-count').textContent = String(saved.length);
  const box = document.getElementById('saved-list');
  if (saved.length === 0) {
    box.innerHTML = '<div class="tiny-muted">尚无归档记录，挖掘后自动保存在本地</div>';
    return;
  }
  box.innerHTML = saved
    .map(
      (s) => `
      <div class="side-item ${currentReport?.repo?.fullName === s.fullName ? 'active' : ''}" data-load-repo="${esc(s.fullName)}">
        <div class="side-item-top">
          <span>${esc(s.fullName)}</span>
          <span class="score-mini">${s.score}分</span>
        </div>
        <div class="side-item-sub">⭐ ${s.stars.toLocaleString()} · 🔥 ${s.openIssues} 未解 ${s.hasAiPrd ? '· 🧠 含立项书' : ''}</div>
      </div>
    `
    )
    .join('');

  box.querySelectorAll('[data-load-repo]').forEach((el) => {
    el.onclick = async () => {
      const slug = el.dataset.loadRepo;
      const res = await fetch(`/api/report?repo=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (data.ok) {
        selectedCluster = 'all';
        renderReport(data.report);
      }
    };
  });
}

async function loadDiscovery(presetKey) {
  const statusEl = document.getElementById('discover-status');
  statusEl.textContent = '⏳ 扫描中...';
  document.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b.dataset.preset === presetKey));

  try {
    const res = await fetch(`/api/discover?q=${encodeURIComponent(presetKey)}`);
    const data = await res.json();
    statusEl.textContent = `发现 ${(data.items || []).length} 个高积压靶标`;
    const box = document.getElementById('discover-list');
    box.innerHTML = (data.items || [])
      .map(
        (r) => `
        <div class="side-item" data-mine-target="${esc(r.fullName)}">
          <div class="side-item-top">
            <span>${esc(r.fullName)}</span>
            <span class="score-mini">🔥 ${r.openIssues} Issues</span>
          </div>
          <div class="side-item-sub">⭐ ${r.stars.toLocaleString()} · ${esc(r.description)}</div>
        </div>
      `
      )
      .join('');
    box.querySelectorAll('[data-mine-target]').forEach((el) => {
      el.onclick = () => {
        document.getElementById('repo-input').value = el.dataset.mineTarget;
        runMine(el.dataset.mineTarget);
      };
    });
  } catch {
    statusEl.textContent = '扫描失败';
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
  nameEl.textContent = r.fullName;
  nameEl.href = r.url;
  document.getElementById('r-lang').textContent = r.language;
  document.getElementById('r-license').textContent = r.license;
  document.getElementById('r-desc').textContent = r.description || '暂无仓库描述';
  document.getElementById('r-stars').textContent = r.stars.toLocaleString();
  document.getElementById('r-open').textContent = r.openIssues.toLocaleString();
  document.getElementById('r-votes').textContent = `${opp.top10Votes} 👍`;
  document.getElementById('r-stale').textContent = `${opp.avgStaleDays} 天`;
  document.getElementById('r-score').textContent = String(opp.score);
  document.getElementById('r-verdict').textContent = opp.verdict;

  renderClustersAndIssues();

  // Instant Blueprint
  document.getElementById('bp-headline').textContent = `⚡ ${report.instantBlueprint.headline}`;
  document.getElementById('bp-bullets').innerHTML = report.instantBlueprint.bullets
    .map((line) => `<p>${esc(line).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('');

  document.getElementById('build-prompt-box').value = report.instantBlueprint.buildPrompt;

  // Restore saved AI PRD if present
  const prdBox = document.getElementById('ai-prd-box');
  if (report.aiPrd?.markdown) {
    prdBox.classList.remove('hidden');
    document.getElementById('ai-status-text').textContent = `✅ 由 ${report.aiPrd.engine.toUpperCase()} 深度生成的立项书 (${report.aiPrd.durationSec}s)`;
    document.getElementById('ai-timer').textContent = '';
    document.getElementById('ai-prd-content').textContent = report.aiPrd.markdown;
    const extracted = extractPromptBlock(report.aiPrd.markdown);
    if (extracted) document.getElementById('build-prompt-box').value = extracted;
  } else {
    prdBox.classList.add('hidden');
  }
}

function renderClustersAndIssues() {
  const clusters = currentReport.clusters || [];
  const maxWeight = Math.max(1, ...clusters.map((c) => c.totalWeight));

  const barHtml = [
    `<div class="cluster-chip ${selectedCluster === 'all' ? 'active' : ''}" data-cid="all">
      <div class="cluster-top"><span>🔥 全部高赞痛点</span><strong>${currentReport.topIssues.length}</strong></div>
      <div class="cluster-track"><div class="cluster-fill" style="width:100%"></div></div>
    </div>`,
    ...clusters.map((c) => {
      const pct = Math.round((c.totalWeight / maxWeight) * 100);
      return `
        <div class="cluster-chip ${selectedCluster === c.id ? 'active' : ''}" data-cid="${c.id}">
          <div class="cluster-top"><span>${c.icon} ${c.label.slice(0, 7)}</span><strong>${c.count}</strong></div>
          <div class="cluster-track"><div class="cluster-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }),
  ].join('');

  const barEl = document.getElementById('cluster-bars');
  barEl.innerHTML = barHtml;
  barEl.querySelectorAll('[data-cid]').forEach((chip) => {
    chip.onclick = () => {
      selectedCluster = chip.dataset.cid;
      renderClustersAndIssues();
    };
  });

  const catMap = Object.fromEntries(clusters.map((c) => [c.id, `${c.icon} ${c.label}`]));
  const filtered =
    selectedCluster === 'all'
      ? currentReport.topIssues
      : currentReport.topIssues.filter((i) => i.category === selectedCluster);

  const wall = document.getElementById('issues-wall');
  if (filtered.length === 0) {
    wall.innerHTML = '<div class="tiny-muted" style="padding:16px">该维度下暂无高赞未解决 Issue</div>';
    return;
  }

  wall.innerHTML = filtered
    .map((it) => {
      const quotesHtml = (it.topQuotes || [])
        .map((q) => `<div class="quote-box">💬 @${esc(q.user)} (${q.likes}👍): "${esc(q.text)}"</div>`)
        .join('');
      return `
        <article class="issue-card">
          <div class="issue-meta">
            <a class="iss-num" href="${esc(it.url)}" target="_blank">#${it.number} ↗</a>
            <span class="vote-pill">👍 ${it.thumbsUp} 赞 · 💬 ${it.comments} 评</span>
            <span class="stale-pill">⏳ 已拖延 ${it.staleDays} 天</span>
            <span class="cat-pill">${esc(catMap[it.category] || it.category)}</span>
          </div>
          <div class="issue-title">${esc(it.title)}</div>
          ${it.excerpt ? `<div class="issue-excerpt">${esc(it.excerpt)}...</div>` : ''}
          ${quotesHtml}
        </article>
      `;
    })
    .join('');
}

async function runMine(repoStr) {
  const btn = document.getElementById('btn-mine');
  btn.disabled = true;
  btn.textContent = '⏳ 正在深挖 GitHub...';
  showToast(`🔍 正在抓取 ${repoStr} 的高赞未解决痛点与用户原话...`);

  try {
    const res = await fetch('/api/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: repoStr }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '挖掘失败');
    selectedCluster = 'all';
    renderReport(data.report);
    renderSavedList(data.savedReports);
    showToast(`✅ 挖掘完成！共提炼 ${data.report.topIssues.length} 条高痛点未解决 Issue`);
  } catch (e) {
    showToast(`❌ ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 深度挖掘痛点';
  }
}

async function init() {
  const res = await fetch('/api/bootstrap');
  const boot = await res.json();

  // Populate AI Engines
  const sel = document.getElementById('ai-engine-select');
  const engines = Object.values(boot.engines || {});
  sel.innerHTML = engines
    .map((e) => `<option value="${e.id}" ${!e.installed ? 'disabled' : ''}>${e.name}${e.installed ? '' : ' (未安装)'}</option>`)
    .join('');

  // Populate Niche Preset Pills
  const pillsEl = document.getElementById('preset-pills');
  pillsEl.innerHTML = Object.entries(boot.presets || {})
    .map(([k, v]) => `<button class="pill-btn" data-preset="${k}">${esc(v.label)}</button>`)
    .join('');
  pillsEl.querySelectorAll('[data-preset]').forEach((b) => {
    b.onclick = () => loadDiscovery(b.dataset.preset);
  });

  renderSavedList(boot.savedReports || []);
  loadDiscovery('ai_agent');

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

  // AI Deep Strategist Trigger + Live Streaming SSE
  const aiBtn = document.getElementById('btn-run-ai');
  const cancelBtn = document.getElementById('btn-cancel-ai');

  const es = new EventSource('/api/stream');
  es.addEventListener('ai_start', (e) => {
    const d = JSON.parse(e.data);
    activeJobId = d.jobId;
    document.getElementById('ai-prd-box').classList.remove('hidden');
    document.getElementById('ai-prd-content').textContent = '';
    document.getElementById('ai-status-text').textContent = `🧠 正在调用本地 ${d.engine.toUpperCase()} 深度推演超越方案...`;
    aiBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');

    const started = Date.now();
    clearInterval(liveTimerInterval);
    liveTimerInterval = setInterval(() => {
      document.getElementById('ai-timer').textContent = `${Math.round((Date.now() - started) / 1000)}s`;
    }, 1000);
  });

  es.addEventListener('ai_progress', (e) => {
    const d = JSON.parse(e.data);
    if (d.chunk) {
      document.getElementById('ai-prd-content').textContent += d.chunk;
    }
  });

  es.addEventListener('ai_done', (e) => {
    const d = JSON.parse(e.data);
    clearInterval(liveTimerInterval);
    aiBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    document.getElementById('ai-status-text').textContent = `✅ ${d.aiPrd.engine.toUpperCase()} 深度立项书生成完毕 (${d.aiPrd.durationSec}s)`;
    document.getElementById('ai-prd-content').textContent = d.aiPrd.markdown;
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
      renderSavedList(data.savedReports);
      showToast('🧠 AI 深度降维打击立项书已生成！');
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
    showToast('⏹ 已中止 AI 推演');
  };

  document.getElementById('btn-copy-prompt').onclick = async () => {
    await navigator.clipboard.writeText(document.getElementById('build-prompt-box').value);
    showToast('📋 开工 Prompt 已复制！可直接发给 Claude / Codex / Antigravity');
  };

  document.getElementById('btn-send-foreman').onclick = async () => {
    if (!currentReport) return;
    const prompt = document.getElementById('build-prompt-box').value;
    const goal = `超越复刻 ${currentReport.repo.name} 核心痛点新项目`;
    const r = await fetch('/api/dispatch-foreman', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, prompt, worker: 'codex' }),
    });
    const d = await r.json();
    if (d.ok) {
      showToast('⚡ 已成功派单至本地 Pocket Foreman (http://127.0.0.1:4788) 队列！');
    } else {
      await navigator.clipboard.writeText(prompt);
      showToast('📋 已自动复制开工 Prompt（打开 Pocket Foreman 粘贴即可开工）');
    }
  };

  document.getElementById('btn-export-md').onclick = () => {
    if (!currentReport) return;
    const r = currentReport.repo;
    const lines = [
      `# 🔍 ${r.fullName} 竞品痛点挖掘与超越方案报告`,
      `- **GitHub**: ${r.url} (⭐ ${r.stars.toLocaleString()} | 未解决 Issues: ${r.openIssues.toLocaleString()})`,
      `- **破局商机指数**: ${currentReport.opportunity.score} / 100 (${currentReport.opportunity.verdict})`,
      `- **Top10 痛点平均拖延**: ${currentReport.opportunity.avgStaleDays} 天\n`,
      `## 一、快筛破局策略`,
      ...currentReport.instantBlueprint.bullets,
      '',
      currentReport.aiPrd?.markdown ? `## 二、AI 深度降维打击立项书\n\n${currentReport.aiPrd.markdown}\n` : '',
      `## 三、Top 15 高赞未解决痛点铁证`,
      ...currentReport.topIssues.slice(0, 15).map(
        (it, i) => `${i + 1}. **#${it.number}** [${it.thumbsUp}👍 / ${it.comments}💬 / 拖延${it.staleDays}天] [${it.title}](${it.url})`
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
