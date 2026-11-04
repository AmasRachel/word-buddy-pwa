(() => {
  "use strict";

  const STORAGE_KEY = "word-buddy-single-v1";
  const OCR_ENDPOINT = String(window.WORD_BUDDY_OCR_ENDPOINT || "").trim();
  const TODAY = () => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  };
  const icons = {
    learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></svg>',
    resources: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 6 4 14H4L8 6"/><path d="M12 2v8"/><path d="m9 5 3-3 3 3"/></svg>',
    manage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
  };

  const defaults = {
    version: 1,
    words: [
      { id: 1, unit: 1, english: "curious", chinese: "好奇的", phonetic: "/ˈkjʊəriəs/", example: "She is curious about the world." },
      { id: 2, unit: 1, english: "journey", chinese: "旅程；旅行", phonetic: "/ˈdʒɜːni/", example: "Every book begins a new journey." },
      { id: 3, unit: 1, english: "improve", chinese: "提高；改善", phonetic: "/ɪmˈpruːv/", example: "A little practice can improve your English." },
      { id: 4, unit: 1, english: "confident", chinese: "自信的", phonetic: "/ˈkɒnfɪdənt/", example: "Speak slowly and stay confident." },
      { id: 5, unit: 2, english: "protect", chinese: "保护", phonetic: "/prəˈtekt/", example: "We should protect the environment." },
      { id: 6, unit: 2, english: "discover", chinese: "发现", phonetic: "/dɪˈskʌvə/", example: "We discover something new every day." },
      { id: 7, unit: 2, english: "patient", chinese: "有耐心的", phonetic: "/ˈpeɪʃnt/", example: "Be patient with yourself." },
      { id: 8, unit: 2, english: "achieve", chinese: "实现；达到", phonetic: "/əˈtʃiːv/", example: "Small steps help us achieve big goals." }
    ],
    resources: [
      { id: 1, type: "essay", title: "示例作文：My Favorite Season", description: "适合参考结构和连接词", content: "My favorite season is autumn. The weather is cool and the sky is clear. I enjoy walking with my family and watching the leaves turn golden. Autumn teaches me that change can be beautiful.", url: "" },
      { id: 2, type: "note", title: "写作小抄：开头与结尾", description: "三个简单好用的表达", content: "开头：There is no doubt that…\n举例：For example / For instance\n结尾：In a word, …", url: "" }
    ],
    attempts: []
  };

  let data = loadData();
  let ui = { tab: "learn", unit: Math.min(...data.words.map((w) => w.unit), 1), index: 0, revealed: false, freshUnit: true, filter: "all", openResource: null };
  let installPrompt = null;
  let toastTimer = null;
  let activeAudio = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed && Array.isArray(parsed.words) ? parsed : clone(defaults);
    } catch { return clone(defaults); }
  }
  function saveData(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (message) toast(message);
  }
  function esc(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }
  function safeUrl(value = "") {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? esc(url.href) : ""; } catch { return ""; }
  }
  function uid(list) { return Math.max(0, ...list.map((item) => Number(item.id) || 0)) + 1; }
  function toast(message) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message; node.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
  }
  function todayAttempts() { return data.attempts.filter((a) => a.day === TODAY()); }
  function unitWords() { return data.words.filter((w) => w.unit === ui.unit).sort((a, b) => a.id - b.id); }
  function units() { return [...new Set(data.words.map((w) => w.unit))].sort((a, b) => a - b); }
  function navButton(tab, label) { return `<button class="nav-btn ${ui.tab === tab ? "active" : ""}" data-tab="${tab}" aria-label="${label}">${icons[tab]}<span>${label}</span></button>`; }
  function nav() { return navButton("learn", "今日背词") + navButton("progress", "学习进度") + navButton("resources", "资料库") + navButton("manage", "管理内容"); }

  function render() {
    const app = document.getElementById("app");
    const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(new Date());
    app.innerHTML = `<div class="shell">
      <aside class="sidebar">
        <button class="brand" data-tab="learn" aria-label="返回今日背词"><span class="brand-mark">W</span><div><strong>词搭子</strong><small>WORD BUDDY</small></div></button>
        <nav class="side-nav">${nav()}</nav>
        <div class="device-note"><strong>仅保存在这台平板</strong>无需登录，也不会同步到其他设备。</div>
        <button id="installButton" class="install-btn" ${installPrompt ? "" : "hidden"}>安装到桌面</button>
      </aside>
      <main class="main">
        <div class="topline"><span class="date">${date}</span><span id="networkStatus" class="offline-pill"><i></i><b>${navigator.onLine ? "可离线使用" : "当前离线"}</b></span></div>
        ${ui.tab === "learn" ? renderLearn() : ui.tab === "progress" ? renderProgress() : ui.tab === "resources" ? renderResources() : renderManage()}
      </main>
      <nav class="bottom-nav">${nav()}</nav>
    </div>`;
    bindForms();
  }

  function renderLearn() {
    const words = unitWords();
    const doneIds = new Set(todayAttempts().filter((a) => a.unit === ui.unit).map((a) => a.wordId));
    if (ui.freshUnit) {
      const firstOpen = words.findIndex((word) => !doneIds.has(word.id));
      ui.index = firstOpen === -1 && words.length ? words.length : Math.max(0, firstOpen);
      ui.freshUnit = false;
    }
    const count = doneIds.size;
    const progress = words.length ? Math.min(100, Math.round(count / words.length * 100)) : 0;
    if (ui.index > words.length) ui.index = words.length;
    const word = words[ui.index];
    return `<section class="hero"><div><p class="eyebrow">✦ 每天一个单元</p><h1>今天，让单词<br><em>真正留下来。</em></h1><p>先看英文，大声说出中文。准备好后再翻开答案。</p></div><div class="ring" style="--ring:${progress * 3.6}deg"><div><strong>${count}</strong><span> / ${words.length}</span><small>今日完成</small></div></div></section>
      <section class="learn-layout">
        <aside class="panel unit-panel"><span class="panel-label">我的英语词书</span><h2>选择学习单元</h2><p class="muted">学习记录保存在本机</p><div class="unit-list">${units().map((unit) => `<button class="unit-btn ${unit === ui.unit ? "active" : ""}" data-unit="${unit}"><span>UNIT ${String(unit).padStart(2, "0")}</span><small>${data.words.filter((w) => w.unit === unit).length} 词</small></button>`).join("") || '<p class="empty">请先添加单词</p>'}</div><div class="tip"><strong>TIP</strong><br>先说出中文，再点击查看答案，回忆效果会更好。</div></aside>
        <div class="study"><div class="study-meta"><span>UNIT ${String(ui.unit).padStart(2, "0")}</span><div class="track"><i style="width:${progress}%"></i></div><strong>${Math.min(ui.index + 1, words.length)} / ${words.length}</strong></div>${word ? renderWordCard(word) : renderComplete(words.length)}</div>
      </section>`;
  }

  function renderWordCard(word) {
    return `<article class="panel word-card"><span class="flag">${ui.revealed ? "答案" : "先回忆"}</span><button class="speak-btn" data-action="speak" data-word="${esc(word.english)}">🔊 点击听发音</button><h2>${esc(word.english)}</h2>${word.phonetic ? `<p class="phonetic">${esc(word.phonetic)}</p>` : ""}${ui.revealed ? `<div class="answer"><strong>${esc(word.chinese)}</strong>${word.example ? `<p>${esc(word.example)}</p>` : ""}</div>` : `<button class="reveal-btn" data-action="reveal">我已经说好了，查看中文 →</button>`}</article>${ui.revealed ? `<div class="rating"><button data-result="review">↻ 还不熟，再复习</button><button class="good" data-result="remembered">✓ 记住了</button></div>` : ""}`;
  }
  function renderComplete(wordCount) {
    if (!wordCount) return `<article class="panel complete"><div class="check">＋</div><h2>这个单元还没有单词</h2><p class="muted">去“管理内容”里粘贴词表吧。</p><button class="primary-btn" data-tab="manage">添加单词</button></article>`;
    return `<article class="panel complete"><div class="check">✓</div><p class="eyebrow">UNIT COMPLETE</p><h2>今天的单元完成啦！</h2><p class="muted">休息一下，薄弱词可以在进度页继续复习。</p><button class="primary-btn" data-action="restart">再练一遍</button></article>`;
  }

  function renderProgress() {
    const today = todayAttempts();
    const remembered = today.filter((a) => a.result === "remembered").length;
    const reviewMap = new Map();
    data.attempts.filter((a) => a.result === "review").forEach((a) => reviewMap.set(a.wordId, (reviewMap.get(a.wordId) || 0) + 1));
    const weak = [...reviewMap.entries()].sort((a,b) => b[1]-a[1]).map(([id,count]) => ({ word: data.words.find((w) => w.id === id), count })).filter((x) => x.word).slice(0,8);
    const days = new Set(data.attempts.map((a) => a.day)).size;
    return `<header><p class="eyebrow">LOCAL PROGRESS</p><h1 class="page-title">每一点进步，<br>都留在这台平板。</h1><p class="page-copy">学习记录不会上传。只有使用拍照识词时，照片会临时发送到腾讯云 OCR。需要换设备时，可以在管理页导出备份。</p></header>
      <div class="stats"><article class="stat" style="--accent:var(--lime)"><strong>${today.length}</strong><span>今日回答</span><i></i></article><article class="stat" style="--accent:var(--coral)"><strong>${today.length ? Math.round(remembered/today.length*100) : 0}%</strong><span>今日记住率</span><i></i></article><article class="stat" style="--accent:var(--blue)"><strong>${days}</strong><span>累计学习天数</span><i></i></article><article class="stat" style="--accent:#e3a7e8"><strong>${data.words.length}</strong><span>词库总量</span><i></i></article></div>
      <div class="grid-2"><section class="panel section-card"><span class="panel-label">REVIEW LIST</span><h2>需要再见面的词</h2>${weak.length ? weak.map(({word,count}) => `<div class="weak-row"><div><strong>${esc(word.english)}</strong><small>${esc(word.chinese)}</small></div><span>复习 ${count} 次</span></div>`).join("") : '<p class="empty">还没有薄弱词，继续保持。</p>'}</section><section class="panel section-card"><span class="panel-label">PRIVACY</span><h2>本机学习记录</h2><p class="page-copy">单词、资料和进度都保存在当前浏览器中。清除浏览器数据或卸载应用前，请先导出备份。</p><div class="storage-note">✓ 不需要账号<br>✓ 学习记录不上传<br>✓ 背词和资料可离线使用<br>✓ 发音优先使用国内联网音频<br>✓ 拍照识别时照片发送腾讯云</div></section></div>`;
  }

  function renderResources() {
    const labels = { all: "全部", essay: "作文", note: "资料", video: "B站视频" };
    const visible = data.resources.filter((r) => ui.filter === "all" || r.type === ui.filter);
    return `<header><p class="eyebrow">LEARNING LIBRARY</p><h1 class="page-title">把好内容，<br>放在一起。</h1><p class="page-copy">作文范文、写作资料和 B 站视频，随时回来再看。</p></header><div class="filter-row">${Object.entries(labels).map(([key,label]) => `<button class="filter-btn ${ui.filter === key ? "active" : ""}" data-filter="${key}">${label}</button>`).join("")}</div><div class="resource-grid">${visible.map(renderResource).join("") || '<div class="panel empty">这里还没有内容，去管理页添加吧。</div>'}</div>`;
  }
  function renderResource(resource) {
    const label = resource.type === "video" ? "B站视频" : resource.type === "essay" ? "作文范文" : "学习资料";
    const open = ui.openResource === resource.id;
    const url = safeUrl(resource.url);
    return `<article class="resource-card ${resource.type}"><span class="tag">${label}</span><h2>${esc(resource.title)}</h2><p>${esc(resource.description)}</p>${open && resource.content ? `<div class="resource-content">${esc(resource.content)}</div>` : ""}<footer>${url ? `<a href="${url}" target="_blank" rel="noopener">去观看 →</a>` : `<button class="text-btn" data-open-resource="${resource.id}">${open ? "收起内容" : "打开阅读"} →</button>`}<button class="text-btn delete" data-delete-resource="${resource.id}">删除</button></footer></article>`;
  }

  function renderManage() {
    const maxUnit = Math.max(1, ...data.words.map((w) => w.unit));
    return `<header><p class="eyebrow">MY DESK</p><h1 class="page-title">整理这间小小学习室。</h1><p class="page-copy">直接从书里复制词表，也可以收藏作文、资料和 B 站视频。</p></header><div class="manage-grid">
      <form id="wordForm" class="form-card"><span class="panel-label">VOCABULARY</span><h2>添加一个单元的词</h2><label>单元编号<input name="unit" type="number" min="1" value="${maxUnit}" required></label><div class="photo-import"><label class="photo-pick">📷 拍照联网识别<input id="wordPhoto" type="file" accept="image/*" capture="environment"></label><small>请尽量只拍当前单元的一列词表，不要把左右两列一起拍。系统会自动过滤例句、搭配和助记；加入前仍请检查一次。</small><img id="ocrPreview" class="ocr-preview" hidden alt="待识别的词表照片"><div id="ocrStatus" class="ocr-status"><span>正在准备识别…</span><div class="ocr-progress"><i></i></div></div></div><label>词表（每行：英文, 中文, 音标, 例句）<textarea name="rows" rows="9" placeholder="apple, 苹果, /ˈæpl/, I eat an apple.\ncreative, 有创造力的" required></textarea></label><button class="primary-btn" type="submit">＋ 加入词书</button></form>
      <form id="resourceForm" class="form-card"><span class="panel-label">LIBRARY</span><h2>添加作文、资料或视频</h2><label>类型<select name="type"><option value="essay">作文范文</option><option value="note">学习资料</option><option value="video">B站视频</option></select></label><label>标题<input name="title" required placeholder="例如：中考英语高分作文"></label><label>一句说明<input name="description" placeholder="为什么值得看"></label><label>正文内容<textarea name="content" rows="4" placeholder="可以粘贴作文或学习资料"></textarea></label><label>视频链接<input name="url" inputmode="url" placeholder="https://www.bilibili.com/video/..."></label><button class="primary-btn" type="submit">＋ 添加到资料库</button></form>
      <section class="form-card"><span class="panel-label">BACKUP</span><h2>备份与换设备</h2><div class="backup-actions"><button class="secondary-btn" data-action="export">导出备份</button><label class="secondary-btn file-label">导入备份<input id="importFile" type="file" accept="application/json"></label><button class="secondary-btn danger" data-action="clear-progress">清空学习记录</button></div><div class="storage-note">建议每隔一段时间导出一次备份文件。如果更换平板，可以在新设备里导入。</div></section>
      <section class="form-card"><span class="panel-label">WORD BOOK</span><h2>词库管理</h2><p class="page-copy">当前有 ${units().length} 个单元，共 ${data.words.length} 个单词。</p><label>删除整个单元<select id="deleteUnit"><option value="">选择单元</option>${units().map((unit) => `<option value="${unit}">Unit ${unit}（${data.words.filter((w) => w.unit === unit).length}词）</option>`).join("")}</select></label><button class="secondary-btn danger" data-action="delete-unit">删除所选单元</button></section>
    </div>`;
  }

  function bindForms() {
    const wordForm = document.getElementById("wordForm");
    if (wordForm) wordForm.addEventListener("submit", (event) => {
      event.preventDefault(); const form = new FormData(wordForm); const unit = Number(form.get("unit"));
      const rows = String(form.get("rows") || "").split(/\n/).map((line) => line.trim()).filter(Boolean);
      let next = uid(data.words); const added = [];
      rows.forEach((line) => { const parts = line.split(/[,，\t]/).map((p) => p.trim()); const english = parts.shift(); const chinese = parts.shift(); if (english && chinese) added.push({ id: next++, unit, english, chinese, phonetic: parts.shift() || "", example: parts.join(", ") || "" }); });
      if (!added.length) return toast("请按“英文, 中文”填写词表");
      data.words.push(...added); saveData(`已添加 ${added.length} 个单词`); ui.unit = unit; wordForm.reset(); render();
    });
    const wordPhoto = document.getElementById("wordPhoto");
    if (wordPhoto) wordPhoto.addEventListener("change", recognizeWordPhoto);
    const resourceForm = document.getElementById("resourceForm");
    if (resourceForm) resourceForm.addEventListener("submit", (event) => {
      event.preventDefault(); const form = new FormData(resourceForm); const type = String(form.get("type")); const url = String(form.get("url") || "").trim();
      if (type === "video" && !safeUrl(url)) return toast("请输入完整的视频网址");
      data.resources.unshift({ id: uid(data.resources), type, title: String(form.get("title") || "").trim(), description: String(form.get("description") || "").trim(), content: String(form.get("content") || "").trim(), url });
      saveData("已添加到资料库"); resourceForm.reset(); render();
    });
    const file = document.getElementById("importFile");
    if (file) file.addEventListener("change", importBackup);
    const install = document.getElementById("installButton");
    if (install) install.addEventListener("click", installApp);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button,[data-tab]"); if (!target) return;
    if (target.dataset.tab) { ui.tab = target.dataset.tab; ui.revealed = false; render(); return; }
    if (target.dataset.unit) { ui.unit = Number(target.dataset.unit); ui.index = 0; ui.revealed = false; ui.freshUnit = true; render(); return; }
    if (target.dataset.filter) { ui.filter = target.dataset.filter; render(); return; }
    if (target.dataset.openResource) { const id = Number(target.dataset.openResource); ui.openResource = ui.openResource === id ? null : id; render(); return; }
    if (target.dataset.deleteResource) { const id = Number(target.dataset.deleteResource); if (confirm("确定删除这条资料吗？")) { data.resources = data.resources.filter((r) => r.id !== id); saveData("资料已删除"); render(); } return; }
    if (target.dataset.result) { markWord(target.dataset.result); return; }
    const action = target.dataset.action;
    if (action === "reveal") { ui.revealed = true; render(); }
    if (action === "restart") { ui.index = 0; ui.revealed = false; ui.freshUnit = false; render(); }
    if (action === "speak") speak(target.dataset.word);
    if (action === "export") exportBackup();
    if (action === "clear-progress" && confirm("确定清空全部学习记录吗？单词和资料不会被删除。")) { data.attempts = []; saveData("学习记录已清空"); render(); }
    if (action === "delete-unit") deleteUnit();
  });

  function markWord(result) {
    const word = unitWords()[ui.index]; if (!word) return;
    data.attempts.unshift({ id: uid(data.attempts), wordId: word.id, unit: word.unit, result, day: TODAY(), at: new Date().toISOString() });
    saveData(); ui.index += 1; ui.revealed = false; render();
  }
  function speak(word) {
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    if (navigator.onLine) {
      let switched = false;
      const fallback = () => {
        if (switched) return;
        switched = true;
        activeAudio = null;
        speakWithDevice(word);
      };
      const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`);
      activeAudio = audio;
      audio.preload = "auto";
      audio.addEventListener("error", fallback, { once: true });
      audio.addEventListener("ended", () => { if (activeAudio === audio) activeAudio = null; }, { once: true });
      audio.play().catch(fallback);
      return;
    }
    speakWithDevice(word);
  }
  function speakWithDevice(word) {
    if (!("speechSynthesis" in window)) return toast("联网后即可播放单词发音");
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = .82;
    utterance.onerror = () => toast("联网后即可播放单词发音");
    speechSynthesis.speak(utterance);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `词搭子备份-${TODAY()}.json`; link.click(); URL.revokeObjectURL(url); toast("备份文件已导出");
  }
  async function importBackup(event) {
    const file = event.target.files[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed.words) || !Array.isArray(parsed.resources) || !Array.isArray(parsed.attempts)) throw new Error(); data = parsed; saveData("备份已导入"); ui.unit = Math.min(...data.words.map((w) => w.unit), 1); ui.index = 0; render(); }
    catch { toast("这个备份文件无法读取"); }
  }
  function deleteUnit() {
    const select = document.getElementById("deleteUnit"); const unit = Number(select && select.value); if (!unit) return toast("请先选择要删除的单元");
    if (!confirm(`确定删除 Unit ${unit} 的全部单词吗？`)) return;
    const ids = new Set(data.words.filter((w) => w.unit === unit).map((w) => w.id)); data.words = data.words.filter((w) => w.unit !== unit); data.attempts = data.attempts.filter((a) => !ids.has(a.wordId)); saveData(`Unit ${unit} 已删除`); ui.unit = units()[0] || 1; render();
  }
  async function installApp() {
    if (!installPrompt) return toast("请用 Chrome 菜单选择“添加到主屏幕”");
    installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render();
  }
  function updateNetwork() {
    const node = document.getElementById("networkStatus"); if (!node) return;
    node.classList.toggle("offline", !navigator.onLine); node.querySelector("b").textContent = navigator.onLine ? "可离线使用" : "当前离线";
  }

  async function recognizeWordPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = document.getElementById("wordForm");
    const textarea = form?.elements?.rows;
    const preview = document.getElementById("ocrPreview");
    const status = document.getElementById("ocrStatus");
    const statusText = status?.querySelector("span");
    const bar = status?.querySelector("i");
    const previewUrl = URL.createObjectURL(file);
    if (preview) { preview.src = previewUrl; preview.hidden = false; }
    if (status) status.classList.add("active");
    if (statusText) statusText.textContent = "正在压缩照片…";
    if (bar) bar.style.width = "12%";
    try {
      if (!navigator.onLine) throw new Error("联网识别需要网络，请连接网络后重试");
      if (!OCR_ENDPOINT || !/^https:\/\//i.test(OCR_ENDPOINT)) throw new Error("联网识别服务正在配置，请稍后再试");
      const imageBase64 = await imageToBase64(file);
      if (statusText) statusText.textContent = "照片已安全发送，腾讯云正在识别…";
      if (bar) bar.style.width = "58%";
      const response = await fetch(OCR_ENDPOINT, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageBase64 })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "识别服务暂时不可用，请稍后重试");
      const parsed = window.WordBuddyOcr?.parse(Array.isArray(result.lines) ? result.lines.join("\n") : "") || { rows: "", count: 0, filtered: 0 };
      if (!parsed.rows) throw new Error("没有找到可靠的词条。请只拍一列词表，并让文字保持清晰、摆正");
      textarea.value = parsed.rows;
      if (bar) bar.style.width = "100%";
      if (statusText) statusText.textContent = `整理完成：保留 ${parsed.count} 个疑似词条，自动过滤 ${parsed.filtered} 行例句或杂项。请检查后再加入词书。`;
      toast("拍照识别完成，请检查词表");
    } catch (cause) {
      if (statusText) statusText.textContent = cause instanceof Error ? cause.message : "识别失败，请重新拍照";
      if (bar) bar.style.width = "0";
    } finally {
      URL.revokeObjectURL(previewUrl);
      event.target.value = "";
    }
  }

  function imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const source = URL.createObjectURL(file);
      image.onload = () => {
        try {
          const maxSide = 2000;
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
          URL.revokeObjectURL(source);
          resolve(dataUrl.split(",")[1]);
        } catch (error) {
          URL.revokeObjectURL(source);
          reject(error);
        }
      };
      image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("无法读取这张照片")); };
      image.src = source;
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; render(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; toast("已安装到桌面"); render(); });
  window.addEventListener("online", updateNetwork); window.addEventListener("offline", updateNetwork);
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  render();
})();
