package org.redtf.app;

import android.os.Build;
import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Системный жест «Назад» для WebView. Предиктивный «Назад» (Android 14+) отдаёт приложению ход жеста,
 * а WebView сам его в JS не пробрасывает: плагин шлёт события, по которым страница рисует свой переход.
 * Это единственный обработчик «Назад»: `disableBackButtonHandler` у @capacitor/app включён.
 *
 * События: backStarted и backProgressed ({ edge, touchX, progress }), backCancelled, backInvoked.
 * До Android 14 приходит только backInvoked.
 */
@CapacitorPlugin(name = "NativeBack")
public class NativeBackPlugin extends Plugin {

    private OnBackPressedCallback callback;

    @Override
    public void load() {
        callback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackStarted(@NonNull BackEventCompat backEvent) {
                emit("backStarted", backEvent);
            }

            @Override
            public void handleOnBackProgressed(@NonNull BackEventCompat backEvent) {
                emit("backProgressed", backEvent);
            }

            @Override
            public void handleOnBackCancelled() {
                notifyListeners("backCancelled", new JSObject());
            }

            @Override
            public void handleOnBackPressed() {
                notifyListeners("backInvoked", new JSObject());
            }
        };
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), callback);
    }

    private void emit(String event, BackEventCompat backEvent) {
        JSObject data = new JSObject();
        data.put("edge", backEvent.getSwipeEdge() == BackEventCompat.EDGE_RIGHT ? "right" : "left");
        data.put("touchX", (double) backEvent.getTouchX());
        data.put("progress", (double) backEvent.getProgress());
        notifyListeners(event, data);
    }

    /**
     * Страница отключает перехват, когда закрывать нечего: «Назад» достаётся системе, и она показывает свою
     * анимацию (на главный экран). До Android 13 такой анимации нет, а корневая activity закрылась бы вместо
     * сворачивания, поэтому там перехват остаётся включённым.
     */
    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true)) || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU;
        getActivity().runOnUiThread(() -> callback.setEnabled(enabled));
        call.resolve();
    }
}
