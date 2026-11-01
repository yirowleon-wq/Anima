package studio.anima.location;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;

/** A visible permission entry point. It never starts itself after a reboot. */
public final class BridgeActivity extends Activity {
    private String session = "";
    private String workoutId = "";
    private boolean simulated;
    private boolean motionPermissionAsked;
    private TextView message;
    @Override public void onCreate(Bundle state) { super.onCreate(state); show(getIntent()); }
    @Override public void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); show(intent); }
    private void show(Intent intent) {
        session = intent.getStringExtra("session");
        motionPermissionAsked = false;
        if (session == null || !session.matches("[a-f0-9-]{36}")) session = "";
        workoutId = intent.getStringExtra("workoutId");
        if (workoutId == null || !workoutId.matches("[a-f0-9-]{36}")) workoutId = "";
        simulated = intent.getBooleanExtra("simulated", false);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(36, 56, 36, 36);
        message = new TextView(this); message.setTextSize(20); layout.addView(message);
        Button start = new Button(this); start.setText("Allow location for this workout"); layout.addView(start);
        Button stop = new Button(this); stop.setText("Stop reading location"); layout.addView(stop); setContentView(layout);
        start.setOnClickListener(view -> requestLocation());
        stop.setOnClickListener(view -> { BridgeState.stop(this, session, workoutId); message.setText(BridgeState.active(this, session) ? "The device has not confirmed stopping. Reconnect and try again." : "Location reading has stopped."); });
        if (session.isEmpty() || workoutId.isEmpty()) { message.setText("Start this workout in desktop Anima, then allow this device to share its location. Positions are sent only through the authorized local debugging connection."); start.setEnabled(false); }
        else if (BridgeState.cancelled(this, session)) { message.setText("This location request has stopped. Start a new request from the desktop before continuing."); start.setEnabled(false); }
        else if (!BridgeState.preferences(this).getString("session", "").isEmpty() && !BridgeState.owns(this, session, workoutId)) { message.setText("Another location session is active on this device. Stop it from its original workout before starting this one."); start.setEnabled(false); }
        else {
            BridgeState.preferences(this).edit().putString("session", session).putString("workoutId", workoutId).commit();
            if (LocationService.subscriptionCount(session) > 0) {
                message.setText("Location reading is already active for this workout. Tap Stop to end it.");
                start.setEnabled(false);
            } else {
                BridgeState.write(this, session, "starting", "Waiting for your explicit choice to use location for this workout.", new JSONArray());
                message.setText("This workout can use this device’s location. Tap Allow to begin. Stopping the workout ends reading; simulator positions remain marked as simulated.");
            }
            // A desktop request identifies the session; the visible Allow button
            // is still required before requesting permission or starting sampling.
        }
    }
    private void requestLocation() {
        if (!BridgeState.active(this, session)) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) begin();
        else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (!BridgeState.active(this, session)) return;
        if (code == 2) { begin(); return; }
        if (code != 1) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) begin();
        else { message.setText("Location permission was not granted. No positions will be sampled. You can still choose a starting point manually on the desktop map."); BridgeState.write(this, session, "denied", "Android has not granted location access.", new JSONArray()); }
    }
    private void begin() {
        if (!BridgeState.active(this, session)) return;
        SensorManager sensors = getSystemService(SensorManager.class);
        boolean hasSteps = sensors != null && (sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null || sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null);
        if (Build.VERSION.SDK_INT >= 29 && hasSteps && !motionPermissionAsked && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            motionPermissionAsked = true;
            message.setText("This device has a step sensor. Optional physical activity permission allows cadence observations; location can continue without it.");
            requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, 2); return;
        }
        Intent intent = new Intent(this, LocationService.class); intent.putExtra("session", session); intent.putExtra("workoutId", workoutId); intent.putExtra("simulated", simulated);
        try { startForegroundService(intent); message.setText("Reading location for this workout. You can return to the desktop; stopping the workout or tapping Stop ends reading."); }
        catch (Exception error) { BridgeState.write(this, session, "unavailable", "Android cannot start this location session right now. Keep this page visible and try again.", new JSONArray()); }
    }
}
