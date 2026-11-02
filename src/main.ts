import './style.css';
import type { Bank, Question } from './types';
import { drawExam, scoreExam, EXAM_DURATION_MS } from './exam';
import { recordAnswer } from './wrongbook';
import { loadProgress, saveProgress, emptyProgress, exportProgress, importProgress, type Progress, type ExamRecord } from './progress';

const app = document.getElementById('app')!;
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const EXAM_KEY = 'moto-k1:exam-session';

let bank: Bank;
let byId = new Map<string, Question>();
let chapters: { name: string; ids: string[] }[] = [];
let P: Progress;
let cleanup: (() => void) | null = null;

// ---------- utils ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const save = () => { try { saveProgress(P); } catch { toast('保存失败：浏览器存储不可用或已满'); } };
function toast(msg: string, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function confirmModal(title: string, body: string, okText = '确定', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div>${body}</div>
      <div class="actions"><button class="btn" data-a="no">取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${esc(okText)}</button></div></div>`;
    const done = (v: boolean) => { bg.remove(); resolve(v); };
    bg.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a) done(a === 'ok'); else if (e.target === bg) done(false);
    });
    document.body.appendChild(bg);
    (bg.querySelector('[data-a=ok]') as HTMLButtonElement).focus();
  });
}
function sheetModal(title: string, html: string, onPick: (i: number) => void) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${html}<div class="actions"><button class="btn" data-close>关闭</button></div></div>`;
  bg.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const i = el.closest('[data-i]')?.getAttribute('data-i');
    if (i != null) { bg.remove(); onPick(+i); } else if (el === bg || el.closest('[data-close]')) bg.remove();
  });
  document.body.appendChild(bg);
  bg.querySelector('.cur')?.scrollIntoView({ block: 'center' });
}
function header(title: string, back: string | null = '#/', right = '') {
  return `<header class="bar">${back !== null ? `<a class="icon-btn" href="${back}" aria-label="返回" style="display:grid;place-items:center;text-decoration:none">‹ 返回</a>` : '<span class="icon-btn"></span>'}
    <h1>${esc(title)}</h1>${right || '<span class="icon-btn"></span>'}</header>`;
}
function render(html: string) {
  cleanup?.(); cleanup = null;
  document.querySelectorAll('.modal-bg').forEach((m) => m.remove());
  app.innerHTML = (navigator.onLine ? '' : '<div class="offline">离线模式 · 题库已缓存，可正常刷题</div>') + html;
  window.scrollTo(0, 0);
}
function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtDate(t: number) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function questionHTML(q: Question, idx: number, total: number, extra = '') {
  return `<div class="q-meta"><span><span class="tag">${q.type === 'judge' ? '判断题' : '单选题'}</span>${esc(q.chapter)}</span><span>${idx + 1} / ${total}</span></div>
    <p class="stem">${esc(q.stem)}</p>
    ${q.image ? `<img class="q-img" src="./data/${esc(q.image)}" alt="题目配图" loading="eager" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'sub',textContent:'（图片加载失败）'}))">` : ''}
    <div class="opts">${q.options.map((o, i) => `<button class="opt" data-opt="${i}"><span class="k">${q.type === 'judge' ? (i === 0 ? '✓' : '✗') : KEYS[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>${extra}`;
}
function markOptions(root: HTMLElement, q: Question, choice: number | null, reveal: boolean) {
  root.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => {
    const i = +b.dataset.opt!;
    b.classList.remove('sel', 'right', 'wrong');
    if (reveal) {
      b.disabled = true;
      if (i === q.answer) b.classList.add('right');
      else if (i === choice) b.classList.add('wrong');
    } else if (i === choice) b.classList.add('sel');
  });
}
function explainHTML(q: Question, choice: number | null) {
  const ok = choice === q.answer;
  const ans = q.type === 'judge' ? q.options[q.answer] : `${KEYS[q.answer]}. ${q.options[q.answer]}`;
  return `<div class="explain"><div class="verdict ${ok ? 'ok' : 'bad'}">${choice == null ? '未作答' : ok ? '回答正确' : '回答错误'} · 正确答案：${esc(ans)}</div>${esc(q.explanation || '暂无解析')}</div>`;
}
function swipe(el: HTMLElement, onLeft: () => void, onRight: () => void) {
  let x = 0, y = 0;
  el.addEventListener('touchstart', (e) => { x = e.touches[0].clientX; y = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x, dy = e.changedTouches[0].clientY - y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
  }, { passive: true });
}

