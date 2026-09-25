package com.zeberity123.customclick;

import android.app.Activity;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.provider.Settings;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** GitHub downloads stay outside the WebView and only verified APKs reach the installer. */
public final class UpdateManager {
    private static final String REPO = "zeberity123/custom_click";
    private static UpdateManager instance;
    private final Context context;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String status = "idle", error = "", version = "", url = "", hash = "";
    private long size;
    private int progress;
    public static synchronized UpdateManager get(Context context) {
        if (instance == null) instance = new UpdateManager(context.getApplicationContext());
        return instance;
    }
    private UpdateManager(Context context) { this.context = context; }
    public synchronized String snapshot() {
        JSONObject json = new JSONObject();
        try { json.put("status",status).put("current",BuildConfig.VERSION_NAME).put("platform","android").put("version",version).put("progress",progress).put("error",error); } catch (JSONException ignored) {}
        return json.toString();
    }
    private synchronized void state(String next) { status = next; }
    private synchronized void fail(Exception failure) {
        String message = failure.getMessage();
        error = List.of("release","integrity","rate","install","signature").contains(message == null ? "" : message) ? message : "network";
        status = "error";
    }
    public synchronized void action(String command, Activity activity) {
        if (List.of("checking","downloading","installing").contains(status)) return;
        if (command.equals("check")) {
            status = "checking"; error = "";
            worker.execute(() -> { try { check(); } catch (Exception failure) { fail(failure); } });
        } else if (command.equals("download") && status.equals("available")) {
            status = "downloading"; progress = 0;
            worker.execute(() -> { try { download(); } catch (Exception failure) { fail(failure); } });
        } else if (command.equals("install") && (status.equals("ready") || status.equals("permission"))) {
            status = "installing";
            // Recheck the file and signing identity off the UI thread before handing it to Android.
            worker.execute(() -> {
                try {
                    verify(apk());
                    activity.runOnUiThread(() -> install(activity));
                } catch (Exception failure) { fail(failure); }
            });
        }
    }
    private File apk() { return new File(context.getCacheDir(), "click-update.apk"); }
    private static int[] parts(String version) throws IOException {
        if (!version.matches("[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}")) throw new IOException("release");
        return Arrays.stream(version.split("\\.")).mapToInt(Integer::parseInt).toArray();
    }
    private static boolean newer(String next, String current) throws IOException {
        int[] a = parts(next), b = parts(current);
        for (int i=0;i<3;i++) if (a[i]!=b[i]) return a[i]>b[i];
        return false;
    }
    private static HttpURLConnection connection(String address) throws Exception {
        for (int count=0;count<6;count++) {
            URL link = new URL(address);
            if (!link.getProtocol().equals("https") || link.getUserInfo()!=null || (link.getPort()!=-1 && link.getPort()!=443) ||
                !List.of("api.github.com","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(link.getHost())) throw new IOException("release");
            HttpURLConnection connection = (HttpURLConnection)link.openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent","Custom-Click-Updater");
            int code = connection.getResponseCode();
            if (code==301 || code==302 || code==303 || code==307 || code==308) {
                String location=connection.getHeaderField("Location"); connection.disconnect();
                if (location==null) throw new IOException("network");
                address=new URL(link,location).toString(); continue;
            }
            if (code!=200) { connection.disconnect(); throw new IOException(code==403 || code==429 ? "rate" : "network"); }
            return connection;
        }
        throw new IOException("network");
    }
    private void check() throws Exception {
        HttpURLConnection connection=connection("https://api.github.com/repos/"+REPO+"/releases/latest");
        JSONObject release;
        try (InputStream input=connection.getInputStream(); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[32768]; int read;
            while ((read=input.read(buffer))!=-1) { if (output.size()+read>2_000_000) throw new IOException("release"); output.write(buffer,0,read); }
            release=new JSONObject(output.toString("UTF-8"));
        } finally { connection.disconnect(); }
        String next=release.getString("tag_name").replaceFirst("^v", "");
        if (release.optBoolean("draft") || release.optBoolean("prerelease")) throw new IOException("release");
        if (!newer(next,BuildConfig.VERSION_NAME)) { state("current"); return; }
        String name="Custom-Click-"+next+"-android.apk";
        JSONArray assets=release.getJSONArray("assets");
        for (int i=0;i<assets.length();i++) {
            JSONObject asset=assets.getJSONObject(i);
            if (!asset.optString("name").equals(name)) continue;
            String address="https://github.com/"+REPO+"/releases/download/v"+next+"/"+name;
            String digest=asset.optString("digest"); long bytes=asset.optLong("size");
            if (!asset.optString("state").equals("uploaded") || !asset.optString("browser_download_url").equals(address) ||
                !digest.matches("sha256:[a-f0-9]{64}") || bytes<1 || bytes>100_000_000) throw new IOException("release");
            synchronized (this) { version=next;url=address;hash=digest.substring(7);size=bytes;status="available"; }
            return;
        }
        throw new IOException("release");
    }
    private void download() throws Exception {
        File temporary=new File(context.getCacheDir(),"click-update.part");
        HttpURLConnection connection=connection(url);
        try {
            try (InputStream input=connection.getInputStream(); FileOutputStream output=new FileOutputStream(temporary)) {
                byte[] buffer=new byte[32768]; long total=0; int read;
                while ((read=input.read(buffer))!=-1) {
                    total+=read; if(total>size) throw new IOException("integrity");
                    output.write(buffer,0,read);
                    synchronized(this) { progress=(int)(total*100/size); }
                }
                if(total!=size) throw new IOException("integrity");
            }
            verify(temporary);
            if (apk().exists() && !apk().delete()) throw new IOException("install");
            if (!temporary.renameTo(apk())) throw new IOException("install");
            state("ready");
        } finally { connection.disconnect(); temporary.delete(); }
    }
    private void verify(File file) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream input=new FileInputStream(file)) {
            byte[] buffer=new byte[32768]; int read;
            while((read=input.read(buffer))!=-1) digest.update(buffer,0,read);
        }
        StringBuilder actual=new StringBuilder(); for(byte value:digest.digest()) actual.append(String.format(Locale.ROOT,"%02x",value & 255));
        if(file.length()!=size || !actual.toString().equals(hash)) throw new IOException("integrity");
        PackageManager pm=context.getPackageManager();
        PackageInfo candidate=pm.getPackageArchiveInfo(file.getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo installed=pm.getPackageInfo(context.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES);
        if(candidate==null || !context.getPackageName().equals(candidate.packageName) || !version.equals(candidate.versionName) || candidate.getLongVersionCode()<=installed.getLongVersionCode() || candidate.signingInfo==null) throw new IOException("signature");
        Set<String> expected=new HashSet<>(), found=new HashSet<>();
        for(Signature signature:installed.signingInfo.getApkContentsSigners()) expected.add(signature.toCharsString());
        for(Signature signature:candidate.signingInfo.getApkContentsSigners()) found.add(signature.toCharsString());
        if(!expected.equals(found)) throw new IOException("signature");
    }
    private void install(Activity activity) {
        try {
            if (!context.getPackageManager().canRequestPackageInstalls()) {
                state("permission");
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+context.getPackageName())));
                return;
            }
            Uri uri=Uri.parse("content://"+context.getPackageName()+".updates/update.apk");
            activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
            state("ready"); // The user can cancel Android's confirmation and retry.
        } catch(Exception failure) { fail(new IOException("install")); }
    }
}
