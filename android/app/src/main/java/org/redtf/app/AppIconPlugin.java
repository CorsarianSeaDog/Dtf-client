package org.redtf.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.List;

@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
	private static final List<String> ICONS = Arrays.asList("default", "bluer", "white");

	@PluginMethod
	public void change(PluginCall call) {
		String name = call.getString("name");
		if (!ICONS.contains(name)) {
			call.reject("Неизвестная иконка приложения");
			return;
		}
		try {
			select(getContext(), name);
			call.resolve();
		} catch (RuntimeException error) {
			call.reject("Не удалось сменить иконку приложения", error);
		}
	}

	static void select(Context context, String name) {
		// Сначала включаем новый ярлык, чтобы у приложения всегда была точка запуска.
		setEnabled(context, name, true);
		for (String other : ICONS) {
			if (!other.equals(name)) setEnabled(context, other, false);
		}
	}

	private static void setEnabled(Context context, String name, boolean enabled) {
		String packageName = context.getPackageName();
		ComponentName alias = new ComponentName(packageName, packageName + ".launcher." + name);
		PackageManager pm = context.getPackageManager();
		int state = pm.getComponentEnabledSetting(alias);
		boolean active = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
			|| (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && name.equals("default"));
		if (active != enabled) {
			pm.setComponentEnabledSetting(alias, enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
				: PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
		}
	}
}
