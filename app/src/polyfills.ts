// Hermes (JS engine mặc định của React Native) không có sẵn atob/btoa như
// trình duyệt. github.ts dùng 2 hàm này để mã hoá/giải mã nội dung playlist.json
// qua GitHub Contents API (API đó yêu cầu nội dung base64), nên phải polyfill
// trước khi bất kỳ module nào khác chạy.
import { decode, encode } from 'base-64';

if (typeof global.atob === 'undefined') global.atob = decode;
if (typeof global.btoa === 'undefined') global.btoa = encode;
