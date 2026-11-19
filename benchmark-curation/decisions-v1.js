import {compareApproval, stableStringify} from '../batch2/approval.js?v=29-identities';

const api = 'https://physfix-annotator-chengye629.goldenstoat259.chatgpt.site/api';
const campaignId = 'physfixbench-benchmark-curation-v02-20261119-v1';
const storageKey = 'physfix.curation-decisions.v1.' + campaignId + '.叶程';
const fields = ['timestamp', 'problem', 'expected'];
const cleanCards = cards => cards.map(card => Object.fromEntries(fields.map(field => [field, card[field] ?? ''])));
const byKey = new Map(items.map(item => [item.key, item]));
const saved = new Map();
let drafts = {};
let token = null;
let connected = false;
let saving = false;
let timer;
let renderedKey = '';

try { drafts = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
catch { $('sync-status').textContent = '本机记录读取失败'; }

async function request(path, body) {
  const response = await fetch(api + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '保存失败'), {status: response.status});
  return data;
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(drafts)); return true; }
  catch { alert('本机保存失败，请先导出 JSON 并保持页面打开。'); return false; }
}

function payloadFor(item) { return drafts[item.key]?.payload || saved.get(item.key)?.payload; }
function sameCards(cards, original) { return compareApproval({issues:cards}, original) === 'direct'; }

function inferChoice(item, payload) {
  if (!payload?.decision) return '';
  if (payload.decision.startsWith('reject')) return 'exclude';
  if (sameCards(payload.issues, item.before)) return 'original';
  if (item.after.length && sameCards(payload.issues, item.after)) return 'proposal';
  return 'custom';
}

function stateFor(item) {
  const payload = payloadFor(item);
  return {
    choice: drafts[item.key]?.choice ?? inferChoice(item, payload),
    cards: cleanCards(payload?.issues || (item.after.length ? item.after : item.before)),
    note: payload?.note || '', status: payload?.status
  };
}

function updateStatus() {
  const complete = items.filter(item => payloadFor(item)?.status === 'submitted').length;
  $('decision-progress').textContent = `已提交 ${complete} / ${items.length}`;
  const entries = Object.values(drafts);
  const conflict = entries.some(entry => entry.conflict);
  $('sync-status').textContent = conflict ? '有保存冲突' : saving ? '同步中…' : entries.length ? '本机已保存，待同步' : connected ? '后台已保存' : '正在连接…';
  $('retry-sync').hidden = connected && !entries.length;
  for (const button of document.querySelectorAll('#queue [data-key]')) {
    const payload = payloadFor(byKey.get(button.dataset.key));
    button.dataset.submitted = String(payload?.status === 'submitted');
    button.dataset.draft = String(payload?.status === 'draft');
  }
  if (active && $('decision-saved')) {
    $('decision-saved').textContent = drafts[active.key] ? '本机已保存，等待后台同步' : saved.has(active.key) ? (payloadFor(active)?.status === 'submitted' ? '判断已提交到后台' : '意见已保存到后台') : '';
  }
}

function optionsFor(item) {
  if (item.kind === 'rewritten') return [['proposal','同意改写'], ['original','保留原卡'], ['custom','自行修改卡片']];
  if (item.kind === 'removed') return [['exclude','同意移除卡片'], ['original','恢复原卡'], ['custom','修改卡片后恢复']];
  return [['exclude','维持暂缓'], ['original','恢复收录'], ['custom','修改卡片后收录']];
}

function editorHTML(cards) {
  return cards.map((card, index) => `<div class="edit-card" data-edit-card><div class="edit-heading"><strong>卡片 ${index + 1}</strong><button type="button" data-remove-card="${index}">删除</button></div><label>时间戳（秒）<input type="text" data-field="timestamp" maxlength="80" value="${escape(card.timestamp)}"></label><label>物理问题<textarea data-field="problem" maxlength="4000" rows="3">${escape(card.problem)}</textarea></label><label>修改后应有的正确状态<textarea data-field="expected" maxlength="4000" rows="3">${escape(card.expected)}</textarea></label></div>`).join('');
}