// ---------- home ----------
function home() {
  const answered = Object.keys(P.answered).filter((id) => byId.has(id));
  const correct = answered.filter((id) => P.answered[id].correct).length;
  const wrongN = Object.keys(P.wrongBook).filter((id) => byId.has(id)).length;
  const best = P.exams.length ? Math.max(...P.exams.map((e) => e.score)) : null;
  const session = loadExamSession();
  render(`${header('摩托车科目一', null)}<main>
    <section class="hero"><h2>摩托车科目一刷题</h2><p>${esc(bank.name)} · 共 ${bank.questions.length} 题 · 无广告 · 离线可用</p>
      <div class="stats"><div><b>${answered.length}</b><span>已练习</span></div><div><b>${answered.length ? Math.round((correct / answered.length) * 100) + '%' : '—'}</b><span>正确率</span></div><div><b>${best ?? '—'}</b><span>模考最高</span></div></div></section>
    <div class="grid">
      <a class="tile" href="#/chapters"><span class="t">顺序练习</span><span class="s">按章节，自动记住进度</span></a>
      <a class="tile" href="#/exam"><span class="t">模拟考试</span><span class="s">${session ? '有未完成的考试' : '50 题 · 45 分钟'}</span>${session ? '<span class="badge">继续</span>' : ''}</a>
      <a class="tile" href="#/wrong"><span class="t">错题本</span><span class="s">连对 2 次自动移出</span>${wrongN ? `<span class="badge">${wrongN} 题</span>` : ''}</a>
      <a class="tile" href="#/me"><span class="t">记录与设置</span><span class="s">考试记录 · 导出/导入进度</span></a>
    </div>
    <p class="note">题库来源：<a href="${esc(bank.source)}" target="_blank" rel="noopener">公开网络数据</a>（版本 ${esc(bank.version)}）<br>题库仅供学习交流，版权归原作者，侵权联系删除。考试规则以当地车管所 / 交管12123 为准。</p>
  </main>`);
}

// ---------- chapters ----------
function chapterList() {
  const rows = [{ name: '全部题目', ids: bank.questions.map((q) => q.id), key: '__all__' }, ...chapters.map((c) => ({ ...c, key: c.name }))];
  render(`${header('顺序练习')}<main><div class="list">${rows.map((c, i) => {
    const done = c.ids.filter((id) => P.answered[id]).length;
    const pos = P.chapterPos[c.key] ?? 0;
    const pct = Math.round((done / c.ids.length) * 100);
    return `<a class="row" href="#/practice/${i}"><div class="main"><div class="name">${esc(c.name)}</div>
      <div class="sub">${c.ids.length} 题 · 已做 ${done}${pos > 0 ? ` · 上次到第 ${Math.min(pos + 1, c.ids.length)} 题` : ''}</div>
      <div class="progress"><i style="width:${pct}%"></i></div></div><span class="chev">›</span></a>`;
  }).join('')}</div>
  <p class="note">每章进度单独保存，答错的题自动进入错题本。</p></main>`);
}

