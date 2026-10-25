/* TẠM THỜI: mỗi lượt truy cập ghi {ip, time, timeVN} vào ip.json trong repo GitHub.
   Làm y như cách app lưu playlist: lấy khóa từ key.txt (token = 'github_pat_' + nội dung key.txt)
   rồi gọi GitHub Contents API trực tiếp từ trình duyệt. IP + vị trí/nhà mạng ước tính lấy từ ipwho.is
   (dự phòng ipapi.co rồi api.ipify.org). Chỉ ghi các thông tin trình duyệt cho phép đọc mà KHÔNG cần xin quyền.
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

  // Thông tin vị trí/nhà mạng ước tính từ IP, thử lần lượt từng dịch vụ.
  async function getIpInfo() {
    try {
      var d = await (await fetch('https://ipwho.is/')).json();
      if (d && d.success !== false && d.ip) {
        return {
          ip: d.ip, type: d.type, city: d.city, region: d.region, country: d.country, countryCode: d.country_code,
          isp: d.connection && d.connection.isp, org: d.connection && d.connection.org,
          asn: d.connection && d.connection.asn, ipTimezone: d.timezone && d.timezone.id
        };
      }
    } catch (e) {}
    try {
      var d2 = await (await fetch('https://ipapi.co/json/')).json();
      if (d2 && d2.ip && !d2.error) {
        return {
          ip: d2.ip, type: d2.version, city: d2.city, region: d2.region, country: d2.country_name, countryCode: d2.country_code,
          isp: d2.org, org: d2.org, asn: d2.asn, ipTimezone: d2.timezone
        };
      }
    } catch (e) {}
    return { ip: (await (await fetch('https://api.ipify.org?format=json')).json()).ip };
  }

  // Thông tin thiết bị/trình duyệt đọc được mà không bật hộp thoại xin quyền.
  async function getClientInfo() {
    var nav = navigator, c = nav.connection || nav.mozConnection || nav.webkitConnection || {};
    var info = {
      userAgent: nav.userAgent,
      platform: nav.platform,
      language: nav.language,
      languages: (nav.languages || []).slice(0, 5),
      timezone: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone,
      screen: screen.width + 'x' + screen.height,
      viewport: innerWidth + 'x' + innerHeight,
      pixelRatio: window.devicePixelRatio,
      colorDepth: screen.colorDepth,
      touchPoints: nav.maxTouchPoints,
      cpuCores: nav.hardwareConcurrency,
      memoryGB: nav.deviceMemory,
      network: c.effectiveType ? { type: c.type, effectiveType: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, saveData: c.saveData } : undefined,
      darkMode: matchMedia('(prefers-color-scheme: dark)').matches,
      pwa: matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
      cookies: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack,
      referrer: document.referrer || undefined,
      page: location.pathname + location.search
    };
    // Client Hints (Chromium): hãng/model máy, phiên bản hệ điều hành... không cần xin quyền.
    try {
      var uad = nav.userAgentData;
      if (uad && uad.getHighEntropyValues) {
        var h = await uad.getHighEntropyValues(['model', 'platformVersion', 'architecture', 'bitness', 'fullVersionList']);
        info.hints = {
          mobile: uad.mobile, os: h.platform || uad.platform, osVersion: h.platformVersion, model: h.model || undefined,
          arch: h.architecture, bitness: h.bitness,
          browsers: (h.fullVersionList || []).filter(function (b) { return !/not.?a.?brand/i.test(b.brand); })
            .map(function (b) { return b.brand + ' ' + b.version; })
        };
      }
    } catch (e) {}
    // Bỏ các trường rỗng cho gọn file.
    Object.keys(info).forEach(function (k) { if (info[k] === undefined || info[k] === null || info[k] === '') delete info[k]; });
    return info;
  }

  async function log() {
    var ipInfo = await getIpInfo();
    var ip = ipInfo.ip;
    var key = (await (await fetch('./key.txt', { cache: 'no-store' })).text()).trim();
    var now = new Date();
    var entry = { ip: ip };
    Object.keys(ipInfo).forEach(function (k) { if (k !== 'ip' && ipInfo[k]) entry[k] = ipInfo[k]; });
    entry.time = now.toISOString();
    entry.timeVN = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    entry.device = await getClientInfo();
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
