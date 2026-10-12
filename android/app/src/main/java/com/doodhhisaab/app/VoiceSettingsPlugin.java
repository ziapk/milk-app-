package com.doodhhisaab.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Opens the closest available screen for downloading offline speech languages.
// Google's voice settings page is internal (it can move between app versions), so fall back
// to Android's standard Voice input settings, then to the main Settings app.
@CapacitorPlugin(name = "VoiceSettings")
public class VoiceSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        Intent google = new Intent(Intent.ACTION_MAIN).setComponent(new ComponentName(
            "com.google.android.googlequicksearchbox",
            "com.google.android.apps.gsa.settingsui.VoiceSearchPreferences"
        ));
        Intent[] tries = {
            google,
            new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS),
            new Intent(Settings.ACTION_SETTINGS),
        };
        String[] names = { "google", "voice_input", "settings" };
        for (int i = 0; i < tries.length; i++) {
            try {
                getActivity().startActivity(tries[i].addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                JSObject res = new JSObject();
                res.put("opened", names[i]);
                call.resolve(res);
                return;
            } catch (ActivityNotFoundException | SecurityException e) {
                // try the next screen
            }
        }
        call.reject("No settings screen available");
    }
}
