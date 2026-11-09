/* 閱讀愈讀樂讀 2.0 — 寫心得 App（04.閱讀愈讀樂讀，規劃 規劃/寫心得App規劃_20261109_v1.md）
   一篇心得的狀態：piece 碎片 → draft 寫作中（或 xh 小輝草稿）→ final 定稿（雲端給 Day 號）→ 小輝說口令時匯入 04。
   快記和完整一篇是同一種資料，只差欄位填了多少。 */
const APP_VERSION = 'v0.1.0';
const NEED_GS = 'v1';
const SERIES = '2.0';
const SEP = '-'.repeat(74);
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA');
const ymd = d => String(d || '').replace(/-/g, '');
const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toLowerCase();
const taipeiDate = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600); }
function bar(msg) { const b = $('#bar'); b.hidden = !msg; b.textContent = msg || ''; }

/* ---------------- 資料 ---------------- */
async function allNotes() { return (await dbAll('notes')).filter(n => !n.deleted); }
async function putNote(n, dirty = true) {
  n.updatedAt = new Date().toISOString();
  if (dirty) { n.dirty = true; n.rev = (n.rev || 0) + 1; }
  await dbPut('notes', n);
  if (dirty) syncSoon();
}
function newNote(kind, book) {
  return { id: uid(), kind, status: kind === 'quick' ? 'piece' : 'draft', book: book || { t: '', a: '', p: '' },
    excerpt: '', thought: '', reflection: '', ask: '', quote: '', highlight: '', readDate: today(),
    createdAt: new Date().toISOString(), photos: [], from: [] };
}
const STATUS = { piece: '碎片', draft: '寫作中', xh: '小輝草稿', final: '定稿' };
const usedPieces = notes => new Set(notes.filter(n => n.status !== 'piece').flatMap(n => n.from || []));

/* ---------------- 書單與小輝給的資料 ---------------- */
let books = [], oldNotes = [], quoteLib = [], imported = {};
async function loadLocalMeta() {
  books = (await kvGet('books'))?.books || [];
  oldNotes = (await kvGet('old'))?.notes || [];
  quoteLib = (await kvGet('quotes'))?.quotes || [];
  imported = (await kvGet('imported'))?.ids || {};
}
async function refreshMeta(force) {
  const last = (await kvGet('metaAt')) || 0;
  if (!force && Date.now() - last < 6 * 3600e3) return;
  for (const w of ['books', 'old', 'quotes', 'imported']) {
    const r = await api('meta', { what: w });
    if (r.data) await kvSet(w, r.data);
  }
  await kvSet('metaAt', Date.now());
  await loadLocalMeta();
}
/** 選書：先找最近寫過的書，再找 03 書單；書名或作者有打到的字就算 */
async function searchBooks(q) {
  const notes = await allNotes();
  const recent = [];
  notes.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).forEach(n => {
    if (n.book?.t && !recent.some(x => x.t === n.book.t)) recent.push({ ...n.book, recent: true });
  });
  q = q.trim().toLowerCase();
  if (!q) return recent.slice(0, 8);
  const hit = b => (b.t + ' ' + (b.a || '')).toLowerCase().includes(q);
  const out = recent.filter(hit);
  for (const b of books) { if (out.length >= 30) break; if (hit(b) && !out.some(x => x.t === b.t)) out.push(b); }
  return out;
}
const bookLine = b => b?.t ? `《${esc(b.t)}》${b.a ? ' ' + esc(b.a) : ''}${b.p ? '／' + esc(b.p) : ''}` : '（還沒選書）';