function renderDecision() {
  if (!active) { updateStatus(); return; }
  const state = stateFor(active);
  renderedKey = active.key;
  const choices = optionsFor(active).map(([value, label]) => `<label class="choice"><input type="radio" name="curation-choice" value="${value}" ${state.choice === value ? 'checked' : ''}>${label}</label>`).join('');
  const conflict = drafts[active.key]?.conflict;
  $('decision-panel').innerHTML = `<h3>我的判断</h3><div class="choices">${choices}</div><div id="custom-cards" ${state.choice === 'custom' ? '' : 'hidden'}><div id="edit-cards">${editorHTML(state.cards)}</div><button type="button" id="add-decision-card">+ 添加卡片</button></div><label>意见<textarea id="decision-note" rows="2" maxlength="4000" placeholder="写下原因或修改意见（选填）">${escape(state.note)}</textarea></label><p id="decision-error" class="decision-error" role="alert" hidden></p>${conflict ? '<div class="decision-conflict"><p>后台已有新版本，请选择要保留的内容。</p><button type="button" id="use-cloud">使用后台版本</button><button type="button" id="use-local">保留本机版本并同步</button></div>' : ''}<div class="decision-actions"><button type="button" id="submit-decision" class="primary">提交并下一条</button><button type="button" id="defer-decision">稍后再看</button></div><span id="decision-saved" role="status"></span>`;
  updateStatus();
}

function error(message) {
  if (!$('decision-error')) return;
  $('decision-error').textContent = message;
  $('decision-error').hidden = !message;
}

function readEditor() {
  return [...document.querySelectorAll('[data-edit-card]')].map(element => Object.fromEntries(fields.map(field => [field, element.querySelector(`[data-field="${field}"]`).value])));
}

function storeDraft(status = 'draft') {
  if (!active || active.key !== renderedKey) return false;
  const choice = document.querySelector('input[name="curation-choice"]:checked')?.value || '';
  let cards = stateFor(active).cards;
  if (choice === 'original') cards = cleanCards(active.before);
  if (choice === 'proposal') cards = cleanCards(active.after);
  if (choice === 'custom') cards = readEditor();
  if (choice === 'exclude') cards = [];
  if (status === 'submitted' && !choice) { error('请选择一个判断。'); return false; }
  if (status === 'submitted' && choice !== 'exclude' && (!cards.length || cards.some(card => fields.some(field => !card[field].trim())))) {
    error('请填写完整的时间戳、物理问题和正确状态。'); return false;
  }
  const old = drafts[active.key];
  const decision = choice === 'exclude' ? 'reject_no_clear_issue' : choice ? (sameCards(cards, active.before) ? 'pass' : 'pass_modified') : '';
  drafts[active.key] = {
    choice, base_version: old?.base_version ?? saved.get(active.key)?.version ?? 0,
    ...(old?.conflict ? {conflict: true} : {}),
    payload: {record_id:active.key, status, decision, issues: cards, note:$('decision-note').value, source_version:1, updated_at:new Date().toISOString()}
  };
  if (!persist()) return false;
  error('');
  updateStatus();
  clearTimeout(timer);
  if (status === 'draft') timer = setTimeout(() => void flush(), 600);
  return true;
}

async function flush() {
  if (saving || !connected) return;
  saving = true;
  updateStatus();
  try {
    for (;;) {
      const entry = Object.entries(drafts).find(([key, value]) => byKey.has(key) && !value.conflict);
      if (!entry) break;
      const [key, current] = entry;
      const sent = structuredClone(current);
      try {
        const data = await request('/admin/benchmark-curation/save', {campaign_id:campaignId, base_version:sent.base_version, review:sent.payload});
        saved.set(key, data.review);
        if (stableStringify(drafts[key]?.payload) === stableStringify(sent.payload)) delete drafts[key];
        else if (drafts[key]) drafts[key].base_version = data.review.version;
        persist();
      } catch (failure) {
        if (failure.status === 409 && drafts[key]) {
          drafts[key].conflict = true;
          persist();
          if (active?.key === key) renderDecision();
        } else {
          connected = false;
          error('后台暂时无法保存，本机记录已保留。');
        }
        break;
      }
    }
  } finally { saving = false; updateStatus(); }
}

