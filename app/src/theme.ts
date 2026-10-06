// Bảng màu lấy đúng từ :root (bản dark override cuối) của styles.css gốc
export const colors = {
  bg: '#080b0e',
  surface: '#11161b',
  surfaceAlt: '#171d24',
  border: '#29333d',
  text: '#e7edf2',
  textMuted: '#7e8b96',
  accent: '#8ef0d1',
  accentDim: 'rgba(142, 240, 209, 0.16)',
  danger: '#b23a3a',
  dangerHover: '#d64545',
  gold: '#c79a54',
  blue: '#6f8db5',
  coral: '#d67a68',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
// Bản dark override cuối của styles.css ép `border-radius: 0 !important` lên
// TOÀN BỘ giao diện ("Technical monochrome direction: ... hard edges, one
// accent") — không còn nút/chip/thẻ bo tròn nào cả, kể cả những chỗ radius lớn
// (18px) hay pill (999px) ở bản theme sáng trước đó.
export const radius = { sm: 0, md: 0, lg: 0, pill: 0 };

// SquareVN = font riêng của Trung (assets/fonts/Square-VN.ttf, hỗ trợ dấu tiếng
// Việt). Bản web gốc đặt `font-family: "Square VN"` ngay trên :root và KHÔNG
// override lại ở đâu khác (không có <link> Google Fonts, không "DM Sans" nào
// trong styles.css) — tức toàn bộ trang, kể cả phần thân, dùng đúng 1 font này.
// Font chỉ có 1 file (weight 400-700 gộp) nên heading/body/medium/bold đều trỏ
// chung về SquareVN thay vì tải thêm DM Sans từ ngoài.
export const fonts = {
  heading: 'SquareVN',
  headingBold: 'SquareVN',
  body: 'SquareVN',
  bodyMedium: 'SquareVN',
  bodyBold: 'SquareVN',
};