function bookPicker(root, note, onChange) {
  root.innerHTML = `
    <div class="picker"><input id="bq" placeholder="打書名或作者的關鍵字選書" autocomplete="off" value="${esc(note.book.t)}"><div class="menu" hidden></div></div>
    <div class="ap"><input id="ba" placeholder="作者" value="${esc(note.book.a)}"><input id="bp" placeholder="出版社" value="${esc(note.book.p)}"></div>`;
  const q = root.querySelector('#bq'), menu = root.querySelector('.menu'), a = root.querySelector('#ba'), p = root.querySelector('#bp');
  let list = [], idx = -1;
  const pick = b => {
    note.book = { t: b.t, a: b.a || note.book.a || '', p: b.p || '' };
    q.value = b.t; a.value = note.book.a; p.value = note.book.p; menu.hidden = true;
    onChange(); if (!note.book.a) a.focus();
  };
  const show = async () => {
    list = await searchBooks(q.value); idx = -1;
    const typed = q.value.trim();
    menu.innerHTML = list.map((b, i) => `<div data-i="${i}">${b.recent ? '🕘 ' : ''}${esc(b.t)}<small>${esc(b.a || '')}</small></div>`).join('')
      + (typed && !list.some(b => b.t === typed) ? `<div data-new="1">➕ 新增這本書：「${esc(typed)}」<small>書單沒有的書</small></div>` : '')
      + (!books.length ? `<div data-x="1"><small>還沒讀到 03 書單：到設定連上雲端</small></div>` : '');
    menu.hidden = !menu.innerHTML;
  };
  q.addEventListener('input', show);
  q.addEventListener('focus', show);
  q.addEventListener('keydown', e => {
    const rows = [...menu.querySelectorAll('div[data-i],div[data-new]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, Math.min(rows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1))); rows.forEach((r, i) => r.classList.toggle('on', i === idx)); }
    if (e.key === 'Enter' && rows[idx]) { e.preventDefault(); rows[idx].dispatchEvent(new MouseEvent('mousedown')); }
    if (e.key === 'Escape') menu.hidden = true;
  });
  q.addEventListener('blur', () => setTimeout(() => { menu.hidden = true; }, 150));
  menu.addEventListener('mousedown', e => {
    const d = e.target.closest('div'); if (!d) return;
    e.preventDefault();
    if (d.dataset.i) pick(list[Number(d.dataset.i)]);
    else if (d.dataset.new) pick({ t: q.value.trim(), a: '', p: '' });
  });
  [a, p].forEach(el => el.addEventListener('input', () => { note.book.a = a.value.trim(); note.book.p = p.value.trim(); onChange(); }));
}

/* ---------------- 照片：縮到 1600 像素的 JPEG，先存手機，連上網再傳 ---------------- */
function loadImg(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { res(i); URL.revokeObjectURL(u); }; i.onerror = () => rej(new Error('讀不到這張照片')); i.src = u; });
}
function shrink(img, max, type = 'image/jpeg', q = 0.82) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, blob: () => new Promise(r => c.toBlob(r, type, q)) };
}
async function addPhotos(files, note) {
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    const img = await loadImg(f);
    const big = await shrink(img, 1600).blob();
    const thumb = shrink(img, 320).canvas.toDataURL('image/jpeg', 0.7);
    const n = (note.photos.reduce((m, p) => Math.max(m, Number(p.name.split('_')[1]?.split('.')[0]) || 0), 0)) + 1;
    const name = `${note.id}_${n}.jpg`;
    await dbPut('photos', { name, blob: big });
    note.photos.push({ name, thumb, pending: true });
  }
}
function photoHtml(note, canRemove) {
  return `<div class="photos">${note.photos.map((p, i) => `<figure><img src="${p.thumb}" alt="書頁照片">${p.pending ? '<span class="up">⏳ 待上傳</span>' : ''}${canRemove ? `<button class="x" data-rm="${i}" title="拿掉">✕</button>` : ''}</figure>`).join('')}</div>`;
}

/* ---------------- ✍️ 快記 ---------------- */
async function renderWrite() {
  view.className = '';
  const notes = await allNotes();
  const xh = notes.filter(n => n.status === 'xh').length;
  const cur = (await kvGet('curBook')) || { t: '', a: '', p: '' };
  const note = newNote('quick', { ...cur });
  view.innerHTML = `
    <h1>閱讀/愈讀/樂讀 2.0</h1>
    ${xh ? `<div class="banner">🧡 小輝幫你組了 <b>${xh}</b> 篇草稿，<a href="#list">去看看</a></div>` : ''}
    <label>讀哪一本 <span class="hint">預設是上次那本</span></label><div id="picker"></div>
    <label>書中的一段話 <span class="hint">打字，或拍書頁</span></label>
    <textarea id="excerpt" placeholder="抄下打動你的那段文字"></textarea>
    <div class="row"><button class="ghost small" id="cam">📷 拍書頁／選照片</button><input type="file" id="file" accept="image/*" multiple hidden></div>
    <div id="ph"></div>
    <label>我的想法 <span class="hint">一句也可以</span></label>
    <textarea id="thought" placeholder="當下想到什麼"></textarea>
    <div class="row" style="margin-top:14px"><button id="save" class="grow">存成碎片</button><button class="ghost" id="full">寫完整一篇 →</button></div>
    <p class="hint">碎片累積幾張後，在筆電跟小輝說「整理讀書碎片」，小輝會組成草稿放回這裡。</p>`;
  bookPicker($('#picker'), note, () => {});
  const ph = () => { $('#ph').innerHTML = photoHtml(note, true); };
  $('#cam').onclick = () => $('#file').click();
  $('#file').onchange = async e => { try { await addPhotos([...e.target.files], note); ph(); } catch (err) { toast(err.message); } e.target.value = ''; };
  $('#ph').onclick = e => { const i = e.target.dataset.rm; if (i != null) { dbDel('photos', note.photos[i].name); note.photos.splice(i, 1); ph(); } };
  const grab = () => { note.excerpt = $('#excerpt').value.trim(); note.thought = $('#thought').value.trim(); };
  $('#save').onclick = async () => {
    grab();
    if (!note.book.t) return toast('先選一本書');
    if (!note.excerpt && !note.thought && !note.photos.length) return toast('寫一句或拍一張再存');
    await putNote(note); await kvSet('curBook', note.book);
    toast('存好了 ✅'); renderWrite();
  };
  $('#full').onclick = async () => {
    grab();
    const n = { ...note, kind: 'full', status: 'draft', reflection: note.thought, thought: '' };
    if (n.book.t) await kvSet('curBook', n.book);
    await putNote(n); location.hash = '#n/' + n.id;
  };
}