// ---------- practice (chapter or wrong book) ----------
function practice(title: string, ids: string[], posKey: string | null, back: string, isWrong = false) {
  if (!ids.length) {
    render(`${header(title, back)}<main><div class="empty"><div class="big">🎉</div>${isWrong ? '错题本是空的，继续保持！' : '这一章暂无题目'}</div>
      <div class="footer-nav" style="position:static;border:0"><a class="btn primary" href="#/chapters" style="display:grid;place-items:center;text-decoration:none">去练习</a></div></main>`);
    return;
  }
  let i = Math.min(posKey ? P.chapterPos[posKey] ?? 0 : 0, ids.length - 1);
  // 当前会话中的作答（错题本模式每次重新作答）
  const sessionChoice = new Map<string, number>();
  const show = () => {
    const q = byId.get(ids[i])!;
    const prev = isWrong ? sessionChoice.get(q.id) : sessionChoice.get(q.id) ?? P.answered[q.id]?.choice;
    const wb = P.wrongBook[q.id];
    render(`${header(title, back, `<button class="icon-btn" id="jump" aria-label="题号">${i + 1}/${ids.length}</button>`)}
      <main id="q">${questionHTML(q, i, ids.length, isWrong && wb ? `<p class="sub" id="wbinfo" style="margin-top:12px">已错 ${wb.wrongCount} 次 · 已连对 ${wb.streak} 次（连对 2 次移出）</p>` : '')}<div id="ex"></div></main>
      <div class="footer-nav"><button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>上一题</button><button class="btn primary" id="next">${i === ids.length - 1 ? '完成' : '下一题'}</button></div>`);
    const main = document.getElementById('q')!;
    const reveal = (choice: number) => {
      markOptions(main, q, choice, true);
      document.getElementById('ex')!.innerHTML = explainHTML(q, choice);
    };
    if (prev != null) reveal(prev);
    main.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => b.addEventListener('click', () => {
      if (sessionChoice.has(q.id) || (!isWrong && P.answered[q.id] && prev != null)) return;
      const choice = +b.dataset.opt!;
      const correct = choice === q.answer;
      sessionChoice.set(q.id, choice);
      P.answered[q.id] = { choice, correct };
      const before = !!P.wrongBook[q.id];
      P.wrongBook = recordAnswer(P.wrongBook, q.id, correct);
      save();
      reveal(choice);
      const wi = document.getElementById('wbinfo'), nw = P.wrongBook[q.id];
      if (wi) wi.textContent = nw ? `已错 ${nw.wrongCount} 次 · 已连对 ${nw.streak} 次（连对 2 次移出）` : '已移出错题本 ✓';
      if (isWrong && before && !P.wrongBook[q.id]) toast('已连对 2 次，移出错题本 ✓');
      else if (!before && P.wrongBook[q.id]) toast('已加入错题本');
      if (correct && i < ids.length - 1) setTimeout(() => { if (location.hash === cur) go(1); }, 650);
    }));
    const cur = location.hash;
    document.getElementById('prev')!.onclick = () => go(-1);
    document.getElementById('next')!.onclick = () => (i === ids.length - 1 ? finish() : go(1));
    document.getElementById('jump')!.onclick = () => sheetModal('选择题号', `<div class="sheet">${ids.map((id, k) => {
      const a = isWrong ? (sessionChoice.has(id) ? { correct: sessionChoice.get(id) === byId.get(id)!.answer } : null) : P.answered[id];
      return `<button data-i="${k}" class="${a ? (a.correct ? 'right' : 'wrong') : ''} ${k === i ? 'cur' : ''}">${k + 1}</button>`;
    }).join('')}</div>`, (k) => { i = k; persist(); show(); });
    swipe(main, () => i < ids.length - 1 && go(1), () => i > 0 && go(-1));
  };
  const persist = () => { if (posKey) { P.chapterPos[posKey] = i; save(); } };
  const go = (d: number) => { i = Math.max(0, Math.min(ids.length - 1, i + d)); persist(); show(); };
  const finish = () => {
    if (isWrong) { const left = Object.keys(P.wrongBook).filter((id) => byId.has(id)).length; toast(left ? `本轮结束，错题本还剩 ${left} 题` : '错题本已清空 🎉'); location.hash = '#/wrong'; return; }
    toast('本章已到最后一题'); location.hash = back;
  };
  show();
}

// ---------- exam ----------
type ExamSession = { ids: string[]; answers: (number | null)[]; startedAt: number; cur: number };
function loadExamSession(): ExamSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(EXAM_KEY) || 'null');
    if (s && Array.isArray(s.ids) && s.ids.every((id: string) => byId.has(id))) return s;
  } catch { /* ignore */ }
  return null;
}
const saveExamSession = (s: ExamSession | null) => { try { s ? localStorage.setItem(EXAM_KEY, JSON.stringify(s)) : localStorage.removeItem(EXAM_KEY); } catch { /* ignore */ } };

