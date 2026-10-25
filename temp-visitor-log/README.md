# Ghi IP người truy cập (TẠM THỜI)

Mỗi lượt vào web (trừ localhost/APK) thêm một dòng vào `ip.json` ở gốc repo.
Dùng đúng token trong `key.txt` như chức năng lưu playlist, không cần dịch vụ nào khác.

Mỗi dòng gồm: `ip`, `type`, `city`, `region`, `country`, `isp`, `org`, `asn`, `ipTimezone` (ước tính từ IP qua ipwho.is),
`time`, `timeVN`, và `device` (userAgent, hệ điều hành/model máy, ngôn ngữ, múi giờ, màn hình, CPU/RAM, loại mạng,
chế độ tối, PWA, trang nguồn...). Toàn bộ chỉ là thông tin trình duyệt cho đọc sẵn, không xin quyền người dùng.

## Gỡ
1. Xóa thư mục `temp-visitor-log/` và file `ip.json`.
2. Xóa thẻ `<script src="temp-visitor-log/visitor-log.js">` (có comment `TEMP-VISITOR-LOG`) trong `index.html`.