/* ---------------- 📚 心得列表 ---------------- */
async function renderList() {
  view.className = '';
  const notes = await allNotes(), used = usedPieces(notes);
  const q = (await kvGet('listQ')) || '';
  const match = n => !q || JSON.stringify([n.book, n.excerpt, n.thought, n.reflection]).includes(q);
  const card = n => `<a href="#n/${n.id}" style="text-decoration:none;color:inherit"><div class="card ${n.status === 'xh' ? 'xh' : ''}">
      <div class="row"><span class="tag ${n.status === 'final' ? 'final' : n.status === 'xh' ? 'xh' : ''}">${n.status === 'final' ? `Day ${n.day}` : STATUS[n.status]}</span>${imported[n.id] ? '<span class="tag">已匯入 04</span>' : ''}${n.dirty ? '<span class="tag">⏳ 待同步</span>' : ''}<span class="bookline grow">${bookLine(n.book)}</span></div>
      ${n.excerpt ? `<div class="excerpt clip">${esc(n.excerpt)}</div>` : ''}
      ${(n.thought || n.reflection) ? `<div class="thought excerpt clip">${esc(n.thought || n.reflection)}</div>` : ''}
      ${n.photos?.length ? photoHtml(n, false) : ''}</div></a>`;
  const filled = n => n.book?.t || n.excerpt || n.thought || n.reflection || n.photos?.length;   // 按了「完整一篇」沒寫就離開的空白篇不列出
  const by = s => notes.filter(n => n.status === s && match(n) && filled(n));
  const xh = by('xh'), drafts = by('draft'), pieces = by('piece').filter(n => !used.has(n.id)), finals = by('final').sort((a, b) => b.day - a.day);
  const sortU = a => a.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
  view.innerHTML = `
    <h1>我的心得</h1>
    <div class="row"><input id="q" class="grow" placeholder="搜尋書名、內容" value="${esc(q)}"><a href="#new"><button>＋ 完整一篇</button></a></div>
    ${xh.length ? `<h2>🧡 小輝草稿（${xh.length}）</h2>${sortU(xh).map(card).join('')}` : ''}
    ${drafts.length ? `<h2>✍️ 寫作中（${drafts.length}）</h2>${sortU(drafts).map(card).join('')}` : ''}
    <h2>🧩 碎片（${pieces.length}）</h2>${pieces.length ? sortU(pieces).map(card).join('') : '<p class="hint">還沒有碎片，到「快記」記一段。</p>'}
    ${finals.length ? `<h2>✅ 定稿（${finals.length}）</h2>${finals.map(card).join('')}` : ''}`;
  $('#q').onchange = async e => { await kvSet('listQ', e.target.value.trim()); renderList(); };
}