async function connect() {
  try {
    const identity = await request('/claim', {name:'叶程'});
    token = identity.token;
    const data = await request('/admin/benchmark-curation');
    if (data.campaign.id !== campaignId || data.tasks.length !== items.length) throw new Error('审核任务版本不一致');
    for (const task of data.tasks) {
      if (!task.review) continue;
      saved.set(task.record_id, task.review);
      const local = drafts[task.record_id];
      if (!local) continue;
      if (stableStringify(local.payload) === stableStringify(task.review.payload)) delete drafts[task.record_id];
      else if (local.base_version !== task.review.version) local.conflict = true;
    }
    connected = true;
    persist();
    renderDecision();
    await flush();
  } catch {
    connected = false;
    updateStatus();
    error('暂时无法连接后台，可以继续审核，本机记录会自动重试同步。');
  }
}

function advance() {
  const ordered = [...match().filter(item => item.key !== active?.key), ...items.filter(item => item.kind !== kind)];
  const next = ordered.find(item => payloadFor(item)?.status !== 'submitted');
  if (next) { active = next; kind = next.kind; $('search').value = ''; render(); }
  else { render(); error('当前筛选已处理完，可切换类型继续核对或导出 JSON。'); }
}

function exportData() {
  const records = items.filter(item => payloadFor(item)).map(item => {
    const payload = payloadFor(item);
    const choice = drafts[item.key]?.choice ?? inferChoice(item, payload);
    return {
      key:item.key, benchmark_id:item.id, record_id:item.record_id, type:item.kind, card_number:item.card ?? null,
      status:payload.status, action:choice, action_label:optionsFor(item).find(option => option[0] === choice)?.[1] || '待判断',
      issues:payload.issues, note:payload.note, updated_at:payload.updated_at,
      original_issues:item.before, proposed_issues:item.after, synced:!drafts[item.key], cloud_version:saved.get(item.key)?.version ?? 0
    };
  });
  const result = {schema_version:'physfix-curation-decisions-v1', campaign_id:campaignId, reviewer:'叶程', exported_at:new Date().toISOString(), total:items.length, submitted:records.filter(record => record.status === 'submitted').length, records};
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'benchmark核对_叶程_' + new Date().toISOString().slice(0,10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

window.curationDecisionMatches = item => $('decision-filter').value === 'all' || (payloadFor(item)?.status === 'submitted') === ($('decision-filter').value === 'done');
window.addEventListener('curation-case-change', renderDecision);
$('decision-filter').addEventListener('change', render);
$('decision-panel').addEventListener('input', event => {
  if (event.target.matches('textarea,input[type="text"]')) storeDraft();
});
$('decision-panel').addEventListener('change', event => {
  if (!event.target.matches('input[name="curation-choice"]')) return;
  $('custom-cards').hidden = event.target.value !== 'custom';
  if (event.target.value === 'custom') $('edit-cards').innerHTML = editorHTML(stateFor(active).cards.length ? stateFor(active).cards : cleanCards(active.after.length ? active.after : active.before));
  storeDraft();
});
$('decision-panel').addEventListener('click', async event => {
  const target = event.target;
  if (target.id === 'submit-decision' || target.id === 'defer-decision') {
    if (!storeDraft(target.id === 'submit-decision' ? 'submitted' : 'draft')) return;
    clearTimeout(timer);
    void flush();
    advance();
  }
  if (target.hasAttribute('data-remove-card')) {
    target.closest('[data-edit-card]').remove(); storeDraft();
  }
  if (target.id === 'add-decision-card') {
    const cards = readEditor();
    if (cards.length >= 50) { error('最多保留 50 张卡片。'); return; }
    cards.push({timestamp:'', problem:'', expected:''});
    $('edit-cards').innerHTML = editorHTML(cards); storeDraft();
  }
  if (target.id === 'use-cloud') { delete drafts[active.key]; persist(); renderDecision(); }
  if (target.id === 'use-local') {
    const data = await request('/admin/benchmark-curation');
    const cloud = data.tasks.find(task => task.record_id === active.key)?.review;
    if (cloud) saved.set(active.key, cloud);
    drafts[active.key].base_version = cloud?.version ?? 0;
    delete drafts[active.key].conflict;
    persist(); renderDecision(); void flush();
  }
});
$('export-decisions').addEventListener('click', exportData);
$('retry-sync').addEventListener('click', () => void (connected ? flush() : connect()));
window.addEventListener('online', () => void connect());
window.addEventListener('beforeunload', event => {
  if (Object.keys(drafts).length) { event.preventDefault(); event.returnValue = ''; }
});
setInterval(() => void (connected ? flush() : connect()), 20000);
renderDecision();
void connect();
