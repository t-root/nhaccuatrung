package com.trung.nhaccuatrung;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import java.io.File;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/**
 * Mở trang tải (vuiz.net/getlink) trong WebView riêng. Khi người dùng bấm tải file thì bắt lại
 * và lưu vào Download/nhaccuatrung bằng DownloadManager.
 */
public class DownloadActivity extends Activity {
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_COLOR = "color";
    public static final String EXTRA_ARTISTS = "artists";
    public static final String AUTO_FOLDER = "autodownload";
    public static final String DEFAULT_ARTIST = "Other";
    private String accent = "#8ef0d1";
    private static final String FOLDER = "nhaccuatrung";
    private WebView webView;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable ticker;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String color = getIntent().getStringExtra(EXTRA_COLOR);
        if (color != null && color.matches("#[0-9a-fA-F]{6}")) accent = color;
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        // Chèn script ngay đầu mọi tài liệu (trước cả khi trang vẽ) để quảng cáo không kịp chớp lên.
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(webView, loadGetlinkScript(), Collections.singleton("*"));
            }
        } catch (Throwable ignored) { /* lỗi thì dùng cách chèn ở onPageStarted/onPageFinished */ }
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                injectGetlinkOnly(view);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectGetlinkOnly(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectGetlinkOnly(view);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return scheme != null && !scheme.startsWith("http"); // chặn intent://, market:// ...
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                startDownload(url, userAgent, contentDisposition, mimeType));

        // Lưới an toàn phía Android: cứ 0,6 giây chèn lại script (script tự bỏ qua nếu đã cài). Nhờ đó dù lần chèn nào bị lỡ,
        // trang thay đổi nội dung hay load lại thì phần ẩn vẫn được áp lại.
        ticker = new Runnable() {
            @Override
            public void run() {
                if (webView == null) return;
                injectGetlinkOnly(webView);
                handler.postDelayed(this, 600);
            }
        };
        handler.postDelayed(ticker, 600);

        String url = getIntent().getStringExtra(EXTRA_URL);
        webView.loadUrl(url != null ? url : "https://vuiz.net/getlink/");
    }

    /** Giống extension "Vuiz GetLink Only": ở /getlink chỉ giữ khối .home, ẩn phần còn lại và quảng cáo. */
    private String getlinkScript;

    private String loadGetlinkScript() {
        if (getlinkScript == null) {
            try (java.io.InputStream in = getAssets().open("vuiz-getlink.js")) {
                // Đặt màu chủ đạo của app trước script để trang vuiz dùng chung màu
                getlinkScript = "window.__vzAccent='" + accent + "';"
                        + new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }
        return getlinkScript;
    }

    /** Dự phòng khi máy không hỗ trợ document-start: chèn lại ở các mốc tải trang (script tự chống cài trùng). */
    private void injectGetlinkOnly(WebView view) {
        view.evaluateJavascript(loadGetlinkScript(), null);
    }

    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            Toast.makeText(this, "Trang này tạo file kiểu blob, chưa hỗ trợ tải", Toast.LENGTH_LONG).show();
            return;
        }
        String guessed = URLUtil.guessFileName(url, contentDisposition, mimeType);
        int dot = guessed.lastIndexOf('.');
        final String ext = dot > 0 ? guessed.substring(dot) : "";
        final String guessedBase = dot > 0 ? guessed.substring(0, dot) : guessed;

        // Lấy tên bài hát trên trang (h4.mb-2, bỏ phần badge như ZingMP3) để điền sẵn vào ô tên.
        String js = "(function(){var h=document.querySelector('h4.mb-2');if(!h)return '';"
                + "var c=h.cloneNode(true);c.querySelectorAll('span').forEach(function(x){x.remove();});"
                + "return c.textContent.replace(/\s+/g,' ').trim();})()";
        webView.evaluateJavascript(js, value -> {
            String title = "";
            try { title = new org.json.JSONArray("[" + value + "]").optString(0, ""); } catch (Exception ignored) { }
            title = title.replaceAll("[\\/:*?\"<>|]", "").trim();
            showNameDialog(url, userAgent, mimeType, ext, title.isEmpty() ? guessedBase : title);
        });
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private EditText themedInput(int accentColor, String hint) {
        EditText e = new EditText(this);
        e.setSingleLine(true);
        e.setTextColor(0xFFFFFFFF);
        e.setHintTextColor(0xFF6B7480);
        e.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accentColor));
        if (hint != null) e.setHint(hint);
        return e;
    }

    private TextView themedLabel(String text, int color, float size) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(color);
        t.setTextSize(size);
        return t;
    }

    /** Popup theo giao diện app: nền #080b0e, viền + chữ màu chủ đạo, góc vuông như trang tải. */
    private void showNameDialog(String url, String userAgent, String mimeType, String ext, String base) {
        final int accentColor = android.graphics.Color.parseColor(accent);
        final int textColor = 0xFFAEB7C2;
        final int bg = 0xFF080B0E;
        int pad = dp(20);

        final EditText input = themedInput(accentColor, null);
        input.setText(base);
        input.setSelection(base.length());

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, dp(8));
        android.graphics.drawable.GradientDrawable frame = new android.graphics.drawable.GradientDrawable();
        frame.setColor(bg);
        frame.setStroke(dp(1), accentColor);
        box.setBackground(frame);

        TextView title = themedLabel("Đặt tên file", accentColor, 20);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        box.addView(title);
        TextView msg = themedLabel("Tải về rồi tự đưa lên nghệ sĩ bên dưới và xóa file trên máy (đuôi " + (ext.isEmpty() ? "không có" : ext) + " được giữ nguyên)", textColor, 13);
        msg.setPadding(0, dp(6), 0, dp(10));
        box.addView(msg);
        box.addView(input);

        // Danh sách nghệ sĩ (Other luôn đứng đầu và là mặc định) + ô tạo nghệ sĩ mới (ưu tiên hơn danh sách).
        java.util.List<String> artistNames = new java.util.ArrayList<>();
        artistNames.add(DEFAULT_ARTIST);
        try {
            org.json.JSONArray arr = new org.json.JSONArray(getIntent().getStringExtra(EXTRA_ARTISTS));
            for (int i = 0; i < arr.length(); i++) {
                String n = arr.optString(i, "").trim();
                if (!n.isEmpty() && !artistNames.contains(n)) artistNames.add(n);
            }
        } catch (Exception ignored) { }
        TextView artistLabel = themedLabel("Tải lên nghệ sĩ", accentColor, 12);
        artistLabel.setPadding(0, dp(14), 0, 0);
        box.addView(artistLabel);
        final Spinner artistSpinner = new Spinner(this);
        artistSpinner.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, artistNames) {
            private View tint(View v) { if (v instanceof TextView) { ((TextView) v).setTextColor(0xFFFFFFFF); v.setBackgroundColor(bg); } return v; }
            @Override public View getView(int p, View c, ViewGroup parent) { return tint(super.getView(p, c, parent)); }
            @Override public View getDropDownView(int p, View c, ViewGroup parent) { return tint(super.getDropDownView(p, c, parent)); }
        });
        artistSpinner.setSelection(0);
        artistSpinner.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accentColor));
        android.graphics.drawable.GradientDrawable popupBg = new android.graphics.drawable.GradientDrawable();
        popupBg.setColor(bg);
        popupBg.setStroke(dp(1), accentColor);
        artistSpinner.setPopupBackgroundDrawable(popupBg);
        box.addView(artistSpinner);
        final EditText newArtist = themedInput(accentColor, "Hoặc nhập tên nghệ sĩ mới");
        box.addView(newArtist);

        final AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(box)
                .setPositiveButton("Tải về", (d, w) -> {
                    String typed = input.getText().toString().replaceAll("[\\/:*?\"<>|]", "").trim();
                    if (typed.isEmpty()) typed = base;
                    if (!ext.isEmpty() && typed.toLowerCase().endsWith(ext.toLowerCase())) typed = typed.substring(0, typed.length() - ext.length());
                    String artist = newArtist.getText().toString().replaceAll("[\\/:*?\"<>|]", "").trim();
                    if (artist.isEmpty()) artist = String.valueOf(artistSpinner.getSelectedItem());
                    if (artist.isEmpty() || artist.equals(".") || artist.equals("..")) artist = DEFAULT_ARTIST;
                    enqueue(url, userAgent, mimeType, typed + ext, artist);
                })
                .setNegativeButton("Hủy", null)
                .create();
        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(accentColor);
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(textColor);
        });
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(bg));
        dialog.show();
    }

    private void enqueue(String url, String userAgent, String mimeType, String name, String artist) {
        try {
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(mimeType);
            req.addRequestHeader("User-Agent", userAgent);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) req.addRequestHeader("Cookie", cookie);
            req.addRequestHeader("Referer", webView != null && webView.getUrl() != null ? webView.getUrl() : url);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setTitle(name);
            // Bài tải bằng app nằm trong nhaccuatrung/autodownload/<nghệ sĩ>/ để app tự xử lý ngầm; .nomedia giấu khỏi app nhạc/thư viện.
            File autoDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER + "/" + AUTO_FOLDER);
            File artistDir = new File(autoDir, artist);
            artistDir.mkdirs();
            try { new File(autoDir, ".nomedia").createNewFile(); } catch (Exception ignored) { }
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, FOLDER + "/" + AUTO_FOLDER + "/" + artist + "/" + name);
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(req);
            Toast.makeText(this, "Đang tải: " + name, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Không tải được: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