function examIntro() {
  const s = loadExamSession();
  if (s && Date.now() - s.startedAt >= EXAM_DURATION_MS) { submitExam(s, true); return; }
  render(`${header('模拟考试')}<main>
    <div class="list"><div class="row"><div class="main"><div class="name">题量</div></div><span>50 题（单选 20 + 判断 30）</span></div>
    <div class="row"><div class="main"><div class="name">时长</div></div><span>45 分钟</span></div>
    <div class="row"><div class="main"><div class="name">计分</div></div><span>每题 2 分，90 分合格</span></div></div>
    <p class="note" style="text-align:left">从全国题库随机抽题；交卷前可修改答案，时间到自动交卷。考完可回看每题答案与解析，答错的题自动进入错题本。</p>
    <div class="footer-nav" style="position:static;border:0;padding:0;margin-top:16px;flex-direction:column">
      ${s ? `<button class="btn primary" id="resume">继续上次考试（剩 ${fmtTime(EXAM_DURATION_MS - (Date.now() - s.startedAt))}）</button><button class="btn" id="start">放弃并重新开始</button>` : '<button class="btn primary" id="start">开始考试</button>'}
    </div></main>`);
  document.getElementById('resume')?.addEventListener('click', () => examRun(s!));
  document.getElementById('start')!.addEventListener('click', async () => {
    if (s && !(await confirmModal('重新开始？', '上次未完成的考试将被丢弃。', '重新开始', true))) return;
    let qs: Question[];
    try { qs = drawExam(bank.questions); } catch (e) { toast('题库题量不足，无法组卷：' + (e as Error).message, 4000); return; }
    const ns: ExamSession = { ids: qs.map((q) => q.id), answers: qs.map(() => null), startedAt: Date.now(), cur: 0 };
    saveExamSession(ns); examRun(ns);
  });
}

function examRun(s: ExamSession) {
  let submitted = false;
  const remaining = () => EXAM_DURATION_MS - (Date.now() - s.startedAt);
  const show = () => {
    const q = byId.get(s.ids[s.cur])!;
    const done = s.answers.filter((a) => a != null).length;
    render(`${header('模拟考试', '#/exam', `<span class="timer" id="timer">${fmtTime(remaining())}</span>`)}
      <main id="q">${questionHTML(q, s.cur, s.ids.length)}</main>
      <div class="footer-nav"><button class="btn" id="prev" ${s.cur === 0 ? 'disabled' : ''}>上一题</button>
      <button class="btn" id="sheet">答题卡 ${done}/50</button>
      <button class="btn primary" id="next">${s.cur === s.ids.length - 1 ? '交卷' : '下一题'}</button></div>`);
    const main = document.getElementById('q')!;
    markOptions(main, q, s.answers[s.cur], false);
    main.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => b.addEventListener('click', () => {
      s.answers[s.cur] = +b.dataset.opt!; saveExamSession(s);
      markOptions(main, q, s.answers[s.cur], false);
      const at = s.cur;
      if (s.cur < s.ids.length - 1) setTimeout(() => { if (s.cur === at && !submitted) go(1); }, 280);
      else document.getElementById('sheet')!.textContent = `答题卡 ${s.answers.filter((a) => a != null).length}/50`;
    }));
    document.getElementById('prev')!.onclick = () => go(-1);
    document.getElementById('next')!.onclick = () => (s.cur === s.ids.length - 1 ? trySubmit() : go(1));
    document.getElementById('sheet')!.onclick = () => { sheetModal('答题卡', `<div class="sheet">${s.ids.map((_, k) =>
      `<button data-i="${k}" class="${s.answers[k] != null ? 'done' : ''} ${k === s.cur ? 'cur' : ''}">${k + 1}</button>`).join('')}</div>
      <div class="actions"><button class="btn primary" id="sheet-submit">交卷</button></div>`, (k) => { s.cur = k; saveExamSession(s); show(); });
      document.getElementById('sheet-submit')?.addEventListener('click', () => { document.querySelector('.modal-bg')?.remove(); trySubmit(); });
    };
    swipe(main, () => s.cur < s.ids.length - 1 && go(1), () => s.cur > 0 && go(-1));
    const timer = setInterval(tick, 500);
    cleanup = () => clearInterval(timer);
  };
  const tick = () => {
    const r = remaining();
    const el = document.getElementById('timer');
    if (el) { el.textContent = fmtTime(r); el.classList.toggle('low', r < 5 * 60 * 1000); }
    if (r <= 0 && !submitted) { submitted = true; toast('时间到，已自动交卷'); submitExam(s, true); }
  };
  const go = (d: number) => { s.cur = Math.max(0, Math.min(s.ids.length - 1, s.cur + d)); saveExamSession(s); show(); };
  const trySubmit = async () => {
    const left = s.answers.filter((a) => a == null).length;
    if (!(await confirmModal('确认交卷？', left ? `还有 <b>${left}</b> 题未作答，未答按错误计分。` : '已全部作答。', '交卷'))) return;
    if (submitted) return;
    submitted = true; submitExam(s, false);
  };
  show();
}

