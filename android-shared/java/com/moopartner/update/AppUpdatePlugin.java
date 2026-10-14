package com.moopartner.update;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

// Self-update for builds installed outside the Play Store: downloads the latest APK from our
// server into the app's cache and hands it to Android's installer.
// Shared by the partner app (android/) and the admin app (admin-app/android/): both add this
// folder to their sources in app/build.gradle and register the plugin in MainActivity.
// Only one APK is ever kept (cache/updates/update.apk), and it is deleted as soon as it is not
// newer than the installed app, so after an update the old file is gone on the next start.
// An APK that is not this app, or not newer than the installed version, is never installed.
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private File dir() {
        return new File(getContext().getCacheDir(), "updates");
    }

    private File apk() {
        return new File(dir(), "update.apk");
    }

    private long installedCode() throws PackageManager.NameNotFoundException {
        PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    // Version code of a downloaded APK, or -1 when it is unreadable or belongs to another app.
    private long apkCode(File f) {
        if (!f.exists()) return -1;
        PackageInfo p = getContext().getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
        if (p == null || !getContext().getPackageName().equals(p.packageName)) return -1;
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    // True when the file is this app and newer than what is installed.
    private boolean isNewer(File f) {
        try {
            return apkCode(f) > installedCode();
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private static void deleteAll(File d) {
        File[] files = d.listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    // Installed version, for apps without @capacitor/app (the admin shell).
    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject res = new JSObject();
            res.put("versionCode", installedCode());
            res.put("versionName", p.versionName);
            call.resolve(res);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("unknown");
        }
    }

    // Called on every app start: removes the APK left over from an install that already happened
    // (or any stale/partial file). Keeps it only while it is still a pending newer version.
    @PluginMethod
    public void cleanup(PluginCall call) {
        File f = apk();
        boolean keep = isNewer(f);
        if (!keep) deleteAll(dir());
        JSObject res = new JSObject();
        res.put("pending", keep);
        call.resolve(res);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String expected = call.getString("sha256", "");
        if (url == null) {
            call.reject("url required");
            return;
        }
        new Thread(() -> {
            File d = dir();
            File f = apk();
            File part = new File(d, "update.apk.part");
            try {
                // Already downloaded (e.g. the install screen was closed): reuse it.
                if (isNewer(f) && (expected.isEmpty() || expected.equalsIgnoreCase(sha256(f)))) {
                    call.resolve();
                    return;
                }
                d.mkdirs();
                deleteAll(d);

                HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
                con.setConnectTimeout(15000);
                con.setReadTimeout(30000);
                if (con.getResponseCode() != 200) throw new Exception("http_" + con.getResponseCode());
                long total = con.getContentLengthLong();
                try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int last = -1;
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) {
                            last = pct;
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            notifyListeners("progress", p);
                        }
                    }
                } finally {
                    con.disconnect();
                }

                if (!expected.isEmpty() && !expected.equalsIgnoreCase(sha256(part))) throw new Exception("bad_checksum");
                if (!part.renameTo(f)) throw new Exception("save_failed");
                if (!isNewer(f)) throw new Exception("not_newer");
                call.resolve();
            } catch (Exception e) {
                deleteAll(d);
                call.reject(e.getMessage() == null ? "download_failed" : e.getMessage());
            }
        }).start();
    }

    // Opens Android's installer for the downloaded APK. Resolves { status: "permission" } when the
    // user first has to allow "Install unknown apps" for this app (the settings screen is opened).
    @PluginMethod
    public void install(PluginCall call) {
        File f = apk();
        if (!isNewer(f)) {
            deleteAll(dir());
            call.reject("not_newer");
            return;
        }
        JSObject res = new JSObject();
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(s);
            res.put("status", "permission");
            call.resolve(res);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(i);
        res.put("status", "installing");
        call.resolve(res);
    }
}
