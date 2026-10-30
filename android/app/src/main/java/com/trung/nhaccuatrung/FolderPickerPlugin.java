package com.trung.nhaccuatrung;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Chọn thư mục nhạc bằng bộ chọn của hệ thống (WebView không hỗ trợ input webkitdirectory).
 * Các file nhạc được chép vào cache của app để JS đọc qua convertFileSrc, xong gọi cleanup().
 */
@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {
    private static final String CACHE_DIR = "folder-upload";

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "onFolderPicked");
    }

    @ActivityCallback
    private void onFolderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        final Uri treeUri = result.getData().getData();
        new Thread(() -> {
            try {
                ContentResolver resolver = getContext().getContentResolver();
                String rootId = DocumentsContract.getTreeDocumentId(treeUri);
                String rootName = rootId.contains(":") ? rootId.substring(rootId.lastIndexOf(':') + 1) : rootId;
                rootName = rootName.contains("/") ? rootName.substring(rootName.lastIndexOf('/') + 1) : rootName;
                if (rootName.isEmpty()) rootName = "Thu muc";

                File outDir = new File(getContext().getCacheDir(), CACHE_DIR);
                deleteRecursive(outDir);
                outDir.mkdirs();

                List<String[]> found = new ArrayList<>(); // {documentId, relativePath}
                walk(resolver, treeUri, rootId, rootName, found);

                JSArray files = new JSArray();
                int index = 0;
                for (String[] item : found) {
                    Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, item[0]);
                    File out = new File(outDir, (index++) + "_" + new File(item[1]).getName());
                    try (InputStream in = resolver.openInputStream(docUri); OutputStream os = new FileOutputStream(out)) {
                        if (in == null) continue;
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        while ((read = in.read(buffer)) != -1) os.write(buffer, 0, read);
                    }
                    JSObject entry = new JSObject();
                    entry.put("path", out.getAbsolutePath());
                    entry.put("relativePath", item[1]);
                    entry.put("name", new File(item[1]).getName());
                    files.put(entry);
                }
                JSObject ret = new JSObject();
                ret.put("name", rootName);
                ret.put("files", files);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Không đọc được thư mục: " + e.getMessage());
            }
        }).start();
    }

    private void walk(ContentResolver resolver, Uri treeUri, String parentId, String parentPath, List<String[]> out) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId);
        String[] projection = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        };
        try (Cursor cursor = resolver.query(children, projection, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String id = cursor.getString(0);
                String name = cursor.getString(1);
                String mime = cursor.getString(2);
                String path = parentPath + "/" + name;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    walk(resolver, treeUri, id, path, out);
                } else if ((mime != null && mime.startsWith("audio/")) || name.toLowerCase(Locale.ROOT).matches(".*\\.(mp3|wav|m4a|ogg|flac|aac)$")) {
                    out.add(new String[] { id, path });
                }
            }
        }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        deleteRecursive(new File(getContext().getCacheDir(), CACHE_DIR));
        call.resolve();
    }

    private void deleteRecursive(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursive(child);
        file.delete();
    }
}
