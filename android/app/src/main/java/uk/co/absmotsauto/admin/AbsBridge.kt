package uk.co.absmotsauto.admin

import android.webkit.JavascriptInterface

class AbsBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun setPendingBookings(count: String) {
        val n = count.toIntOrNull() ?: 0
        activity.runOnUiThread { activity.updateBadge(n) }
    }

    @JavascriptInterface
    fun reload() {
        activity.runOnUiThread { activity.reloadDesk() }
    }
}
