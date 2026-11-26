package com.trung.nhaccuatrung;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Mở DownloadActivity và quản lý các thư mục trong Download/nhaccuatrung:
 * - gốc: nhạc bạn tự tải từ nguồn ngoài (tab "Đã tải", đẩy thủ công rồi xóa);
 * - autodownload/&lt;nghệ sĩ&gt;: bài tải bằng nút Download của app, app tự xử lý ngầm rồi xóa;
 * - localdownload: bài tải từ thư viện về máy.
 */
@CapacitorPlugin(
    name = "Downloader",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class DownloaderPlugin extends Plugin {
    private static final String FOLDER = "nhaccuatrung";
    private static final String LOCAL_FOLDER = "localdownload";
    private static final Pattern AUDIO = Pattern.compile(".*\\.(mp3|wav|m4a|ogg|flac|aac)$");

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(getContext(), DownloadActivity.class);
        intent.putExtra(DownloadActivity.EXTRA_URL, call.getString("url", "https://vuiz.net/getlink/"));
        intent.putExtra(DownloadActivity.EXTRA_COLOR, call.getString("color", ""));
        JSArray artistList = call.getArray("artists");
        intent.putExtra(DownloadActivity.EXTRA_ARTISTS, artistList != null ? artistList.toString() : "[]");
        getActivity().startActivity(intent);
        call.resolve();
    }

    private String alias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
    }

    /** Liệt kê file ở gốc Download/nhaccuatrung (không đệ quy). */
    @PluginMethod
    public void list(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "onPermission");
            return;
        }
        listFiles(call);
    }

    /** Liệt kê file trong nhaccuatrung/autodownload/&lt;nghệ sĩ&gt;/ (nghệ sĩ = tên thư mục). */
    @PluginMethod
    public void listAuto(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "onPermissionAuto");
            return;
        }
        listAutoFiles(call);
    }

    @PermissionCallback
    private void onPermission(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) listFiles(call);
        else call.reject("Chưa được cấp quyền đọc nhạc.");
    }

    @PermissionCallback
    private void onPermissionAuto(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) listAutoFiles(call);
        else call.reject("Chưa được cấp quyền đọc nhạc.");
    }

    private File baseDir() {
        return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
    }

    private static boolean safeName(String name) {
        return name != null && !name.isEmpty() && !name.contains("/") && !name.contains("\\") && !name.contains("..");
    }

    private boolean removeFile(File f) {
        boolean ok = !f.exists() || f.delete();
        if (!ok) ok = deleteViaMediaStore(f);
        return ok;
    }

    /** Xóa các file ở gốc Download/nhaccuatrung theo tên (chỉ nhận tên file, không nhận đường dẫn). Trả về deleted / failed. */
    @PluginMethod
    public void delete(PluginCall call) {
        JSArray names = call.getArray("names");
        File dir = baseDir();
        JSArray deleted = new JSArray();
        JSArray failed = new JSArray();
        if (names != null) {
            for (int i = 0; i < names.length(); i++) {
                String name = names.optString(i, "");
                if (!safeName(name)) continue;
                if (removeFile(new File(dir, name))) deleted.put(name); else failed.put(name);
            }
        }
        JSObject ret = new JSObject();
        ret.put("deleted", deleted);
        ret.put("failed", failed);
        call.resolve(ret);
    }

    /** Xóa file trong autodownload/&lt;nghệ sĩ&gt;/ theo {artist, name}; thư mục nghệ sĩ trống thì xóa luôn. */
    @PluginMethod
    public void deleteAuto(PluginCall call) {
        JSArray items = call.getArray("items");
        File autoDir = new File(baseDir(), DownloadActivity.AUTO_FOLDER);
        JSArray deleted = new JSArray();
        JSArray failed = new JSArray();
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                org.json.JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String artist = item.optString("artist", "");
                String name = item.optString("name", "");
                if (!safeName(artist) || !safeName(name)) continue;
                File artistDir = new File(autoDir, artist);
                if (removeFile(new File(artistDir, name))) {
                    deleted.put(name);
                    String[] left = artistDir.list();
                    if (left != null && left.length == 0) artistDir.delete();
                } else failed.put(name);
            }
        }
        JSObject ret = new JSObject();
        ret.put("deleted", deleted);
        ret.put("failed", failed);
        call.resolve(ret);
    }

    /** Tải một URL về Download/nhaccuatrung/localdownload/&lt;name&gt; bằng DownloadManager (hệ thống tự hiện thông báo). */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "");
        if (url.isEmpty() || !safeName(name)) { call.reject("Thiếu địa chỉ hoặc tên file."); return; }
        try {
            File dir = new File(baseDir(), LOCAL_FOLDER);
            dir.mkdirs();
            File existing = new File(dir, name);
            if (existing.exists()) removeFile(existing);
            android.app.DownloadManager.Request req = new android.app.DownloadManager.Request(Uri.parse(url));
            req.setTitle(name);
            req.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, FOLDER + "/" + LOCAL_FOLDER + "/" + name);
            ((android.app.DownloadManager) getContext().getSystemService(android.content.Context.DOWNLOAD_SERVICE)).enqueue(req);
            call.resolve();
        } catch (Exception e) {
            call.reject("Không tải được: " + e.getMessage());
        }
    }

    /** Android 10+: file do app khác (DownloadManager) tạo có thể không xóa trực tiếp được, thử xóa qua MediaStore. */
    private boolean deleteViaMediaStore(File f) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Files.getContentUri("external");
            int rows = resolver.delete(collection, MediaStore.MediaColumns.DATA + "=?", new String[] { f.getAbsolutePath() });
            return rows > 0 || !f.exists();
        } catch (Exception e) {
            return !f.exists();
        }
    }

    /** Tên các file DownloadManager đang tải dở. */
    private java.util.Set<String> busyNames() {
        java.util.Set<String> busy = new java.util.HashSet<>();
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) getContext().getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            android.database.Cursor c = dm.query(new android.app.DownloadManager.Query().setFilterByStatus(
                android.app.DownloadManager.STATUS_PENDING | android.app.DownloadManager.STATUS_RUNNING | android.app.DownloadManager.STATUS_PAUSED));
            if (c != null) {
                while (c.moveToNext()) busy.add(c.getString(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TITLE)));
                c.close();
            }
        } catch (Exception ignored) { }
        return busy;
    }

    private static File[] audioFiles(File dir) {
        File[] found = dir.listFiles((d, name) -> AUDIO.matcher(name.toLowerCase(Locale.ROOT)).matches());
        if (found == null) return new File[0];
        Arrays.sort(found, Comparator.comparingLong(File::lastModified).reversed());
        return found;
    }

    private JSObject entry(File f, String artist) {
        JSObject entry = new JSObject();
        entry.put("name", f.getName());
        entry.put("path", f.getAbsolutePath());
        entry.put("size", f.length());
        if (artist != null) entry.put("artist", artist);
        return entry;
    }

    private void listFiles(PluginCall call) {
        java.util.Set<String> busy = busyNames();
        JSArray files = new JSArray();
        for (File f : audioFiles(baseDir())) {
            if (!f.isFile() || busy.contains(f.getName())) continue; // đang tải dở thì chưa liệt kê
            files.put(entry(f, null));
        }
        JSObject ret = new JSObject();
        ret.put("files", files);
        ret.put("busy", busy.size());
        call.resolve(ret);
    }

    private void listAutoFiles(PluginCall call) {
        java.util.Set<String> busy = busyNames();
        JSArray files = new JSArray();
        File[] artistDirs = new File(baseDir(), DownloadActivity.AUTO_FOLDER).listFiles(File::isDirectory);
        if (artistDirs != null) {
            for (File artistDir : artistDirs) {
                for (File f : audioFiles(artistDir)) {
                    if (!f.isFile() || busy.contains(f.getName())) continue;
                    files.put(entry(f, artistDir.getName()));
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("files", files);
        ret.put("busy", busy.size());
        call.resolve(ret);
    }
}
