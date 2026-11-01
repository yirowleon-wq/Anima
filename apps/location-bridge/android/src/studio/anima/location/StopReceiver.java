package studio.anima.location;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** External calls require Android's DUMP permission (the authorized adb shell). */
public final class StopReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String session = intent.getStringExtra("session");
        String workoutId = intent.getStringExtra("workoutId");
        if (session == null || workoutId == null) return;
        if ("studio.anima.location.KEEPALIVE".equals(intent.getAction()) && BridgeState.owns(context, session, workoutId)) LocationService.renewLease(session);
        else if ("studio.anima.location.STOP".equals(intent.getAction()) || intent.getAction() == null) BridgeState.stop(context, session, workoutId);
    }
}
