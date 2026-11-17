# Nhạc Của Trung

Web: https://t-root.github.io/nhaccuatrung/

## Tải về (bỏ qua thư mục `artist` và `playlist`)

```bash
git clone --filter=blob:none --no-checkout https://github.com/T-Root/nhaccuatrung.git
cd nhaccuatrung
git sparse-checkout init --no-cone
git sparse-checkout set "/*" "!/artist/" "!/playlist/"
git checkout main
```
