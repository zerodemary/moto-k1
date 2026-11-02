// 端到端自测 + 截图：npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium, devices } from 'playwright';
const URL = process.env.URL || 'http://localhost:4173/';
const OUT = 'docs/screenshots';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'zh-CN' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const ok = (c, m) => { if (!c) throw new Error('断言失败：' + m); console.log('✓', m); };

await p.goto(URL); await p.waitForSelector('.hero');
await shot('01-home');
await p.click('text=顺序练习'); await p.waitForSelector('.row'); await shot('02-chapters');
await p.click('.row >> nth=1'); await p.waitForSelector('.opt');
// 故意答错第一题
const bank = await p.evaluate(() => fetch('./data/bank.json').then((r) => r.json()));
const firstChapter = bank.questions[0];
await p.click(`.opt[data-opt="${(firstChapter.answer + 1) % firstChapter.options.length}"]`);
await p.waitForSelector('.explain'); await shot('03-practice-wrong');
ok(await p.locator('.opt.wrong').count() === 1, '练习答错显示错误标记和解析');
await p.click('#next'); await p.waitForSelector('.opt');
// 刷新后进度保留（第 2 题）
await p.reload(); await p.waitForSelector('.opt');
ok((await p.textContent('#jump')).startsWith('2/'), '刷新后章节进度保留');
// 图片题
const chs = [...new Set(bank.questions.map((q) => q.chapter))];
const imgCh = chs.findIndex((c) => bank.questions.some((q) => q.chapter === c && q.image));
const imgQ = bank.questions.filter((q) => q.chapter === chs[imgCh]).findIndex((q) => q.image);
await p.goto(URL + '#/practice/' + (imgCh + 1)); await p.waitForSelector('.opt');
await p.click('#jump'); await p.click(`.sheet [data-i="${imgQ}"]`); await p.waitForSelector('.q-img');
ok(await p.$eval('.q-img', (i) => i.complete && i.naturalWidth > 0), '图片题图片正常加载');
await shot('04-practice-image');

// 模拟考试
await p.goto(URL + '#/exam'); await p.click('#start'); await p.waitForSelector('#timer');
const ids = await p.evaluate(() => JSON.parse(localStorage.getItem('moto-k1:exam-session')).ids);
ok(ids.length === 50, '模考 50 题');
const qs = ids.map((id) => bank.questions.find((q) => q.id === id));
ok(qs.slice(0, 20).every((q) => q.type === 'single') && qs.slice(20).every((q) => q.type === 'judge'), '20 单选 + 30 判断');
await p.click(`.opt[data-opt="${qs[0].answer}"]`); await p.waitForTimeout(450);
await shot('05-exam');
// 用答题卡交卷前，写入答案：前 45 题答对、后 5 题答错 => 90 分
await p.evaluate((qs) => { const s = JSON.parse(localStorage.getItem('moto-k1:exam-session')); s.answers = qs.map((q, k) => (k < 45 ? q.answer : (q.answer + 1) % q.options.length)); s.cur = 49; localStorage.setItem('moto-k1:exam-session', JSON.stringify(s)); }, qs);
await p.goto(URL + '#/'); await p.goto(URL + '#/exam/go'); await p.waitForSelector('#timer');
await p.click('#sheet'); await shot('06-exam-sheet'); await p.click('#sheet-submit');
await p.click('[data-a=ok]'); await p.waitForSelector('.score');
ok((await p.textContent('.score .num')).trim() === '90', '错 5 题得 90 分合格');
await shot('07-result');
await p.click('.list .row >> nth=0'); await p.waitForSelector('.explain'); await shot('08-review');

// 错题本
await p.goto(URL + '#/wrong'); await p.waitForSelector('#go');
const wrongN = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('moto-k1:progress')).wrongBook).length);
ok(wrongN === 6, `错题本收录 6 题（练习 1 + 模考 5），实际 ${wrongN}`);
await shot('09-wrongbook');
await p.click('#go'); await p.waitForSelector('.opt');
// 当前题连对 2 次 -> 移出
const curId = await p.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('moto-k1:progress')).wrongBook).sort((a, b) => b[1].addedAt - a[1].addedAt)[0][0]);
const cq = bank.questions.find((q) => q.id === curId);
await p.click(`.opt[data-opt="${cq.answer}"]`); await p.waitForTimeout(800);
await shot('10-wrong-review');
await p.goto(URL + '#/wrong'); await p.goto(URL + '#/wrong/do/0'); await p.waitForSelector('.opt');
await p.click(`.opt[data-opt="${cq.answer}"]`); await p.waitForTimeout(300);
ok(!(await p.evaluate((id) => id in JSON.parse(localStorage.getItem('moto-k1:progress')).wrongBook, curId)), '错题连对 2 次移出');

await p.goto(URL + '#/me'); await p.waitForSelector('#exp'); await shot('11-me');
// 导出
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exp')]);
const path = await dl.path(); ok(!!path, '导出进度文件');
// 导入非法文件
await p.setInputFiles('#imp', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
await p.waitForSelector('.toast'); ok((await p.textContent('.toast')).includes('导入失败'), '非法导入有错误提示');
await p.setInputFiles('#imp', path); await p.click('[data-a=ok]'); await p.waitForTimeout(200);
ok((await p.textContent('.toast')).includes('导入成功'), '导出文件可重新导入');

// 空错题本
await p.goto(URL + '#/wrong'); await p.click('#clear'); await p.click('[data-a=ok]'); await p.waitForSelector('.empty'); await shot('12-wrong-empty');

// 离线
await p.goto(URL); await p.waitForSelector('.hero');
await p.evaluate(async () => { await navigator.serviceWorker.ready; });
await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(async () => { await p.reload(); });
await p.waitForFunction(async () => { const ks = await caches.keys(); if (!ks.length) return false; const c = await caches.open(ks[0]); return (await c.keys()).length > 90; }, null, { timeout: 30000 });
await ctx.setOffline(true);
await p.reload(); await p.waitForSelector('.hero', { timeout: 10000 });
ok(await p.isVisible('.offline'), '断网刷新后首页可用');
await p.goto(URL + '#/practice/' + (imgCh + 1)); await p.waitForSelector('.opt');
await p.click('#jump'); await p.click(`.sheet [data-i="${imgQ}"]`); await p.waitForSelector('.q-img');
ok(await p.$eval('.q-img', (i) => i.complete && i.naturalWidth > 0), '断网后图片题可显示');
await shot('13-offline');
await ctx.setOffline(false);
ok(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length === 0, '无页面 JS 错误 ' + errors.join(' | '));
await b.close();
console.log('ALL PASSED');