/* ---------------- 寫一篇（筆電左右兩欄、手機分頁） ---------------- */
let saveTimer;
async function renderNote(id) {
  let note = id === 'new' ? newNote('full', (await kvGet('curBook')) || undefined) : await dbGet('notes', id);
  if (!note || note.deleted) { view.innerHTML = '<p>找不到這篇，可能在另一台刪掉了。</p><a href="#list">回列表</a>'; return; }
  if (id === 'new') { await putNote(note, false); history.replaceState(null, '', '#n/' + note.id); }
  view.className = 'wide';
  const isPiece = note.status === 'piece';
  view.innerHTML = `
    <div class="row"><a href="#list">← 心得</a><span class="grow"></span><span class="tag ${note.status === 'final' ? 'final' : note.status === 'xh' ? 'xh' : ''}">${note.status === 'final' ? `${SERIES} Day ${note.day}` : STATUS[note.status]}</span></div>
    <div class="tabs"><button data-t="e" class="on">✍️ 寫</button><button data-t="s">📖 這本書的碎片與舊心得</button></div>
    <div class="split" id="split">
      <aside class="side" id="side"></aside>
      <section class="editor">
        ${note.status === 'xh' ? '<div class="banner">🧡 這是小輝依你的碎片組的草稿，反思請改成你自己的話，改完按「定稿」。</div>' : ''}
        ${isPiece ? '<div class="banner">這是一張碎片。<button class="small" id="up">升級成完整一篇</button></div>' : ''}
        <label>書</label><div id="picker"></div>
        <label>閱讀日期 <span class="hint">補寫以前的日子就改這裡，標題會加「補」</span></label><input type="date" id="readDate" max="${today()}" value="${esc(note.readDate || today())}">
        <label>書中摘錄</label><textarea id="excerpt" class="tall">${esc(note.excerpt)}</textarea>
        <div class="row"><button class="ghost small" id="cam">📷 拍書頁／選照片</button><input type="file" id="file" accept="image/*" multiple hidden></div>
        <div id="ph"></div>
        ${isPiece ? `<label>我的想法</label><textarea id="thought">${esc(note.thought)}</textarea>` : `
        <label>我的反思</label><textarea id="reflection" class="tall">${esc(note.reflection || note.thought)}</textarea>
        <label>你呢，就你而言…？ <span class="hint">留給讀者的提問</span></label><textarea id="ask" placeholder="你呢，就你而言，＿＿是什麼呢？">${esc(note.ask)}</textarea>
        <label>聖嚴法師自在語 <span class="hint">可以留空</span></label><textarea id="quote">${esc(note.quote)}</textarea>
        <div class="row"><button class="ghost small" id="pickQ">🙏 小輝從以前用過的挑 3 句</button></div><div class="quotes" id="qs"></div>
        <label>圖卡上的一句精華 <span class="hint">沒填就用摘錄第一句</span></label><input id="highlight" value="${esc(note.highlight)}">`}
        <div id="finalBox"></div>
        <div class="status row"><span class="saved grow" id="saved">${note.dirty ? '⏳ 待同步' : '已存'}</span>
          <button class="ghost small" id="del">刪除</button>
          ${isPiece ? '' : `<button id="fin">${note.status === 'final' ? '更新定稿' : '定稿'}</button>`}</div>
      </section>
    </div>`;
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#split').classList.toggle('show-side', b.dataset.t === 's');
  });
  const fields = ['excerpt', 'thought', 'reflection', 'ask', 'quote', 'highlight', 'readDate'];
  const grab = () => { fields.forEach(f => { const el = $('#' + f); if (el) note[f] = f === 'readDate' ? el.value : el.value.replace(/\s+$/, ''); }); };
  const later = () => {
    $('#saved').textContent = '輸入中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { grab(); if (note.status === 'xh') note.status = 'draft'; await putNote(note);$('#saved').textContent = '已存在這台 ⏳ 待同步'; paintFinal(); }, 700);
  };
  bookPicker($('#picker'), note, () => { later(); paintSide(); });
  fields.forEach(f => { const el = $('#' + f); if (el) el.addEventListener('input', later); });
  const ph = () => { $('#ph').innerHTML = photoHtml(note, true); };
  ph();
  $('#cam').onclick = () => $('#file').click();
  $('#file').onchange = async e => { try { grab(); await addPhotos([...e.target.files], note); await putNote(note); ph(); } catch (err) { toast(err.message); } e.target.value = ''; };
  $('#ph').onclick = async e => { const i = e.target.dataset.rm; if (i != null && confirm('拿掉這張照片？')) { await dbDel('photos', note.photos[i].name); note.photos.splice(i, 1); grab(); await putNote(note); ph(); } };
  if ($('#up')) $('#up').onclick = async () => { grab(); note.kind = 'full'; note.status = 'draft'; note.reflection = note.thought; note.thought = ''; await putNote(note); renderNote(note.id); };
  $('#del').onclick = async () => {
    if (!confirm(note.status === 'final' ? `刪掉 Day ${note.day}？號碼不會再用。` : '刪掉這篇？')) return;
    note.deleted = true; await putNote(note); toast('已刪除（雲端移到「已刪除」資料夾）'); location.hash = '#list';
  };
  if ($('#pickQ')) $('#pickQ').onclick = () => {
    if (!quoteLib.length) return toast('還沒讀到自在語庫：到設定連上雲端；也可以自己填');
    const used = new Set(); const pick = [];
    while (pick.length < Math.min(3, quoteLib.length)) { const i = Math.floor(Math.random() * quoteLib.length); if (!used.has(i)) { used.add(i); pick.push(quoteLib[i]); } }
    $('#qs').innerHTML = pick.map((q, i) => `<div data-q="${i}">${esc(q.q)}<br><span class="hint">2023 Day ${q.day} 用過</span></div>`).join('') + '<p class="hint">點一句放進去；再按一次換一組。小輝只從你以前用過的挑，不自己生。</p>';
    $('#qs').onclick = e => { const d = e.target.closest('[data-q]'); if (d) { $('#quote').value = pick[d.dataset.q].q; $('#qs').innerHTML = ''; later(); } };
  };
  if ($('#fin')) $('#fin').onclick = () => { grab(); doFinalize(note); };

  async function paintSide() {
    const notes = await allNotes(), t = note.book.t, used = usedPieces(notes);
    if (!t) { $('#side').innerHTML = '<p class="hint">選了書以後，這裡會出現這本書的碎片和以前寫的心得。</p>'; return; }
    const mine = notes.filter(n => n.id !== note.id && n.book?.t === t).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const pieces = mine.filter(n => n.status === 'piece'), others = mine.filter(n => n.status !== 'piece');
    const olds = oldNotes.filter(n => n.t === t);
    const usedHere = new Set(note.from || []);
    $('#side').innerHTML = `
      <h2>🧩 這本書的碎片（${pieces.length}）</h2>
      ${pieces.map(n => `<div class="card">${n.excerpt ? `<div class="excerpt">${esc(n.excerpt)}</div>` : ''}${n.thought ? `<div class="thought">💭 ${esc(n.thought)}</div>` : ''}${n.photos?.length ? photoHtml(n, false) : ''}
        <div class="row" style="margin-top:6px">${isPiece ? '' : `<button class="small ghost" data-use="${n.id}">${usedHere.has(n.id) ? '✓ 已放進來，再放一次' : '↘ 放進這篇'}</button>`}${used.has(n.id) && !usedHere.has(n.id) ? '<span class="hint">已用在別篇</span>' : ''}</div></div>`).join('') || '<p class="hint">這本書還沒有其他碎片。</p>'}
      ${others.length ? `<h2>✍️ 這本書的其他篇（${others.length}）</h2>${others.map(n => `<a href="#n/${n.id}" style="text-decoration:none;color:inherit"><div class="card"><span class="tag">${n.status === 'final' ? 'Day ' + n.day : STATUS[n.status]}</span><div class="excerpt clip">${esc(n.reflection || n.excerpt)}</div></div></a>`).join('')}` : ''}
      ${olds.length ? `<h2>📜 2023 年寫過的（${olds.length}）</h2>${olds.map(n => `<div class="card"><span class="tag">Day ${n.day}・${n.date}</span><div class="excerpt clip">${esc(n.excerpt)}</div><div class="thought excerpt clip">${esc(n.reflection)}</div></div>`).join('')}` : ''}`;
    $('#side').onclick = async e => {
      const b = e.target.closest('[data-use]'); if (!b) return;
      const p = notes.find(n => n.id === b.dataset.use); if (!p) return;
      const ex = $('#excerpt'), rf = $('#reflection');
      if (p.excerpt) ex.value = (ex.value ? ex.value + '\n' : '') + p.excerpt;
      if (p.thought && rf) rf.value = (rf.value ? rf.value + '\n' : '') + p.thought;
      for (const pp of p.photos || []) if (!note.photos.some(x => x.name === pp.name)) note.photos.push({ ...pp, from: p.id });
      note.from = [...new Set([...(note.from || []), p.id])];
      grab(); await putNote(note); ph(); paintSide(); toast('放進來了，記得改成一篇完整的話');
    };
  }
  function paintFinal() {
    const box = $('#finalBox'); if (!box) return;
    if (note.status !== 'final') { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="final-box"><b>✅ ${SERIES} Day ${note.day}</b> <span class="hint">定稿於 ${taipeiDate(note.finalAt)}${imported[note.id] ? '・已匯入 04' : '・下次「整理讀書碎片」會匯入 04'}</span>
      <div class="row" style="margin-top:8px"><button class="small" id="copy">📋 複製粉絲團貼文</button><button class="small" id="cardBtn">🖼️ 產生圖卡</button></div>
      <div class="post" id="post">${esc(postText(note))}</div><div id="cardBox"></div></div>`;
    $('#copy').onclick = () => copyText(postText(note));
    $('#cardBtn').onclick = () => makeCard(note);
  }
  paintSide(); paintFinal();
}

/* ---------------- 定稿、貼文、圖卡 ---------------- */
async function doFinalize(note) {
  if (!note.book.t) return toast('先選書');
  if (!note.excerpt && !note.photos.length) return toast('書中摘錄還是空的');
  if (!note.reflection) return toast('我的反思還是空的');
  const cfg = await kvGet('cfg');
  if (!cfg?.url) return toast('定稿要連上雲端才能編號：先到設定填網址和密語');
  if (!navigator.onLine) return toast('定稿要有網路才能編號，內容已經存在這台');
  const btn = $('#fin'); btn.disabled = true; btn.textContent = '編號中…';
  try {
    await putNote(note);
    await uploadPhotos(note);
    const cur = await dbGet('notes', note.id);
    const r = await api('finalize', { note: serverCopy(cur) });
    Object.assign(cur, { day: r.day, finalAt: r.finalAt, series: SERIES, status: 'final' });
    await dbPut('notes', { ...cur, dirty: false });
    toast(`定稿：Day ${r.day} ✅`);
    renderNote(note.id);
  } catch (e) { toast('⚠️ ' + e.message); btn.disabled = false; btn.textContent = '定稿'; }
}
function postTitle(n) {
  const fin = taipeiDate(n.finalAt || new Date().toISOString());
  return `閱讀/愈讀/樂讀 ${SERIES} Day ${n.day}(${ymd(fin)})` + (n.readDate && n.readDate < fin ? `(補${ymd(n.readDate)})` : '');
}
function postText(n) {
  const src = [n.book.t, n.book.a, n.book.p].filter(Boolean).join('/');
  const parts = [postTitle(n), n.excerpt, `~~摘自「${src}」`, SEP, n.reflection, n.ask].filter(Boolean);
  if (n.quote) parts.push(SEP, '聖嚴法師自在語：', n.quote);
  return parts.join('\n');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (_) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast('已複製，可以貼到粉絲團 ✅');
}
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    out.push(line);
  }
  return out;
}
function drawCard(n) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), serif = '"Noto Serif TC","Source Han Serif TC","PMingLiU",serif', sans = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
  x.fillStyle = '#f7f1e6'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#8a5a2b'; x.fillRect(0, 0, W, 14);
  x.strokeStyle = '#e4d8c4'; x.lineWidth = 3; x.strokeRect(50, 60, W - 100, H - 120);
  x.fillStyle = '#8a5a2b'; x.font = `700 40px ${sans}`; x.fillText(`閱讀/愈讀/樂讀 ${SERIES}`, 100, 150);
  x.fillStyle = '#7a6a5a'; x.font = `400 32px ${sans}`; x.fillText(`Day ${n.day}・${taipeiDate(n.finalAt)}`, 100, 200);
  const hl = (n.highlight || (n.excerpt || '').split('\n').find(s => s.trim()) || '').trim();
  let size = 60, lines;
  do { x.font = `700 ${size}px ${serif}`; lines = wrap(x, '「' + hl + '」', W - 220); size -= 4; } while (lines.length > 8 && size > 40);
  if (lines.length > 8) { lines = lines.slice(0, 8); lines[7] = lines[7].slice(0, -2) + '…」'; }
  const hlFont = x.font, lh = size * 1.55;   // do 迴圈最後多減了 4，lh 用的是下一輪的字級，行距略緊、不影響
  x.font = `400 38px ${serif}`;
  const askLines = n.ask ? wrap(x, n.ask, W - 220).slice(0, 4) : [];
  const blockH = lines.length * lh + 100 + askLines.length * 60;   // 精華句＋分隔線＋提問，放在上下中間
  let y = Math.max(300, 260 + (H - 260 - 280 - blockH) / 2 + size);
  x.font = hlFont; x.fillStyle = '#3b2f25';
  for (const l of lines) { x.fillText(l, 110, y); y += lh; }
  y += 10; x.fillStyle = '#c0843f'; x.fillRect(110, y, 120, 5); y += 80;
  x.font = `400 38px ${serif}`; x.fillStyle = '#5a4a3a';
  for (const l of askLines) { x.fillText(l, 110, y); y += 60; }
  x.font = `700 36px ${serif}`; x.fillStyle = '#3b2f25';
  x.fillText(`《${n.book.t}》`.slice(0, 26), 110, H - 190);
  x.font = `400 30px ${sans}`; x.fillStyle = '#7a6a5a';
  x.fillText([n.book.a, n.book.p].filter(Boolean).join('／').slice(0, 30), 110, H - 140);
  return c;
}
function makeCard(n) {
  const c = drawCard(n);
  c.className = 'preview';
  const box = $('#cardBox'); box.innerHTML = ''; box.appendChild(c);
  const b = document.createElement('div'); b.className = 'row'; b.style.marginTop = '8px';
  b.innerHTML = '<button class="small" id="dl">⬇️ 下載圖卡</button><span class="hint">要換精華句，改上面「圖卡上的一句精華」再按一次</span>';
  box.appendChild(b);
  $('#dl').onclick = () => c.toBlob(async blob => {
    const name = `愈讀樂讀${SERIES}_Day${n.day}.png`, file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/.test(navigator.userAgent)) { try { await navigator.share({ files: [file] }); return; } catch (_) {} }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

/* ---------------- ⚙️ 設定 ---------------- */
async function renderSettings() {
  view.className = '';
  const cfg = (await kvGet('cfg')) || {}, last = await kvGet('lastSync'), notes = await allNotes();
  const waiting = notes.filter(n => n.dirty).length;
  view.innerHTML = `
    <h1>設定</h1>
    <label>雲端同步網址 <span class="hint">Apps Script 部署後的網址</span></label><input id="url" value="${esc(cfg.url || '')}" placeholder="https://script.google.com/macros/s/…/exec">
    <label>密語 <span class="hint">跟 Apps Script 指令碼屬性 PASSPHRASE 一樣</span></label><input id="pass" type="password" value="${esc(cfg.pass || '')}">
    <div class="row" style="margin-top:12px"><button id="test">儲存並測試</button><button class="ghost" id="now">立刻同步</button><button class="ghost" id="restore">從雲端還原</button></div>
    <p id="res" class="hint"></p>
    <div class="card">
      <div>上次同步：${last ? new Date(last.at).toLocaleString('zh-TW') + (last.error ? '　⚠️ ' + esc(last.error) : '　✅') : '還沒同步過'}</div>
      <div>待同步：${waiting} 篇　｜　書單：${books.length} 本　｜　自在語：${quoteLib.length} 句　｜　2023 心得：${oldNotes.length} 篇</div>
      <div class="hint">App ${APP_VERSION}，需要雲端程式 ${NEED_GS}</div>
    </div>
    <p class="hint">心得存在你雲端硬碟的「04.閱讀愈讀樂讀/06.App資料」，這台只放副本。清除瀏覽器的網站資料會清掉這台的副本和設定，雲端不受影響：重新填網址和密語，按「從雲端還原」。</p>`;
  $('#test').onclick = async () => {
    await kvSet('cfg', { url: $('#url').value.trim(), pass: $('#pass').value });
    $('#res').textContent = '測試中…'; gsOk = false;
    try {
      const r = await api('ping');
      $('#res').textContent = r.version === NEED_GS ? `✅ ${r.message}，下一篇定稿是 Day ${r.nextDay}` : `⚠️ 雲端程式是 ${r.version || '舊版'}，要更新到 ${NEED_GS}`;
      await refreshMeta(true); sync();
    } catch (e) { $('#res').textContent = '⚠️ ' + e.message; }
  };
  $('#now').onclick = async () => { toast('同步中…'); await sync(); try { await refreshMeta(true); } catch (_) {} renderSettings(); };
  $('#restore').onclick = async () => { await kvDel('since'); toast('還原中…'); await sync(); try { await refreshMeta(true); } catch (_) {} renderSettings(); };
}

/* ---------------- 同步 ---------------- */
async function api(action, data = {}, timeoutMs = 90000) {
  const cfg = await kvGet('cfg');
  if (!cfg?.url) throw new Error('還沒填網址');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ pass: cfg.pass, action, ...data }), signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '雲端回了錯誤');
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('等太久沒有回應');
    if (e instanceof TypeError) throw new Error('連不上雲端');
    throw e;
  } finally { clearTimeout(t); }
}
const serverCopy = n => { const { dirty, rev, ...rest } = n; return { ...rest, photos: (n.photos || []).map(({ pending, ...p }) => p) }; };
const toBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function uploadPhotos(note) {
  const cur = await dbGet('notes', note.id) || note;
  for (const p of cur.photos.filter(p => p.pending)) {
    const rec = await dbGet('photos', p.name);
    if (!rec) continue;   // 照片在另一台，由那台上傳
    bar(`上傳照片 ${p.name}`);
    const r = await api('photo', { noteId: p.name.split('_')[0], name: p.name, data: await toBase64(rec.blob) });
    // 同一張照片可能在碎片和完整篇各一份：每篇都標成已上傳（不改 dirty，不改 rev）
    for (const n of await dbAll('notes')) {
      let hit = false;
      for (const x of n.photos || []) if (x.name === p.name && x.pending) { delete x.pending; x.fileId = r.fileId; hit = true; }
      if (hit) await dbPut('notes', n);
    }
    await dbDel('photos', p.name);
  }
  bar('');
}
let syncing = false, syncAgain = false, retryTimer, soonTimer, gsOk = false;
function syncSoon() { clearTimeout(soonTimer); soonTimer = setTimeout(sync, 3000); }
async function sync() {
  if (syncing) { syncAgain = true; return; }
  const cfg = await kvGet('cfg');
  if (!cfg?.url || !navigator.onLine) return;
  syncing = true;
  const errs = [];
  const attempt = async fn => { try { await fn(); } catch (e) { errs.push(e.message); } };
  await attempt(async () => { if (!gsOk) { const r = await api('ping'); if (r.version !== NEED_GS) throw new Error(`雲端程式是 ${r.version || '舊版'}，要更新到 ${NEED_GS}，心得先留在這台`); gsOk = true; } });
  if (gsOk) {
    for (const snap of (await dbAll('notes')).filter(n => n.dirty)) await attempt(async () => {
      if (snap.deleted) { await api('delete', { id: snap.id }); await dbDel('notes', snap.id); return; }
      // 從碎片放進來的照片，檔案已經在雲端（碎片那篇的名字），不用再傳
      await uploadPhotos(snap);
      const cur = await dbGet('notes', snap.id);
      const r = await api('save', { note: serverCopy(cur) });
      const now = await dbGet('notes', snap.id);
      if (now && now.rev === cur.rev) await dbPut('notes', { ...now, dirty: false, day: r.day || now.day });
    });
    await attempt(async () => {
      let since = (await kvGet('since')) || '', more = true;
      while (more) {
        const r = await api('pull', { since });
        for (const s of r.notes) {
          const local = await dbGet('notes', s.id);
          if (local?.dirty) continue;
          if (s.deleted) { await dbDel('notes', s.id); continue; }
          const thumbs = Object.fromEntries((local?.photos || []).map(p => [p.name, p.thumb]));
          await dbPut('notes', { ...s, photos: (s.photos || []).map(p => ({ ...p, thumb: p.thumb || thumbs[p.name] })), dirty: false, rev: local?.rev || 0 });
        }
        since = r.since; more = r.more;
        await kvSet('since', since);
      }
    });
    await attempt(() => refreshMeta(false));
  }
  const error = errs[0] || '';
  await kvSet('lastSync', { at: Date.now(), error });
  syncing = false;
  bar(error ? `⚠️ ${error}，等一下會再試` : '');
  if (error) { clearTimeout(retryTimer); retryTimer = setTimeout(sync, 60000); }
  const here = location.hash || '#write';
  if (!error && here === '#list') renderList();
  if (syncAgain) { syncAgain = false; sync(); }
}

/* ---------------- 頁面切換 ---------------- */
async function route() {
  clearTimeout(saveTimer);
  const h = location.hash || '#write';
  const tab = h.startsWith('#n/') || h === '#new' ? 'list' : h.slice(1);
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  if (h === '#new') await renderNote('new');
  else if (h.startsWith('#n/')) await renderNote(decodeURIComponent(h.slice(3)));
  else if (h === '#list') await renderList();
  else if (h === '#settings') await renderSettings();
  else await renderWrite();
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
(async () => {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage?.persist?.();
  await loadLocalMeta();
  await route();
  sync();
})();