function submitExam(s: ExamSession, timeout: boolean) {
  const qs = s.ids.map((id) => byId.get(id)!);
  const r = scoreExam(qs, s.answers);
  const rec: ExamRecord = { at: Date.now(), score: r.score, passed: r.passed, durationMs: Math.min(EXAM_DURATION_MS, Date.now() - s.startedAt), questionIds: s.ids, answers: s.answers };
  qs.forEach((q, k) => {
    const a = s.answers[k];
    if (a == null) return;
    P.answered[q.id] = { choice: a, correct: a === q.answer };
    P.wrongBook = recordAnswer(P.wrongBook, q.id, a === q.answer);
  });
  // 未作答题也加入错题本
  qs.forEach((q, k) => { if (s.answers[k] == null) P.wrongBook = recordAnswer(P.wrongBook, q.id, false); });
  P.exams.unshift(rec);
  P.exams = P.exams.slice(0, 50);
  save(); saveExamSession(null);
  if (timeout) toast('时间到，已自动交卷');
  location.hash = '#/result/0';
}

function result(n: number) {
  const rec = P.exams[n];
  if (!rec || !rec.questionIds.every((id) => byId.has(id))) {
    render(`${header('考试结果', '#/me')}<main><div class="empty"><div class="big">📄</div>找不到这次考试记录（可能题库已更换）</div></main>`); return;
  }
  let filter: 'all' | 'wrong' = 'wrong';
  const qs = rec.questionIds.map((id) => byId.get(id)!);
  const draw = () => {
    const items = qs.map((q, k) => ({ q, k, a: rec.answers[k] })).filter((x) => filter === 'all' || x.a !== x.q.answer);
    const wrong = qs.filter((q, k) => rec.answers[k] !== q.answer).length;
    render(`${header('考试结果', '#/', '<a class="icon-btn" href="#/exam" style="display:grid;place-items:center;text-decoration:none">再考</a>')}<main>
      <div class="score"><div class="num ${rec.passed ? 'pass' : 'fail'}">${rec.score}</div>
        <div style="font-weight:600;font-size:18px">${rec.passed ? '合格 🎉' : '不合格，再接再厉'}</div>
        <div class="desc">答对 ${50 - wrong} 题 · 错/未答 ${wrong} 题 · 用时 ${fmtTime(rec.durationMs)} · ${fmtDate(rec.at)}</div></div>
      <div class="section-title">答题回看</div>
      <div class="segment"><button data-f="wrong" class="${filter === 'wrong' ? 'on' : ''}">只看错题（${wrong}）</button><button data-f="all" class="${filter === 'all' ? 'on' : ''}">全部（50）</button></div>
      ${items.length ? `<div class="list">${items.map(({ q, k, a }) => `<a class="row" href="#/review/${n}/${k}"><div class="main"><div class="name">${k + 1}. ${esc(q.stem)}</div>
        <div class="sub" style="color:${a === q.answer ? 'var(--ok)' : 'var(--bad)'}">${a == null ? '未作答' : a === q.answer ? '正确' : '错误'}</div></div><span class="chev">›</span></a>`).join('')}</div>`
        : '<div class="empty"><div class="big">💯</div>全部答对，没有错题</div>'}
    </main>`);
    app.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f as any; draw(); });
  };
  draw();
}

