package com.trung.nhaccuatrung;

import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolderPickerPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() == null) return;

        // Giữ tiến trình render của WebView ở mức ưu tiên cao kể cả khi Activity không còn hiển thị
        // (mặc định Android hạ xuống "waived" nên TikTok/app khác ăn RAM là renderer bị giết,
        // JS chết => nút Play ở thông báo không còn tác dụng).
        WebView webView = getBridge().getWebView();
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        // Nếu renderer vẫn bị giết thì nạp lại trang thay vì để app treo/thoát; app tự khôi phục
        // hàng đợi + bài đang phát từ localStorage (restorePlaybackState).
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                view.post(view::reload);
                return true;
            }
        });
    }
}
