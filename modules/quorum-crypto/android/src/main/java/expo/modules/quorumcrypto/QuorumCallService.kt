package expo.modules.quorumcrypto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps a Quorum voice/video call alive while
 * the app is backgrounded.
 *
 * Without this, Android suspends the JS thread and severs the
 * microphone/WebRTC pipeline within seconds of the app losing
 * foreground, killing any active call. Starting `startForeground` with
 * a persistent notification and `FOREGROUND_SERVICE_TYPE_MICROPHONE`
 * tells the OS "this app is doing user-attributable real-time audio,
 * keep it running."
 *
 * Lifecycle is driven by JS: SpaceCallContext / CallContext call
 * `startCallService` on transition to connected and `stopCallService`
 * on hangup. The service is intentionally NOT sticky — if the system
 * kills it under memory pressure we don't try to restart it because by
 * then the WebRTC peer connection is dead too and a restarted service
 * would just be a phantom notification.
 *
 * Notification UX: title "In a Quorum call", subtitle with the
 * caller/space name supplied by JS, a chronometer counting up. Tap
 * launches the main activity, which still has the call surface mounted
 * (CallOverlay / SpaceCallOverlay) so the user lands back on the
 * appropriate call screen.
 */
class QuorumCallService : Service() {
    companion object {
        const val ONGOING_CHANNEL_ID = "ongoing_calls"
        const val ONGOING_NOTIFICATION_ID = 9002
        const val EXTRA_DISPLAY_NAME = "displayName"
        const val EXTRA_HAS_VIDEO = "hasVideo"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureOngoingChannel()
        val displayName = intent?.getStringExtra(EXTRA_DISPLAY_NAME) ?: "Quorum call"
        val hasVideo = intent?.getBooleanExtra(EXTRA_HAS_VIDEO, false) ?: false
        val notification = buildNotification(displayName, hasVideo)

        // Promote to foreground BEFORE any work — Android 12+ requires
        // startForeground within 5 seconds of startForegroundService or
        // it'll ANR and OOM-kill us with RemoteServiceException.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                ONGOING_NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(ONGOING_NOTIFICATION_ID, notification)
        }

        // NOT sticky — if the system kills this service due to memory
        // pressure, the WebRTC pipeline is dead too and there's no
        // point relaunching the service in isolation (it'd just be a
        // notification with nothing behind it).
        return START_NOT_STICKY
    }

    private fun ensureOngoingChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(ONGOING_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    ONGOING_CHANNEL_ID,
                    "Ongoing calls",
                    // LOW so the notification doesn't ding/buzz —
                    // it's strictly informational/lifecycle.
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Persistent indicator while a voice or video call is active"
                    setSound(null, null)
                    setShowBadge(false)
                    enableVibration(false)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    private fun buildNotification(displayName: String, hasVideo: Boolean): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val tapPending = if (launchIntent != null) {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else {
            null
        }

        val callType = if (hasVideo) "video call" else "call"

        return NotificationCompat.Builder(this, ONGOING_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle("In a Quorum $callType")
            .setContentText(displayName)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            // Show elapsed time so the user can see the call is live.
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis())
            .apply {
                if (tapPending != null) setContentIntent(tapPending)
            }
            .build()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        super.onDestroy()
    }
}