function review(n: number, k: number) {
  const rec = P.exams[n];
  if (!rec) { location.hash = '#/me'; return; }
  const q = byId.get(rec.questionIds[k]);
  if (!q) { location.hash = `#/result/${n}`; return; }
  render(`${header('答案回看', `#/result/${n}`)}<main id="q">${questionHTML(q, k, rec.questionIds.length)}${explainHTML(q, rec.answers[k])}</main>
    <div class="footer-nav"><button class="btn" id="prev" ${k === 0 ? 'disabled' : ''}>上一题</button><button class="btn primary" id="next" ${k === rec.questionIds.length - 1 ? 'disabled' : ''}>下一题</button></div>`);
  markOptions(document.getElementById('q')!, q, rec.answers[k], true);
  document.getElementById('prev')!.onclick = () => (location.hash = `#/review/${n}/${k - 1}`);
  document.getElementById('next')!.onclick = () => (location.hash = `#/review/${n}/${k + 1}`);
  swipe(document.getElementById('q')!, () => k < rec.questionIds.length - 1 && (location.hash = `#/review/${n}/${k + 1}`), () => k > 0 && (location.hash = `#/review/${n}/${k - 1}`));
}

// ---------- wrong book ----------
function wrongList() {
  const ids = Object.entries(P.wrongBook).filter(([id]) => byId.has(id)).sort((a, b) => b[1].addedAt - a[1].addedAt).map(([id]) => id);
  if (!ids.length) {
    render(`${header('错题本')}<main><div class="empty"><div class="big">📒</div>还没有错题<br><span style="font-size:14px">练习或模考中答错的题会自动收录到这里，<br>在错题本里连续答对 2 次即移出。</span></div>
      <div class="footer-nav" style="position:static;border:0"><a class="btn primary" href="#/chapters" style="display:grid;place-items:center;text-decoration:none">去练习</a></div></main>`);
    return;
  }
  render(`${header('错题本', '#/', '<button class="icon-btn" id="clear">清空</button>')}<main>
    <button class="btn primary" id="go" style="width:100%">开始复习（${ids.length} 题）</button>
    <div class="section-title">最近收录</div>
    <div class="list">${ids.map((id, k) => { const q = byId.get(id)!; const w = P.wrongBook[id];
      return `<a class="row" href="#/wrong/do/${k}"><div class="main"><div class="name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.stem)}</div>
      <div class="sub">错 ${w.wrongCount} 次 · 已连对 ${w.streak}/2 · ${esc(q.chapter)}</div></div><span class="chev">›</span></a>`; }).join('')}</div></main>`);
  document.getElementById('go')!.onclick = () => (location.hash = '#/wrong/do/0');
  document.getElementById('clear')!.onclick = async () => {
    if (await confirmModal('清空错题本？', `将移除全部 ${ids.length} 道错题，此操作不可撤销。`, '清空', true)) { P.wrongBook = {}; save(); toast('错题本已清空'); wrongList(); }
  };
}
let wrongSnapshot: string[] = [];
function wrongDo(start: number) {
  // 复习期间固定题目列表，避免移出后题号跳动
  const live = Object.entries(P.wrongBook).filter(([id]) => byId.has(id)).sort((a, b) => b[1].addedAt - a[1].addedAt).map(([id]) => id);
  if (!wrongSnapshot.length || !live.every((id) => wrongSnapshot.includes(id))) wrongSnapshot = live;
  const ids = wrongSnapshot.slice(start).concat(wrongSnapshot.slice(0, start));
  practice('错题复习', ids, null, '#/wrong', true);
}

// ---------- me / settings ----------
function me() {
  render(`${header('记录与设置')}<main>
    <div class="section-title">模拟考试记录</div>
    ${P.exams.length ? `<div class="list">${P.exams.map((e, n) => `<a class="row" href="#/result/${n}"><div class="main"><div class="name">${e.score} 分 · ${e.passed ? '合格' : '不合格'}</div>
      <div class="sub">${fmtDate(e.at)} · 用时 ${fmtTime(e.durationMs)}</div></div><span class="chev">›</span></a>`).join('')}</div>`
      : '<div class="list"><div class="row"><div class="main sub">暂无记录，去考一次吧</div><a class="icon-btn" href="#/exam" style="display:grid;place-items:center;text-decoration:none">模考</a></div></div>'}
    <div class="section-title">学习进度</div>
    <div class="list">
      <button class="row" id="exp"><div class="main"><div class="name">导出进度</div><div class="sub">下载 JSON 文件，可在其他设备导入</div></div><span class="chev">›</span></button>
      <label class="row" style="cursor:pointer"><div class="main"><div class="name">导入进度</div><div class="sub">从导出的 JSON 文件恢复（会覆盖当前进度）</div></div><span class="chev">›</span><input type="file" id="imp" accept="application/json,.json" hidden></label>
      <button class="row" id="reset"><div class="main"><div class="name" style="color:var(--bad)">重置全部进度</div><div class="sub">清除练习记录、错题本和考试记录</div></div></button>
    </div>
    <div class="section-title">题库</div>
    <div class="list"><div class="row"><div class="main"><div class="name">${esc(bank.name)}</div><div class="sub">${bank.questions.length} 题 · 版本 ${esc(bank.version)}</div></div></div>
      <a class="row" href="${esc(bank.source)}" target="_blank" rel="noopener"><div class="main"><div class="name">题库来源</div><div class="sub" style="word-break:break-all">${esc(bank.source)}</div></div><span class="chev">›</span></a></div>
    <p class="note">题库仅供学习交流，版权归原作者，侵权联系删除。<br>进度只保存在本机浏览器中，清除浏览器数据会丢失，建议定期导出。<br>代码以 MIT 协议开源。</p>
  </main>`);
  document.getElementById('exp')!.onclick = () => {
    const blob = new Blob([exportProgress(P)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob); a.download = `moto-k1-progress-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出进度文件');
  };
  (document.getElementById('imp') as HTMLInputElement).onchange = async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0]; input.value = '';
    if (!f) return;
    try {
      const next = importProgress(await f.text());
      if (!(await confirmModal('导入进度？', `将用文件中的进度（已练 ${Object.keys(next.answered).length} 题、错题 ${Object.keys(next.wrongBook).length} 题、考试 ${next.exams.length} 次）覆盖当前进度。`, '导入'))) return;
      P = next; save(); toast('导入成功'); me();
    } catch (err) { toast('导入失败：' + (err as Error).message, 3500); }
  };
  document.getElementById('reset')!.onclick = async () => {
    if (await confirmModal('重置全部进度？', '练习记录、错题本、考试记录都会被清除，且不可恢复。建议先导出。', '重置', true)) {
      P = emptyProgress(bank.version); save(); saveExamSession(null); toast('已重置'); me();
    }
  };
}

// ---------- router ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  try {
    switch (h[0]) {
      case '': return home();
      case 'chapters': return chapterList();
      case 'practice': {
        const n = +h[1];
        if (n === 0) return practice('全部题目', bank.questions.map((q) => q.id), '__all__', '#/chapters');
        const c = chapters[n - 1];
        if (!c) { location.hash = '#/chapters'; return; }
        return practice(c.name, c.ids, c.name, '#/chapters');
      }
      case 'exam': { const s = loadExamSession(); return s && h[1] === 'go' ? examRun(s) : examIntro(); }
      case 'result': return result(+h[1] || 0);
      case 'review': return review(+h[1] || 0, +h[2] || 0);
      case 'wrong': if (h[1] === 'do') return wrongDo(+h[2] || 0); wrongSnapshot = []; return wrongList();
      case 'me': return me();
      default: location.hash = '#/';
    }
  } catch (e) {
    console.error(e);
    render(`${header('出错了')}<main><div class="empty"><div class="big">⚠️</div>页面出错：${esc((e as Error).message)}</div></main>`);
  }
}

async function boot() {
  try {
    const res = await fetch('./data/bank.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bank = await res.json();
    if (!bank || !Array.isArray(bank.questions) || !bank.questions.length) throw new Error('题库格式不正确');
  } catch (e) {
    app.innerHTML = `<div class="empty"><div class="big">⚠️</div>题库加载失败（${esc((e as Error).message)}）<br>请检查网络后重试。<br><br><button class="btn primary" onclick="location.reload()" style="max-width:200px">重新加载</button></div>`;
    return;
  }
  byId = new Map(bank.questions.map((q) => [q.id, q]));
  const map = new Map<string, string[]>();
  for (const q of bank.questions) { if (!map.has(q.chapter)) map.set(q.chapter, []); map.get(q.chapter)!.push(q.id); }
  chapters = [...map].map(([name, ids]) => ({ name, ids }));
  try { P = loadProgress() ?? emptyProgress(bank.version); } catch { P = emptyProgress(bank.version); toast('本地进度读取失败，已重新开始'); }
  P.bankVersion = bank.version;
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { document.querySelector('.offline')?.remove(); });
  window.addEventListener('offline', () => { if (!document.querySelector('.offline')) app.insertAdjacentHTML('afterbegin', '<div class="offline">离线模式 · 题库已缓存，可正常刷题</div>'); });
  route();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 注册失败', e)));
}
boot();
