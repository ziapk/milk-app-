package com.doodhhisaab.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.moopartner.update.AppUpdatePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceSettingsPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
