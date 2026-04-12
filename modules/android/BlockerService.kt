// BlockerService.kt
// Foreground service that polls UsageStatsManager every second.
// If the current foreground app is in the blocked list, it broadcasts
// SHOW_SHIELD so BlockerModule can forward the event to React Native.

package com.franciccio.presence

import android.app.*
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class BlockerService : Service() {

    private val CHANNEL_ID = "presence_blocker_channel"
    private val NOTIFICATION_ID = 8001

    private var blockedApps: List<String> = emptyList()
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Throttle: only re-broadcast the shield at most once every 2 seconds
    private var lastShieldBroadcast = 0L

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        blockedApps = intent?.getStringArrayListExtra("blockedApps") ?: emptyList()
        startForeground(NOTIFICATION_ID, buildNotification())

        serviceScope.cancel()
        serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        serviceScope.launch {
            while (isActive) {
                checkForegroundApp()
                delay(1_000)
            }
        }

        return START_STICKY
    }

    private fun checkForegroundApp() {
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 5_000, now)
        val foreground = stats?.maxByOrNull { it.lastTimeUsed }?.packageName ?: return

        if (blockedApps.any { it == foreground } && now - lastShieldBroadcast > 2_000) {
            lastShieldBroadcast = now
            sendBroadcast(Intent(BlockerModule.SHIELD_ACTION))
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Presence Shield",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the Presence focus shield running in the background."
                setShowBadge(false)
            }
            (getSystemService(NotificationManager::class.java))
                .createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val tapIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pending = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Presence is active")
            .setContentText("Your focus shield is running.")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pending)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
