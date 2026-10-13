package com.cetin072.survivalbag;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.app.Activity;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BagReminderSettings")
public class BagReminderSettingsPlugin extends Plugin {
    @PluginMethod
    public void openKnowledge(PluginCall call) {
        String path = call.getString("path", "");
        if (!path.startsWith("/knowledge/") || path.contains("..") || path.contains("\\")) {
            call.reject("지식 경로가 올바르지 않습니다."); return;
        }
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://survival-diary-archive.netlify.app" + path)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception error) { call.reject("지식 페이지를 열지 못했습니다.", error); }
    }
    @PluginMethod
    public void exportJson(PluginCall call) {
        String name = call.getString("name");
        String content = call.getString("content");
        if (name == null || !name.matches("[A-Za-z0-9_-]+\\.json") || content == null || content.length() > 1048576) {
            call.reject("백업 파일 형식이 올바르지 않습니다."); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "onExportJson");
    }
    @ActivityCallback
    private void onExportJson(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("백업 저장을 취소했습니다. 기존 가방은 유지됩니다."); return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
            if (out == null) throw new java.io.IOException("No writable document");
            out.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
            out.flush();
            call.resolve();
        } catch (Exception error) { call.reject("백업 파일을 저장하지 못했습니다.", error); }
    }
    @PluginMethod
    public void open(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) { call.reject("알림 설정을 열지 못했습니다.", error); }
    }
}
