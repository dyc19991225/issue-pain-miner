import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTargetRepos, mineRepoPains, NICHE_PRESETS } from './githubMiner.mjs';
import { cancelAiJob, detectAiEngines, runAiStrategist } from './aiStrategist.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, 'ui');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function createPainMinerServer(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const stateDir = path.join(rootDir, '.pain-miner', 'reports');
  fs.mkdirSync(stateDir, { recursive: true });

  const sseClients = new Set();
  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(msg); } catch { sseClients.delete(res); }
    }
  };

  const reportPathFor = (slug) => path.join(stateDir, `${slug.replace('/', '__')}.json`);

  const listSavedReports = () => {
    return fs
      .readdirSync(stateDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf8'));
          return {
            fullName: d.repo.fullName,
            stars: d.repo.stars,
            openIssues: d.repo.openIssues,
            score: d.opportunity.score,
            hasAiPrd: Boolean(d.aiPrd),
            minedAt: d.minedAt,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.minedAt || '').localeCompare(a.minedAt || ''));
  };

  const sendJson = (res, status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = urlObj.pathname;

      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          engines: detectAiEngines(),
          presets: NICHE_PRESETS,
          savedReports: listSavedReports(),
        });
        return;
      }

      if (pathname === '/api/stream' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`event: ping\ndata: {}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (pathname === '/api/discover' && req.method === 'GET') {
        const q = urlObj.searchParams.get('q') || 'ai_agent';
        const items = await discoverTargetRepos(q);
        sendJson(res, 200, { ok: true, items });
        return;
      }

      if (pathname === '/api/report' && req.method === 'GET') {
        const repo = urlObj.searchParams.get('repo') || '';
        const fp = reportPathFor(repo);
        if (!fs.existsSync(fp)) {
          sendJson(res, 404, { ok: false, error: '未找到历史缓存报告' });
          return;
        }
        sendJson(res, 200, { ok: true, report: JSON.parse(fs.readFileSync(fp, 'utf8')) });
        return;
      }

      if (pathname === '/api/mine' && req.method === 'POST') {
        const body = await readJson(req);
        const report = opts.mockMiner ? await opts.mockMiner(body.repo) : await mineRepoPains(body.repo);
        // Preserve existing aiPrd if re-mining same repo unless force cleared
        const fp = reportPathFor(report.repo.fullName);
        if (fs.existsSync(fp)) {
          try {
            const old = JSON.parse(fs.readFileSync(fp, 'utf8'));
            if (old.aiPrd) report.aiPrd = old.aiPrd;
          } catch {}
        }
        fs.writeFileSync(fp, JSON.stringify(report, null, 2));
        sendJson(res, 200, { ok: true, report, savedReports: listSavedReports() });
        return;
      }

      if (pathname === '/api/ai-prd' && req.method === 'POST') {
        const body = await readJson(req);
        const fp = reportPathFor(body.repo || '');
        if (!fs.existsSync(fp)) {
          sendJson(res, 404, { ok: false, error: '请先执行仓库痛点抓取' });
          return;
        }
        const report = JSON.parse(fs.readFileSync(fp, 'utf8'));
        const jobId = `job_${Date.now()}`;
        broadcast('ai_start', { jobId, repo: report.repo.fullName, engine: body.engine || 'claude' });

        const aiResult = await runAiStrategist({
          jobId,
          engine: body.engine || 'claude',
          report,
          onProgress: (p) => broadcast('ai_progress', { jobId, ...p }),
        });

        report.aiPrd = aiResult;
        fs.writeFileSync(fp, JSON.stringify(report, null, 2));
        broadcast('ai_done', { jobId, aiPrd: aiResult });
        sendJson(res, 200, { ok: true, aiPrd: aiResult, savedReports: listSavedReports() });
        return;
      }

      if (pathname === '/api/ai-cancel' && req.method === 'POST') {
        const body = await readJson(req);
        const stopped = cancelAiJob(body.jobId);
        sendJson(res, 200, { ok: true, stopped });
        return;
      }

      // One-Click Bridge to Pocket Foreman (`http://127.0.0.1:4788/api/tasks`)!
      if (pathname === '/api/dispatch-foreman' && req.method === 'POST') {
        const body = await readJson(req);
        const foremanUrl = body.foremanUrl || 'http://127.0.0.1:4788';
        try {
          const fRes = await fetch(`${foremanUrl}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal: body.goal || 'Build Giant-Killer MVP from Issue Pain Miner',
              prompt: body.prompt,
              worker: body.worker || 'codex',
              workspace: body.workspace || path.dirname(rootDir),
              permission: 'write',
              allowShell: true,
              autoStart: false, // Queues safely in Pocket Foreman ready for 1-click inspection/start!
            }),
          });
          if (!fRes.ok) throw new Error(`Foreman status ${fRes.status}`);
          const fData = await fRes.json();
          sendJson(res, 200, { ok: true, foremanUrl, task: fData });
        } catch {
          sendJson(res, 200, {
            ok: false,
            fallback: true,
            error: '未检测到本地 Pocket Foreman (4788端口)，已为您准备好开工提示词直接复制！',
          });
        }
        return;
      }

      const uiFile = pathname === '/' ? 'index.html' : pathname.slice(1);
      const safePath = path.normalize(path.join(UI_DIR, uiFile));
      if (!safePath.startsWith(UI_DIR) || !fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      fs.createReadStream(safePath).pipe(res);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err?.message || 'Server error' });
    }
  });

  const closeAll = () => {
    for (const c of sseClients) {
      try { c.end(); } catch {}
    }
    sseClients.clear();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, closeAll };
}
