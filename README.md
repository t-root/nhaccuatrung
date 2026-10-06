# Nhạc Của Trung

Web: https://t-root.github.io/nhaccuatrung/

## Clone nhẹ (không tải `artist/` và `playlist/`)

```bash
git clone --filter=blob:none --sparse https://github.com/t-root/nhaccuatrung && cd nhaccuatrung && git sparse-checkout set app fonts .github
```

PowerShell cũ (không có `&&`):

```bash
git clone --filter=blob:none --sparse https://github.com/t-root/nhaccuatrung; cd nhaccuatrung; git sparse-checkout set app fonts .github
```
