package org.redtf.app;

import android.content.Intent;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Обновление APK внутри приложения: скачивает файл в кеш с прогрессом (событие `progress`),
 * проверяет разрешение «Установка неизвестных приложений» и открывает системный установщик.
 * Файлы лежат в `cache/updates`, который уже открыт через FileProvider (`file_paths.xml`).
 */
@CapacitorPlugin(name = "NativeInstaller")
public class NativeInstallerPlugin extends Plugin {

    private static final String DIR = "updates";
    private static final int MAX_REDIRECTS = 5;

    private volatile boolean cancelled;
    private volatile Thread worker;

    private File dir() {
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /** Только имя файла: путь из JS не должен выходить из `cache/updates` */
    private File file(String name) {
        return new File(dir(), new File(name).getName());
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", canInstall());
        call.resolve(ret);
    }

    /** Экран разрешения установки для этого приложения. После возврата страница сама повторяет установку */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Не удалось открыть настройки: " + e.getMessage());
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "redtf.apk");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Некорректный адрес файла");
            return;
        }
        if (worker != null && worker.isAlive()) {
            call.reject("Загрузка уже идёт");
            return;
        }

        cancelled = false;
        File target = file(filename);
        File part = new File(target.getPath() + ".part");
        worker = new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                // Релизы GitHub отдают файл через редирект на другой домен: HttpURLConnection сам их не всегда проходит
                String current = url;
                for (int i = 0; ; i++) {
                    conn = (HttpURLConnection) new URL(current).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    int code = conn.getResponseCode();
                    if (code >= 300 && code < 400 && i < MAX_REDIRECTS) {
                        String next = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (next == null || !next.startsWith("https://")) throw new Exception("Некорректное перенаправление");
                        current = next;
                        continue;
                    }
                    if (code != 200) throw new Exception("Сервер ответил " + code);
                    break;
                }

                long total = conn.getContentLengthLong();
                long loaded = 0;
                long lastEmit = 0;
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (cancelled) throw new InterruptedException();
                        out.write(buf, 0, n);
                        loaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit >= 150) {
                            lastEmit = now;
                            emitProgress(loaded, total);
                        }
                    }
                }
                emitProgress(loaded, total);
                if (target.exists()) target.delete();
                if (!part.renameTo(target)) throw new Exception("Не удалось сохранить файл");
                call.resolve();
            } catch (InterruptedException e) {
                part.delete();
                call.reject("cancelled");
            } catch (Exception e) {
                part.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Ошибка загрузки");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "redtf-apk-download");
        worker.start();
    }

    private void emitProgress(long loaded, long total) {
        JSObject data = new JSObject();
        data.put("loaded", loaded);
        data.put("total", total);
        notifyListeners("progress", data);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    /** Открывает системный установщик. Если разрешения нет, отвечает `needsPermission`, а экран настроек открывает страница */
    @PluginMethod
    public void install(PluginCall call) {
        File apk = file(call.getString("filename", "redtf.apk"));
        if (!apk.exists()) {
            call.reject("Файл обновления не найден");
            return;
        }
        if (!canInstall()) {
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("Не удалось открыть установщик: " + e.getMessage());
        }
    }

    /** Удаляет скачанные ранее файлы: после установки новой сборки они не нужны */
    @PluginMethod
    public void cleanup(PluginCall call) {
        File[] files = dir().listFiles();
        if (files != null) {
            for (File f : files) f.delete();
        }
        call.resolve();
    }
}
