package com.moopartner.admin;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.moopartner.update.AppUpdatePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
