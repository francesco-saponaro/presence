// BlockerModule.kt
// React Native NativeModule: UsageStats permission checks, overlay permission,
// battery optimisation, and start/stop the BlockerService foreground service.
// Also registers a BroadcastReceiver that forwards shield-activation events
// to the JS layer via DeviceEventEmitter.

package com.franciccio.presence

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class BlockerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val SHIELD_EVENT = "onShieldActivated"
        const val SHIELD_ACTION = "com.franciccio.presence.SHOW_SHIELD"
    }

    // BroadcastReceiver: BlockerService → JS
    private val shieldReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == SHIELD_ACTION) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(SHIELD_EVENT, null)
            }
        }
    }

    override fun getName() = "PresenceBlocker"

    override fun initialize() {
        super.initialize()
        val filter = IntentFilter(SHIELD_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(shieldReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(shieldReceiver, filter)
        }
    }

    override fun invalidate() {
        try { reactContext.unregisterReceiver(shieldReceiver) } catch (_: Exception) {}
        super.invalidate()
    }

    // ── Permission checks ────────────────────────────────────────────────────

    @ReactMethod
    fun hasUsageStatsPermission(promise: Promise) {
        try {
            val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    reactContext.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    reactContext.packageName
                )
            }
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactContext))
    }

    // ── Settings deep-links ──────────────────────────────────────────────────

    @ReactMethod
    fun openUsageAccessSettings(promise: Promise) {
        openSettings(Settings.ACTION_USAGE_ACCESS_SETTINGS, null, promise)
    }

    @ReactMethod
    fun openOverlayPermissionSettings(promise: Promise) {
        openSettings(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactContext.packageName}"),
            promise
        )
    }

    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        openSettings(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:${reactContext.packageName}"),
            promise
        )
    }

    private fun openSettings(action: String, data: Uri?, promise: Promise) {
        try {
            val intent = Intent(action).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                data?.let { this.data = it }
            }
            reactContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    // ── Service control ──────────────────────────────────────────────────────

    @ReactMethod
    fun startBlocker(blockedApps: ReadableArray, promise: Promise) {
        try {
            val apps = (0 until blockedApps.size()).mapNotNull { blockedApps.getString(it) }
            val intent = Intent(reactContext, BlockerService::class.java).apply {
                putStringArrayListExtra("blockedApps", ArrayList(apps))
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopBlocker(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, BlockerService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", e.message, e)
        }
    }

    // ── Usage stats helper ───────────────────────────────────────────────────

    @ReactMethod
    fun getForegroundApp(promise: Promise) {
        try {
            val usm = reactContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val now = System.currentTimeMillis()
            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 5_000, now)
            promise.resolve(stats?.maxByOrNull { it.lastTimeUsed }?.packageName)
        } catch (e: Exception) {
            promise.reject("USAGE_ERROR", e.message, e)
        }
    }
}
