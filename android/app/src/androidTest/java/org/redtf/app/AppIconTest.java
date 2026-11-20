package org.redtf.app;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppIconTest {
	@Test
	public void switchingIconsKeepsOneLauncherAndHandlesLinks() {
		Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
		String pkg = context.getPackageName();
		Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(pkg);
		Intent link = new Intent(Intent.ACTION_VIEW, Uri.parse("https://dtf.ru/")).setPackage(pkg);
		String previous = context.getPackageManager().queryIntentActivities(launcher, 0).get(0).activityInfo.name;
		try {
			for (String name : new String[]{"bluer", "white", "white", "default"}) {
				AppIconPlugin.select(context, name);
				List<ResolveInfo> entries = context.getPackageManager().queryIntentActivities(launcher, 0);
				assertEquals(1, entries.size());
				assertEquals(pkg + ".launcher." + name, entries.get(0).activityInfo.name);
				assertEquals(MainActivity.class.getName(), entries.get(0).activityInfo.targetActivity);
				assertEquals(MainActivity.class.getName(), link.resolveActivity(context.getPackageManager()).getClassName());
			}
		} finally {
			AppIconPlugin.select(context, previous.substring((pkg + ".launcher.").length()));
		}
	}
}
