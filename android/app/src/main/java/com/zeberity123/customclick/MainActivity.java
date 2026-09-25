package com.zeberity123.customclick;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.util.Map;

public final class MainActivity extends Activity {
    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    private WebView web;
    private volatile MetronomeService service;
    private boolean bound;
    private volatile boolean visible;
    private File exportFile;
    private FileOutputStream exportStream;
    private long exportBytes;
    private boolean exportPicker;
    private final ServiceConnection connection = new ServiceConnection() {
        public void onServiceConnected(ComponentName name, IBinder binder) { service = ((MetronomeService.LocalBinder)binder).getService(); }
        public void onServiceDisconnected(ComponentName name) { service = null; }
    };
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        current = new WeakReference<>(this);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        getWindow().setDecorFitsSystemWindows(false);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13,23,24));
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(Color.rgb(13,23,24));
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            int handled = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
            android.graphics.Insets safe = insets.getInsets(handled);
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            // Resize the WebView itself; zero handled insets to avoid double padding.
            return new WindowInsets.Builder(insets)
                .setInsets(handled, android.graphics.Insets.NONE)
                .setInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout(), android.graphics.Insets.NONE)
                .setDisplayCutout(null).build();
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new NativeBridge(), "NativeClick");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                String asset = uri.getPath();
                if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost()) || asset == null || asset.contains("..")) return blocked();
                if (asset.equals("/")) asset = "/index.html";
                String mime = asset.endsWith(".js") ? "application/javascript" : asset.endsWith(".css") ? "text/css" : asset.endsWith(".wav") ? "audio/wav" : asset.endsWith(".svg") ? "image/svg+xml" : asset.endsWith(".png") ? "image/png" : asset.endsWith(".json") ? "application/json" : "text/html";
                try { return new WebResourceResponse(mime, "UTF-8", 200, "OK", Map.of("Cache-Control", "no-store"), getAssets().open("web" + asset)); }
                catch (Exception error) { return blocked(); }
            }
            @Override public void onPageFinished(WebView view, String url) { content.requestApplyInsets(); }
        });
        setContentView(content);
        content.requestApplyInsets();
        bound = bindService(new Intent(this, MetronomeService.class), connection, Context.BIND_AUTO_CREATE);
        web.loadUrl("https://appassets.androidplatform.net/index.html");
    }
    private WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", Map.of(), new ByteArrayInputStream(new byte[0])); }
    public static void emit(String type, JSONObject data) {
        MainActivity activity = current.get();
        if (activity != null && activity.web != null && (activity.visible || type.equals("native-export"))) activity.runOnUiThread(() -> {
            if (activity.web != null && (activity.visible || type.equals("native-export"))) {
                if (type.equals("native-state")) {
                    if (data.optBoolean("playing")) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
                activity.web.evaluateJavascript("window.dispatchEvent(new CustomEvent(" + JSONObject.quote(type) + ",{detail:" + data + "}))", null);
            }
        });
    }
    private final class NativeBridge {
        @JavascriptInterface public void setLanguage(String language) {
            if (!language.equals("en") && !language.equals("ko") && !language.equals("ja")) return;
            getSharedPreferences("ui",0).edit().putString("language",language).apply();
            runOnUiThread(() -> { if (service != null) service.refreshLanguage(); });
        }
        @JavascriptInterface public boolean beginExport() { return beginExportFile(); }
        @JavascriptInterface public boolean appendExport(String base64) { return appendExportFile(base64); }
        @JavascriptInterface public void cancelExport() { cancelExportFile(); }
        @JavascriptInterface public boolean finishExport(String filename) {
            synchronized (MainActivity.this) {
                if (exportFile == null || exportStream == null || exportBytes == 0 || exportPicker) return false;
                try { exportStream.close(); exportStream = null; } catch (Exception error) { cancelExportFile(); return false; }
                exportPicker = true;
            }
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("audio/mpeg");
                    intent.putExtra(Intent.EXTRA_TITLE, filename.matches("Click-[0-9]{1,3}bpm\\.mp3") ? filename : "Click.mp3");
                    startActivityForResult(intent, 42);
                } catch (Exception error) { cancelExportFile(); exportResult(false,false); }
            });
            return true;
        }
        @JavascriptInterface public boolean ready() { return service != null; }
        @JavascriptInterface public double clock() { return System.nanoTime() / 1e9; }
        @JavascriptInterface public String snapshot() { return service == null ? "{}" : service.snapshot().toString(); }
        @JavascriptInterface public void configure(String json) { if (service != null) service.configure(json); }
        @JavascriptInterface public void command(String type, boolean high) {
            runOnUiThread(() -> {
                if (service == null) return;
                switch(type) {
                    case "start" -> {
                        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && !getPreferences(0).getBoolean("askedNotification", false)) {
                            getPreferences(0).edit().putBoolean("askedNotification", true).apply();
                            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                        }
                        startForegroundService(new Intent(MainActivity.this, MetronomeService.class).setAction(MetronomeService.PLAY));
                    }
                    case "pause" -> service.pause();
                    case "reset" -> service.reset();
                    case "preview" -> service.preview(high);
                }
            });
        }
    }
    private synchronized boolean beginExportFile() {
        if (exportPicker) return false;
        cancelExportFile();
        try { exportFile = File.createTempFile("click-export-", ".mp3", getCacheDir()); exportStream = new FileOutputStream(exportFile); return true; }
        catch (Exception error) { cancelExportFile(); return false; }
    }
    private synchronized boolean appendExportFile(String base64) {
        if (exportStream == null || base64.length() > 45000) return false;
        try {
            byte[] bytes = android.util.Base64.decode(base64,android.util.Base64.NO_WRAP);
            exportBytes += bytes.length;
            if (exportBytes > 90_000_000) { cancelExportFile(); return false; }
            exportStream.write(bytes); return true;
        } catch (Exception error) { cancelExportFile(); return false; }
    }
    private synchronized void cancelExportFile() {
        try { if (exportStream != null) exportStream.close(); } catch (Exception ignored) { }
        exportStream = null;
        if (exportFile != null) exportFile.delete();
        exportFile = null; exportBytes = 0; exportPicker = false;
    }
    private void exportResult(boolean saved, boolean cancelled) {
        JSONObject result = new JSONObject();
        try { result.put("saved",saved).put("cancelled",cancelled); } catch (Exception ignored) { }
        emit("native-export", result);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode != 42) return;
        final File source;
        synchronized (this) { source = exportFile; exportFile = null; exportPicker = false; }
        if (resultCode != RESULT_OK || data == null || data.getData() == null || source == null) {
            if (source != null) source.delete();
            exportResult(false,true); return;
        }
        final android.net.Uri destination = data.getData();
        new Thread(() -> {
            boolean saved = false;
            try (FileInputStream input = new FileInputStream(source); OutputStream output = getContentResolver().openOutputStream(destination,"w")) {
                if (output == null) throw new java.io.IOException("No file output");
                byte[] bytes = new byte[32768]; int read;
                while ((read = input.read(bytes)) != -1) output.write(bytes,0,read);
                saved = true;
            } catch (Exception ignored) { }
            finally { source.delete(); }
            exportResult(saved,false);
        }, "Click-Export").start();
    }
    @Override protected void onResume() { super.onResume(); visible = true; current = new WeakReference<>(this); if (web != null) { web.onResume(); if (service != null) emit("native-state", service.snapshot()); } }
    @Override protected void onPause() { visible = false; super.onPause(); }
    @Override protected void onDestroy() {
        cancelExportFile();
        if (current.get() == this) current.clear();
        if (bound) unbindService(connection);
        service = null;
        if (web != null) { web.removeJavascriptInterface("NativeClick"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
