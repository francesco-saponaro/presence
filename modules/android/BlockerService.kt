// BlockerService.kt
// Foreground service that polls UsageStatsManager every second.
// When a blocked app is in the foreground:
//   1. Shows a native full-screen overlay via SYSTEM_ALERT_WINDOW (TYPE_APPLICATION_OVERLAY)
//   2. Broadcasts SHIELD_ACTION so the JS layer can sync isBlocked state
// When a non-blocked app is in the foreground the overlay is hidden automatically.
// On service destroy (stopBlocker() called from JS after OCR success) the overlay is removed.

package com.franciccio.presence

import android.app.*
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class BlockerService : Service() {

    private val CHANNEL_ID      = "presence_blocker_channel"
    private val NOTIFICATION_ID = 8001
    private val mainHandler     = Handler(Looper.getMainLooper())

    private var blockedApps: List<String> = emptyList()
    private var serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Throttle: only re-broadcast the JS event at most once every 2 seconds
    private var lastShieldBroadcast = 0L

    // Overlay state — all mutations happen on the main thread
    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    @Volatile private var isOverlayShowing = false

    // ── Lifecycle ────────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        blockedApps = intent?.getStringArrayListExtra("blockedApps") ?: emptyList()
        startForeground(NOTIFICATION_ID, buildNotification())

        // Restart the polling loop in case onStartCommand is called again
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

    override fun onDestroy() {
        serviceScope.cancel()
        hideOverlay()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Foreground app detection ─────────────────────────────────────────────────

    private fun checkForegroundApp() {
        val usm   = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now   = System.currentTimeMillis()
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 5_000, now)
        val foreground = stats?.maxByOrNull { it.lastTimeUsed }?.packageName ?: return

        val isBlockedApp = blockedApps.any { it == foreground }

        if (isBlockedApp) {
            showOverlay()
            // Notify JS layer (throttled) so isBlocked state stays in sync
            if (now - lastShieldBroadcast > 2_000) {
                lastShieldBroadcast = now
                sendBroadcast(Intent(BlockerModule.SHIELD_ACTION))
            }
        } else {
            // Any non-blocked app (including Presence itself) hides the overlay
            hideOverlay()
        }
    }

    // ── Overlay management ───────────────────────────────────────────────────────

    private fun showOverlay() {
        if (isOverlayShowing) return
        // Graceful degradation: if the permission wasn't granted, skip the overlay
        // (the JS broadcast still fires so the home screen shows the blocked state)
        if (!Settings.canDrawOverlays(this)) return

        val view = buildOverlayView()

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            // FLAG_LAYOUT_IN_SCREEN extends the view under status/nav bars.
            // Without FLAG_NOT_FOCUSABLE the overlay receives touch & key events
            // — back key does nothing (no handler), home key is always system-handled.
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.OPAQUE
        )

        mainHandler.post {
            if (isOverlayShowing) return@post          // double-check on UI thread
            try {
                windowManager.addView(view, params)
                overlayView = view
                isOverlayShowing = true
            } catch (_: Exception) { /* already added or context gone */ }
        }
    }

    private fun hideOverlay() {
        if (!isOverlayShowing) return
        mainHandler.post {
            try {
                overlayView?.let { windowManager.removeView(it) }
            } catch (_: Exception) {}
            overlayView = null
            isOverlayShowing = false
        }
    }

    // ── Overlay UI (fully programmatic — Cappuccino dark palette) ────────────────

    private fun buildOverlayView(): View {
        val dp = resources.displayMetrics.density

        fun dpToPx(dp: Int) = (dp * this.dp).toInt()

        // Root — full-screen dark espresso background
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#261B10"))
            val pad = dpToPx(40)
            setPadding(pad, pad, pad, pad)
        }

        // "Presence" wordmark
        root.addView(TextView(this).apply {
            text      = "Presence"
            textSize  = 30f
            setTextColor(Color.parseColor("#D6B588"))
            gravity   = Gravity.CENTER
            typeface  = Typeface.create("serif", Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = dpToPx(12) }
        })

        // Thin tan divider
        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor("#705E46"))
            layoutParams = LinearLayout.LayoutParams(dpToPx(48), dpToPx(1)).also {
                it.gravity     = Gravity.CENTER_HORIZONTAL
                it.bottomMargin = dpToPx(36)
            }
        })

        // Body copy — same text as shield.title in the app
        root.addView(TextView(this).apply {
            text     = "Replace meme sending with actual genuine connection.\n\nText someone, upload the screenshot, and unlock your apps."
            textSize = 17f
            setTextColor(Color.parseColor("#FDFBF7"))
            gravity  = Gravity.CENTER
            setLineSpacing(dpToPx(4).toFloat(), 1f)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = dpToPx(48) }
        })

        // CTA button — tan pill
        root.addView(Button(this).apply {
            text      = "Open Presence to unlock"
            textSize  = 16f
            isAllCaps = false
            setTextColor(Color.parseColor("#422701"))
            typeface  = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            background = GradientDrawable().apply {
                shape        = GradientDrawable.RECTANGLE
                cornerRadius = 100f * dp
                setColor(Color.parseColor("#D6B588"))
            }
            val hPad = dpToPx(32)
            val vPad = dpToPx(18)
            setPadding(hPad, vPad, hPad, vPad)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            setOnClickListener {
                // Bring the Presence RN app to the foreground.
                // The home screen will show the "blocked" state with the Upload button.
                val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                launchIntent?.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
                launchIntent?.let { startActivity(it) }
            }
        })

        return root
    }

    // ── Notification (required for foreground service) ────────────────────────────

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
            getSystemService(NotificationManager::class.java)
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
}

// Extension to avoid capturing `density` inside lambdas
private val Service.dp: Float get() = resources.displayMetrics.density
private fun Service.dpToPx(dp: Int): Int = (dp * resources.displayMetrics.density).toInt()
