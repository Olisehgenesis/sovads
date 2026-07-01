/**
 * GET /r/unit — iframe renderer for SovAds standalone units.
 *
 * Loaded by host pages inside an iframe; emits a small standalone HTML
 * document (no Next chrome, no React). The script fetches /api/serve,
 * renders the right unit shape, and postMessages lifecycle events to
 * the parent window using the protocol in lib/unit-postmessage.ts.
 *
 * Query params (all optional except siteId + slotId):
 *   siteId      (required) publisher siteId
 *   slotId      (required) host-side slot id, echoed on every postMessage
 *   kind        csv of BANNER|POLL|QUIZ|FEEDBACK|SURVEY (default BANNER)
 *   location, placement, size, wallet — passed through to /api/serve
 *
 * Security: messages are sent with targetOrigin '*' (the host page is
 * arbitrary). Hosts must verify `source: 'sovads-unit'` + `slotId`
 * before trusting any payload.
 */
import { NextRequest } from 'next/server'
import { SOVADS_UNIT_SOURCE, SOVADS_UNIT_PROTOCOL } from '@/lib/unit-postmessage'

function html(req: NextRequest): string {
  const { origin, searchParams } = new URL(req.url)
  const slotId = searchParams.get('slotId') || ''
  const siteId = searchParams.get('siteId') || ''
  const kind = searchParams.get('kind') || 'BANNER'
  const location = searchParams.get('location') || ''
  const placement = searchParams.get('placement') || ''
  const size = searchParams.get('size') || ''
  const wallet = searchParams.get('wallet') || ''
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || origin

  // Encode the config blob the bootstrap script needs. JSON.stringify is
  // safe for HTML embedding because we then JSON.parse it inside an inline
  // script (no HTML-context interpolation of user data).
  const config = JSON.stringify({
    slotId,
    siteId,
    kind,
    location,
    placement,
    size,
    wallet,
    apiBase,
    source: SOVADS_UNIT_SOURCE,
    protocolVersion: SOVADS_UNIT_PROTOCOL,
  })

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SovAds Unit</title>
<style>
  html, body { margin:0; padding:0; background:transparent; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#111; }
  .sa-root { box-sizing:border-box; width:100%; padding:12px; }
  .sa-banner { display:block; width:100%; height:auto; }
  .sa-card { position:relative; border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .sa-h { font-weight:600; font-size:16px; margin:0 0 8px 0; padding-right:90px; }
  .sa-sub { margin:0 0 12px 0; color:#4b5563; font-size:14px; }
  .sa-opt { display:flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid #e5e7eb; border-radius:8px; margin:6px 0; cursor:pointer; }
  .sa-opt input { accent-color:#16a34a; }
  .sa-btn { display:inline-block; background:#16a34a; color:#fff; border:0; border-radius:8px; padding:10px 14px; font-weight:600; cursor:pointer; }
  .sa-btn[disabled] { opacity:.5; cursor:not-allowed; }
  .sa-stars { display:flex; gap:6px; margin:6px 0 12px 0; }
  .sa-star { font-size:24px; cursor:pointer; color:#d1d5db; }
  .sa-star.on { color:#f59e0b; }
  .sa-input { width:100%; box-sizing:border-box; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; }
  .sa-err { color:#dc2626; font-size:13px; margin-top:8px; }
  .sa-thanks { color:#065f46; font-weight:600; }
  /* Choice tiles — used by POLL + QUIZ. Five Kahoot-style hues mapped by
     index; layout is 1×2 (2 opts), 2×2 (3–4) or 2×3 (5).
     Tap turns all tiles inert immediately and the picked tile keeps its
     colour while the others fade. */
  .sa-tiles { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; }
  .sa-tiles.sa-tiles-1 { grid-template-columns:1fr; }
  .sa-tiles.sa-tiles-5 .sa-tile-5 { grid-column:1 / span 2; }
  .sa-tile { position:relative; display:flex; align-items:center; justify-content:center; gap:6px;
    min-height:54px; padding:12px 14px; border:0; border-radius:10px; cursor:pointer;
    font-size:14px; font-weight:600; color:#fff; line-height:1.2; text-align:center;
    transition:opacity .15s ease, transform .1s ease; word-break:break-word; }
  .sa-tile:hover:not([disabled]) { transform:translateY(-1px); }
  .sa-tile[disabled] { cursor:default; }
  .sa-tile.sa-faded { opacity:.35; }
  .sa-tile.sa-picked::after { content:'✓'; position:absolute; top:6px; right:8px; font-size:14px; font-weight:800; opacity:.85; }
  .sa-tile-c1 { background:#e21b3c; }
  .sa-tile-c2 { background:#1368ce; }
  .sa-tile-c3 { background:#d89e00; color:#1c1300; }
  .sa-tile-c4 { background:#26890c; }
  .sa-tile-c5 { background:#864cbf; }
  /* Reward chip pinned to the top-right of the card */
  .sa-reward { position:absolute; top:10px; right:10px; display:inline-flex; align-items:center; gap:4px;
    padding:4px 9px; border-radius:999px; background:#f5f3f0; border:1px solid #2d2d2d;
    font-size:11px; font-weight:800; color:#2d2d2d; line-height:1; }
  .sa-reward img { width:13px; height:13px; object-fit:contain; display:block; }
  /* Saved confirmation state */
  .sa-saved { display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:18px 12px; gap:6px; text-align:center; }
  .sa-saved-icon { display:inline-flex; align-items:center; justify-content:center;
    width:38px; height:38px; border-radius:999px; background:#dcfce7; color:#065f46;
    font-size:22px; font-weight:800; }
  .sa-saved-title { font-size:15px; font-weight:700; color:#0f172a; }
  .sa-saved-sub { font-size:12px; color:#475569; }
  .sa-saved.sa-saved-err .sa-saved-icon { background:#fee2e2; color:#991b1b; }
</style>
</head>
<body>
<div id="sa-root" class="sa-root">
  <div class="sa-card"><div class="sa-h">Loading…</div></div>
</div>
<script>
(function(){
  var CFG = ${config};
  var root = document.getElementById('sa-root');

  function post(type, payload){
    try{
      window.parent.postMessage({
        source: CFG.source,
        protocolVersion: CFG.protocolVersion,
        slotId: CFG.slotId,
        type: type,
        ts: Date.now(),
        payload: payload
      }, '*');
    }catch(e){}
  }

  function emitResize(){
    var h = document.documentElement.scrollHeight;
    post('RESIZE', { width: document.documentElement.scrollWidth, height: h });
  }

  function getFingerprint(){
    try{
      var k = 'sovads_fp';
      var v = localStorage.getItem(k);
      if(!v){
        v = 'fp-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(k, v);
      }
      return v;
    }catch(e){ return 'fp-anon-' + Date.now().toString(36); }
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function url(path, qs){
    var u = CFG.apiBase + path + '?' + Object.keys(qs).filter(function(k){return qs[k] !== '' && qs[k] != null;}).map(function(k){
      return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]);
    }).join('&');
    return u;
  }

  function setupImpressionObserver(){
    try{
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if(e.isIntersecting){
            post('IMPRESSION', {});
            io.disconnect();
          }
        });
      }, { threshold: 0.5 });
      io.observe(root);
    }catch(e){
      post('IMPRESSION', {});
    }
  }

  function renderBanner(ad){
    var safeName = escapeHtml(ad.name);
    var safeUrl = ad.targetUrl;
    root.innerHTML =
      '<a id="sa-banner-link" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener nofollow">' +
        '<img class="sa-banner" alt="' + safeName + '" src="' + escapeHtml(ad.bannerUrl) + '" />' +
      '</a>';
    document.getElementById('sa-banner-link').addEventListener('click', function(){
      post('CLICK', { adId: ad.id, campaignId: ad.campaignId, targetUrl: ad.targetUrl });
    });
    post('LOADED', { kind: 'BANNER', adId: ad.id, campaignId: ad.campaignId });
    setupImpressionObserver();
    emitResize();
  }

  function submitInteraction(taskId, proof, opts){
    opts = opts || {};
    return fetch(CFG.apiBase + '/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskId,
        wallet: CFG.wallet || null,
        fingerprint: getFingerprint(),
        siteId: CFG.siteId,
        sessionId: opts.sessionId,
        step: opts.step,
        final: opts.final === true,
        proof: proof
      })
    }).then(function(r){ return r.json().then(function(j){ return { status: r.status, body: j }; }); });
  }

  function renderError(msg){
    root.innerHTML = '<div class="sa-card"><div class="sa-h">Couldn\\'t load this unit</div><div class="sa-sub">' + escapeHtml(msg || 'Try again later.') + '</div></div>';
    post('ERROR', { message: msg });
    emitResize();
  }

  function renderThanks(awarded){
    var points = awarded && awarded.points ? awarded.points : 0;
    root.innerHTML = '<div class="sa-card"><div class="sa-h sa-thanks">Thanks!</div><div class="sa-sub">' + (points ? ('You earned ' + points + ' SovPoints.') : 'Your response was recorded.') + '</div></div>';
    emitResize();
  }

  // Build the reward-chip HTML for the top-right of a poll/quiz card.
  function rewardChipHtml(task){
    var pts = Number(task.rewardPoints || 0);
    var gs  = Number(task.rewardGs || 0);
    if(!pts && !gs) return '';
    var parts = [];
    if(pts) parts.push('+' + pts);
    if(gs)  parts.push('· ' + gs + ' G$');
    return '<span class="sa-reward" aria-label="reward">' + escapeHtml(parts.join(' ')) + '</span>';
  }

  // Swap the card to a centred ✓ — used after a successful submit, after a
  // wrong-answer quiz attempt, or when the viewer has already answered.
  // Auto-closes after 'holdMs' by signalling the host (RESIZE height:0 +
  // CLOSE) so the SDK can collapse the iframe without page reflows.
  function renderSaved(opts){
    var ok = opts && opts.ok !== false;
    var title = (opts && opts.title) || (ok ? 'Saved' : 'Not quite');
    var sub = (opts && opts.sub) || '';
    var holdMs = (opts && typeof opts.holdMs === 'number') ? opts.holdMs : 1200;
    root.innerHTML =
      '<div class="sa-card">' +
        '<div class="sa-saved' + (ok ? '' : ' sa-saved-err') + '">' +
          '<div class="sa-saved-icon">' + (ok ? '✓' : '✕') + '</div>' +
          '<div class="sa-saved-title">' + escapeHtml(title) + '</div>' +
          (sub ? '<div class="sa-saved-sub">' + escapeHtml(sub) + '</div>' : '') +
        '</div>' +
      '</div>';
    emitResize();
    setTimeout(function(){
      post('CLOSE', { reason: ok ? 'submitted' : 'closed' });
      try { root.innerHTML = ''; } catch(e) {}
      // Force a 0-height resize so the host iframe collapses.
      try {
        window.parent.postMessage({
          source: CFG.source, protocolVersion: CFG.protocolVersion,
          slotId: CFG.slotId, type: 'RESIZE', ts: Date.now(),
          payload: { width: 0, height: 0 }
        }, '*');
      } catch(e) {}
    }, holdMs);
  }

  // Shared renderer for POLL + QUIZ standalone units. Renders the question
  // header, a reward chip in the top-right, then 2–5 colored option tiles.
  // First tap disables the rest, posts the answer, then auto-closes via
  // renderSaved(). Wrong QUIZ answers close with an “X Not quite” card.
  function renderChoice(task, kind){
    post('LOADED', { kind: kind, taskId: task.id, campaignId: task.campaignId });
    var opts = (task.options || []).slice(0, 5);
    if(opts.length < 2){
      renderError(kind === 'QUIZ' ? 'Quiz has no options.' : 'Poll has no options.');
      return;
    }
    var tilesCls = 'sa-tiles';
    if(opts.length === 1) tilesCls += ' sa-tiles-1';
    if(opts.length === 5) tilesCls += ' sa-tiles-5';
    var tilesHtml = opts.map(function(o, i){
      var color = 'sa-tile-c' + (((i) % 5) + 1);
      var posCls = (opts.length === 5 && i === 4) ? ' sa-tile-5' : '';
      return '<button type="button" class="sa-tile ' + color + posCls + '"' +
             ' data-id="' + escapeHtml(o.id) + '"' +
             ' data-idx="' + i + '">' +
             escapeHtml(o.label) +
             '</button>';
    }).join('');
    root.innerHTML =
      '<div class="sa-card">' +
        rewardChipHtml(task) +
        '<div class="sa-h">' + escapeHtml(task.label) + '</div>' +
        (task.description ? '<div class="sa-sub">' + escapeHtml(task.description) + '</div>' : '') +
        '<div class="' + tilesCls + '" id="sa-tiles">' + tilesHtml + '</div>' +
      '</div>';
    setupImpressionObserver();
    emitResize();

    var submitted = false;
    var tilesEl = document.getElementById('sa-tiles');
    tilesEl.addEventListener('click', function(ev){
      var btn = ev.target.closest('.sa-tile');
      if(!btn || submitted) return;
      submitted = true;
      var optionId = btn.getAttribute('data-id');

      // Lock every tile, fade the unpicked ones, mark the chosen one.
      Array.prototype.forEach.call(tilesEl.querySelectorAll('.sa-tile'), function(t){
        t.setAttribute('disabled', 'disabled');
        if(t !== btn) t.classList.add('sa-faded');
      });
      btn.classList.add('sa-picked');

      submitInteraction(task.id, { optionId: optionId }).then(function(r){
        var awarded = r.body && r.body.awarded;
        var pts = awarded && awarded.points ? awarded.points : 0;
        if(r.status === 200){
          post('COMPLETE', { completionId: r.body.completionId, awarded: awarded, optionId: optionId, kind: kind });
          renderSaved({
            ok: true,
            title: 'Saved',
            sub: pts ? ('+' + pts + ' SovPoints') : '',
            holdMs: 1200
          });
          return;
        }
        // Already answered: 409 — close politely.
        if(r.status === 409){
          renderSaved({ ok: true, title: 'Already answered', sub: '', holdMs: 1200 });
          return;
        }
        // QUIZ wrong-answer comes back as 4xx with reason=='wrong answer'.
        var reason = (r.body && (r.body.reason || r.body.error)) || 'Could not submit.';
        if(kind === 'QUIZ' && /wrong\s+answer/i.test(reason)){
          renderSaved({ ok: false, title: 'Not quite', sub: '', holdMs: 1500 });
          return;
        }
        renderSaved({ ok: false, title: 'Could not submit', sub: reason, holdMs: 1800 });
      }).catch(function(e){
        renderSaved({ ok: false, title: 'Network error', sub: String(e && e.message || e), holdMs: 1800 });
      });
    });
  }

  // Back-compat shim so existing serve responses keep working while callers
  // migrate. Both POLL and QUIZ now go through renderChoice.
  function renderPoll(task){ return renderChoice(task, 'POLL'); }
  function renderQuiz(task){ return renderChoice(task, 'QUIZ'); }

  function renderFeedback(task){
    post('LOADED', { kind: 'FEEDBACK', taskId: task.id, campaignId: task.campaignId });
    var cfg = task.feedback || {};
    var mode = cfg.mode || 'rating_and_text';
    var min = cfg.minRating || 1, max = cfg.maxRating || 5;
    var stars = '';
    if(mode !== 'text'){
      for(var i = min; i <= max; i++){
        stars += '<span class="sa-star" data-v="' + i + '">★</span>';
      }
      stars = '<div class="sa-stars" id="sa-stars">' + stars + '</div>';
    }
    var textbox = (mode !== 'rating') ? '<textarea class="sa-input" id="sa-text" rows="3" placeholder="Your thoughts (optional)"></textarea>' : '';
    root.innerHTML =
      '<div class="sa-card">' +
        '<div class="sa-h">' + escapeHtml(task.label) + '</div>' +
        (task.description ? '<div class="sa-sub">' + escapeHtml(task.description) + '</div>' : '') +
        stars + textbox +
        '<div style="margin-top:8px;"><button class="sa-btn" id="sa-submit" type="button">Submit</button></div>' +
        '<div class="sa-err" id="sa-err"></div>' +
      '</div>';
    setupImpressionObserver();
    emitResize();
    var currentRating = null;
    if(mode !== 'text'){
      var starsEl = document.getElementById('sa-stars');
      starsEl.addEventListener('click', function(ev){
        var t = ev.target;
        if(!t || !t.dataset || !t.dataset.v) return;
        currentRating = Number(t.dataset.v);
        Array.prototype.forEach.call(starsEl.children, function(c){
          c.classList.toggle('on', Number(c.dataset.v) <= currentRating);
        });
      });
    }
    document.getElementById('sa-submit').addEventListener('click', function(){
      var err = document.getElementById('sa-err');
      var textEl = document.getElementById('sa-text');
      var proof = {};
      if(mode !== 'text') proof.rating = currentRating;
      if(mode !== 'rating') proof.text = textEl ? textEl.value : '';
      submitInteraction(task.id, proof).then(function(r){
        if(r.status !== 200){ err.textContent = r.body.reason || r.body.error || 'Could not submit.'; return; }
        post('COMPLETE', { completionId: r.body.completionId, awarded: r.body.awarded });
        renderThanks(r.body.awarded);
      }).catch(function(e){ err.textContent = String(e && e.message || e); });
    });
  }

  function renderQuestion(q, idx, totalSteps, state){
    var inner = '';
    if(q.kind === 'single' || q.kind === 'multi'){
      var inputType = q.kind === 'single' ? 'radio' : 'checkbox';
      inner = (q.options || []).map(function(o){
        return '<label class="sa-opt"><input type="' + inputType + '" name="sa-q" value="' + escapeHtml(o.id) + '"/> ' + escapeHtml(o.label) + '</label>';
      }).join('');
    } else if(q.kind === 'text'){
      inner = '<textarea class="sa-input" id="sa-text" rows="3" placeholder="Your answer"></textarea>';
    } else if(q.kind === 'rating'){
      var min = q.minRating || 1, max = q.maxRating || 5;
      var stars = '';
      for(var i = min; i <= max; i++) stars += '<span class="sa-star" data-v="' + i + '">★</span>';
      inner = '<div class="sa-stars" id="sa-stars">' + stars + '</div>';
    }
    root.innerHTML =
      '<div class="sa-card">' +
        '<div class="sa-sub">Question ' + (idx + 1) + ' of ' + totalSteps + '</div>' +
        '<div class="sa-h">' + escapeHtml(q.label) + '</div>' +
        inner +
        '<div style="margin-top:8px;"><button class="sa-btn" id="sa-next" type="button">' + (idx + 1 === totalSteps ? 'Finish' : 'Next') + '</button></div>' +
        '<div class="sa-err" id="sa-err"></div>' +
      '</div>';
    emitResize();
    if(q.kind === 'rating'){
      var starsEl = document.getElementById('sa-stars');
      starsEl.addEventListener('click', function(ev){
        var t = ev.target;
        if(!t || !t.dataset || !t.dataset.v) return;
        state.currentRating = Number(t.dataset.v);
        Array.prototype.forEach.call(starsEl.children, function(c){
          c.classList.toggle('on', Number(c.dataset.v) <= state.currentRating);
        });
      });
    }
  }

  function renderSurvey(task){
    post('LOADED', { kind: 'SURVEY', taskId: task.id, campaignId: task.campaignId });
    setupImpressionObserver();
    var questions = task.questions || [];
    var totalSteps = task.totalSteps || questions.length;
    var idx = 0;
    var answers = [];
    var state = { currentRating: null, sessionId: null };

    function step(){
      var q = questions[idx];
      renderQuestion(q, idx, totalSteps, state);
      document.getElementById('sa-next').addEventListener('click', function(){
        var err = document.getElementById('sa-err');
        var answer = { questionId: q.id };
        if(q.kind === 'single' || q.kind === 'multi'){
          var checked = Array.prototype.slice.call(document.querySelectorAll('input[name="sa-q"]:checked'));
          if(q.required !== false && checked.length === 0){ err.textContent = 'Please choose an option.'; return; }
          answer.optionIds = checked.map(function(c){ return c.value; });
        } else if(q.kind === 'text'){
          var t = (document.getElementById('sa-text') || {}).value || '';
          if(q.required !== false && t.trim().length === 0){ err.textContent = 'Please write something.'; return; }
          answer.text = t;
        } else if(q.kind === 'rating'){
          if(q.required !== false && state.currentRating == null){ err.textContent = 'Please pick a rating.'; return; }
          answer.rating = state.currentRating;
        }
        answers.push(answer);
        var isFinal = idx + 1 >= totalSteps;
        submitInteraction(task.id, { answers: isFinal ? answers : [answer] }, {
          sessionId: state.sessionId || undefined,
          step: idx,
          final: isFinal,
        }).then(function(r){
          if(r.status !== 200){ err.textContent = r.body.reason || r.body.error || 'Could not submit.'; return; }
          if(r.body.kind === 'STEP'){
            state.sessionId = r.body.sessionId;
            post('INTERACTION', { kind: 'STEP', sessionId: state.sessionId, step: idx, totalSteps: totalSteps });
            state.currentRating = null;
            idx += 1;
            step();
          } else if(r.body.kind === 'SUBMIT'){
            post('COMPLETE', { completionId: r.body.completionId, awarded: r.body.awarded });
            renderThanks(r.body.awarded);
          }
        }).catch(function(e){ err.textContent = String(e && e.message || e); });
      });
    }
    step();
  }

  function boot(){
    post('READY', { kind: CFG.kind });
    if(!CFG.siteId){ renderError('siteId required'); return; }
    fetch(url('/api/serve', { siteId: CFG.siteId, kind: CFG.kind, location: CFG.location, placement: CFG.placement, size: CFG.size, wallet: CFG.wallet }))
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(j.kind === 'BANNER' && j.ad) return renderBanner(j.ad);
        if(j.kind === 'POLL'    && j.task) return renderPoll(j.task);
        if(j.kind === 'QUIZ'    && j.task) return renderQuiz(j.task);
        if(j.kind === 'FEEDBACK'&& j.task) return renderFeedback(j.task);
        if(j.kind === 'SURVEY'  && j.task) return renderSurvey(j.task);
        if(j.kind === 'NONE'){ post('NONE', {}); root.innerHTML = ''; emitResize(); return; }
        renderError(j.error || 'No unit available.');
      }).catch(function(e){ renderError(String(e && e.message || e)); });
  }

  boot();
})();
</script>
</body>
</html>`
}

export async function GET(req: NextRequest) {
  return new Response(html(req), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Allow embedding in any host. Real apps may want a publisher allow-list.
      'cache-control': 'no-store',
    },
  })
}
