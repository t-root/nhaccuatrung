(() => {
  if (window.__vzInstalled) { try { window.__vzSchedule && window.__vzSchedule(); } catch (e) {} return; }
  try {

  // Ở /getlink: ẩn TOÀN BỘ body, chỉ cho .home hiện và phủ kín màn hình.
  // Chỉ dùng CSS (visibility) nên không cần biết tổ tiên của .home, và mọi phần tử mới chèn vào ngoài .home đều tự bị ẩn.
  const accent = /^#[0-9a-f]{6}$/i.test(window.__vzAccent || '') ? window.__vzAccent : '#8ef0d1';
  const rgb = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16)).join(', ');
  const css = `
html.vz-active { --vz-accent: ${accent}; --vz-rgb: ${rgb}; --vz-bg: #080b0e; --vz-text: #aeb7c2; }
html.vz-active, html.vz-active body { overflow: hidden !important; }
html.vz-active body * { visibility: hidden !important; }
html.vz-active .home, html.vz-active .home * { visibility: visible !important; }
html.vz-active .home {
  position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
  width: auto !important; max-width: none !important; margin: 0 !important; padding: 12px !important;
  overflow: auto !important;
}
/* Quảng cáo nằm trong .home */
html.vz-active .google-auto-placed, html.vz-active ins.adsbygoogle,
html.vz-active iframe[id^='aswift'], html.vz-active iframe[src*='googlesyndication'], html.vz-active iframe[src*='doubleclick'],
html.vz-active [id^='google_ads'], html.vz-active [id^='div-gpt-ad'], html.vz-active [class*='adsbygoogle'] { display: none !important; visibility: hidden !important; }
/* Ẩn "Bài Hát Hot" và "Lấy Link Gần Đây" (cả hàng chứa chúng, để không còn khoảng trống) */
html.vz-active .song-chart, html.vz-active .recent-gets { display: none !important; }
html.vz-active .row:has(.song-chart), html.vz-active .row:has(.recent-gets) { display: none !important; }
/* Ẩn hàng chọn "Nguồn:" (Tất cả / ZingMP3 / Keeng / SoundCloud / Mixcloud) trong khối Lấy Link Nhạc */
html.vz-active .home .input-group ~ .d-flex.overflow-auto { display: none !important; }
html.vz-active .home .card-body > .d-flex.overflow-auto.mt-2.pb-1 { display: none !important; }
/* Ẩn dòng "Hỗ trợ: Zing MP3, NhacCuaTui..." và nút "Link hỗ trợ" */
html.vz-active .home .input-group ~ .form-text, html.vz-active .home .card-body > .form-text,
html.vz-active .home [data-bs-target='#support-link-modal'], html.vz-active .home .card-title .badge { display: none !important; }
/* Đổi tiêu đề "Lấy Link Nhạc" thành "Nhập tên bài hát hoặc link" (giấu chữ gốc, chèn chữ mới bằng CSS để Vue không ghi đè được) */
html.vz-active .home .card-title { font-size: 0 !important; line-height: 1.4 !important; }
html.vz-active .home .card-title::before { content: 'Nhập tên bài hát hoặc link'; font-size: 15px; font-weight: 600; }
/* Đổi nút "Lấy Link" thành "Tìm kiếm" (giữ biểu tượng kính lúp, chèn chữ bằng CSS để Vue không ghi đè được) */
html.vz-active .home .input-group > .btn-primary { font-size: 0 !important; }
html.vz-active .home .input-group > .btn-primary i { font-size: 14px !important; margin-right: 6px; }
html.vz-active .home .input-group > .btn-primary::after { content: 'Tìm kiếm'; font-size: 14px; }
/* Ẩn nút Thêm vào Playlist của trang */
html.vz-active button[title='Thêm vào Playlist'] { display: none !important; }
/* Ẩn nút tải Lossless (file .flac rất nặng, GitHub không nhận) */
html.vz-active a[download$='.flac'], html.vz-active a[href*='flac-z3'], html.vz-active a[href*='.flac'] { display: none !important; }

/* ===== Giao diện 1 màu chủ đạo + viền (ghi đè màu nhiều sắc của trang) ===== */
html.vz-active .home, html.vz-active .home * { box-shadow: none !important; text-shadow: none !important; background-image: none !important; }
html.vz-active .home { color: var(--vz-text) !important; background: var(--vz-bg) !important; }
html.vz-active .home .card, html.vz-active .home .card-header, html.vz-active .home .card-body, html.vz-active .home .list-group-item, html.vz-active .home .search-results-container, html.vz-active .home .content-details, html.vz-active .home .song-details { background: transparent !important; color: var(--vz-text) !important; }
html.vz-active .home .card { border: 1px solid rgba(var(--vz-rgb), .55) !important; border-radius: 0 !important; }
html.vz-active .home .card-header, html.vz-active .home .list-group-item, html.vz-active .home .border-bottom { border-color: rgba(var(--vz-rgb), .25) !important; }
html.vz-active .home h1, html.vz-active .home h2, html.vz-active .home h3, html.vz-active .home h4, html.vz-active .home h5, html.vz-active .home h6, html.vz-active .home .card-title { color: var(--vz-accent) !important; }
html.vz-active .home a, html.vz-active .home .text-primary, html.vz-active .home .text-success, html.vz-active .home .text-danger, html.vz-active .home .text-warning, html.vz-active .home .text-info { color: var(--vz-accent) !important; }
html.vz-active .home .text-muted, html.vz-active .home small, html.vz-active .home .form-text { color: var(--vz-text) !important; opacity: .85; }
html.vz-active .home input, html.vz-active .home .form-control, html.vz-active .home select, html.vz-active .home textarea { background: transparent !important; color: #fff !important; border: 1px solid rgba(var(--vz-rgb), .55) !important; border-radius: 0 !important; }
html.vz-active .home .form-control::placeholder { color: var(--vz-text) !important; opacity: .6; }
html.vz-active .home .form-control:focus { border-color: var(--vz-accent) !important; outline: 0 !important; }
html.vz-active .home .btn, html.vz-active .home .badge, html.vz-active .home .type-label, html.vz-active .home a.btn { background: transparent !important; color: var(--vz-accent) !important; border: 1px solid var(--vz-accent) !important; border-radius: 0 !important; }
html.vz-active .home .btn:hover, html.vz-active .home .btn:active, html.vz-active .home .btn:focus { background: var(--vz-accent) !important; color: var(--vz-bg) !important; }
html.vz-active .home .btn.active, html.vz-active .home .btn-primary, html.vz-active .home .btn-success { background: rgba(var(--vz-rgb), .18) !important; }
html.vz-active .home .btn-primary:hover, html.vz-active .home .btn-success:hover { background: var(--vz-accent) !important; }
html.vz-active .home .rounded, html.vz-active .home .rounded-pill, html.vz-active .home img { border-radius: 0 !important; }
html.vz-active .home .song-thumbnail img, html.vz-active .home img { border: 1px solid rgba(var(--vz-rgb), .55) !important; }
html.vz-active .home .progress, html.vz-active .home .progress-bar { background: transparent !important; border: 1px solid var(--vz-accent) !important; border-radius: 0 !important; }
html.vz-active .home .progress-bar { background: rgba(var(--vz-rgb), .5) !important; }
html.vz-active .home i, html.vz-active .home .mdi, html.vz-active .home .fas, html.vz-active .home .fab { color: inherit !important; }
html.vz-active ::selection { background: rgba(var(--vz-rgb), .4); }
/* Chưa có .home thì giấu cả trang để khỏi chớp (tự mở lại sau 4 giây) */
html.vz-pending body { visibility: hidden !important; }`;

  // Trang đích: đường dẫn bắt đầu bằng /getlink, hoặc trang đã có khối .home (phòng khi trang đổi đường dẫn)
  const isTarget = () => /^\/getlink(\/|$)/.test(location.pathname) || !!document.querySelector('.home');
  let style = null;
  let observer = null;
  let observedEl = null;

  function ensure() {
    const el = document.documentElement;
    if (!el) return false; // document-start: <html> có thể chưa sẵn sàng
    if (!style || !style.isConnected) { // style bị trang gỡ thì cài lại
      style = style || document.createElement('style');
      style.textContent = css;
      (document.head || el).appendChild(style);
    }
    if (observedEl !== el) { // theo dõi DOM và việc trang gỡ class của <html>; <html> bị thay thì gắn lại
      if (observer) observer.disconnect();
      observer = new MutationObserver(schedule);
      observer.observe(el, { childList: true, subtree: true });
      observer.observe(el, { attributes: true, attributeFilter: ['class'] });
      observedEl = el;
    }
    return true;
  }

  // Ẩn bằng JS theo CHỮ trên trang (không phụ thuộc tên class/CSS): gắn thẳng display:none !important vào phần tử.
  function goneEl(el) { if (el && el.style.display !== 'none') el.style.setProperty('display', 'none', 'important'); }
  function hideByText() {
    const home = document.querySelector('.home');
    if (!home) return;
    // Khối "Bài Hát Hot" / "Lấy Link Gần Đây": ẩn cả thẻ card và hàng chứa chúng
    home.querySelectorAll('h5').forEach(h => {
      const t = (h.textContent || '').trim();
      if (t.indexOf('Bài Hát Hot') !== -1 || t.indexOf('Lấy Link Gần Đây') !== -1) {
        const card = h.closest('.card');
        goneEl(card);
        const col = card && card.parentElement;
        if (col && col !== home) goneEl(col);
        const row = col && col.parentElement;
        if (row && row !== home && row.classList.contains('row')) goneEl(row);
      }
    });
    // Hàng chọn "Nguồn:" (Tất cả / ZingMP3 / Keeng / SoundCloud / Mixcloud)
    home.querySelectorAll('small').forEach(sm => {
      if ((sm.textContent || '').trim().indexOf('Nguồn') === 0 && sm.parentElement && sm.parentElement !== home) goneEl(sm.parentElement);
    });
    // Class cố định (phòng khi chữ đổi)
    home.querySelectorAll('.song-chart, .recent-gets').forEach(goneEl);
  }

  function apply() {
    if (!ensure()) return;
    const el = document.documentElement;
    if (!isTarget()) { el.classList.remove('vz-active', 'vz-pending'); return; }
    if (!el.classList.contains('vz-active')) el.classList.add('vz-active');
    if (document.body && document.querySelector('.home')) {
      el.classList.remove('vz-pending');
      hideByText();
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; apply(); });
  }
  window.__vzSchedule = schedule;

  function boot() {
    if (!ensure()) { setTimeout(boot, 5); return; }
    if (isTarget()) {
      document.documentElement.classList.add('vz-active', 'vz-pending');
      setTimeout(() => document.documentElement && document.documentElement.classList.remove('vz-pending'), 4000);
    }
    schedule();
  }
  boot();

  // Điều hướng kiểu SPA (pushState/replaceState không phát popstate)
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      schedule();
      return result;
    };
  }
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  setInterval(apply, 500); // lưới an toàn
  window.__vzInstalled = true; // chỉ đánh dấu khi đã cài xong, để lần chèn sau còn thử lại nếu lần này lỗi giữa chừng
  } catch (e) { /* lỗi thì để Android chèn lại */ }
})();
