# Ghi IP người truy cập (TẠM THỜI)

Mỗi lượt vào web (trừ localhost/APK) thêm `{ip, time, timeVN}` vào `ip.json` ở gốc repo.
Dùng đúng token trong `key.txt` như chức năng lưu playlist, không cần dịch vụ nào khác.

## Gỡ
1. Xóa thư mục `temp-visitor-log/` và file `ip.json`.
2. Xóa thẻ `<script src="temp-visitor-log/visitor-log.js">` (có comment `TEMP-VISITOR-LOG`) trong `index.html`.
