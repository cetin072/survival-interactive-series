package com.cetin072.survivalbag;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BagReminderSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
