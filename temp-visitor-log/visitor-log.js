/* TẠM THỜI: mỗi lượt truy cập ghi {ip, time, timeVN} vào ip.json trong repo GitHub.
   Làm y như cách app lưu playlist: lấy khóa từ key.txt (token = 'github_pat_' + nội dung key.txt)
   rồi gọi GitHub Contents API trực tiếp từ trình duyệt. IP lấy từ api.ipify.org.
   GỠ: xóa thư mục temp-visitor-log/, file ip.json và thẻ <script> có đánh dấu TEMP-VISITOR-LOG trong index.html. */
(function () {
  var REPO = 't-root/nhaccuatrung';
  var BRANCH = 'main';
  var FILE = 'ip.json';
  var MAX_ENTRIES = 5000; // quá số này thì bỏ bớt dòng cũ nhất

  // APK (origin localhost) và lúc dev trên máy thì không ghi.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  // Mỗi phiên tab chỉ ghi 1 lần, tránh F5 liên tục làm đầy file.
  try {
    if (sessionStorage.getItem('visitorLogged')) return;
    sessionStorage.setItem('visitorLogged', '1');
  } catch (e) {}

  function toBase64(text) {
    var bytes = new TextEncoder().encode(text), binary = '';
    for (var i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function fromBase64(b64) {
    var binary = atob(b64.replace(/\n/g, '')), bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function log() {
    var ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip;
    var key = (await (await fetch('./key.txt', { cache: 'no-store' })).text()).trim();
    var now = new Date();
    var entry = {
      ip: ip,
      time: now.toISOString(),
      timeVN: now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };
    var endpoint = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;
    var headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer github_pat_' + key,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    // Nhiều người vào cùng lúc có thể đụng sha -> đọc lại rồi thử lại.
    for (var attempt = 0; attempt < 4; attempt++) {
      var current = await fetch(endpoint + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: headers, cache: 'no-store' });
      var list = [], sha;
      if (current.ok) {
        var file = await current.json();
        sha = file.sha;
        try { list = JSON.parse(fromBase64(file.content)); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
      } else if (current.status !== 404) return;
      list.push(entry);
      if (list.length > MAX_ENTRIES) list = list.slice(-MAX_ENTRIES);
      var body = {
        message: 'visitor-log: ' + ip + ' [skip ci]', // [skip ci] để mỗi lượt vào không kích hoạt deploy Pages
        content: toBase64(JSON.stringify(list, null, 2) + '\n'),
        branch: BRANCH
      };
      if (sha) body.sha = sha;
      var res = await fetch(endpoint, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body)
      });
      if (res.ok || (res.status !== 409 && res.status !== 422)) return;
    }
  }

  log().catch(function () {});
})();
