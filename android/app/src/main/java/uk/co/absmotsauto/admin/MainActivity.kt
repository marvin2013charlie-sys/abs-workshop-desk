package uk.co.absmotsauto.admin

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var lastPending = 0

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    private val notifyPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* badge still updates in-app */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.deskWeb)

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            loadWithOverviewMode = false
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString ABSMOTS/1.4"
        }
        webView.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
        webView.addJavascriptInterface(AbsBridge(this), "ABSMots")

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                BRIDGE_JS,
                setOf("https://www.absmotsauto.co.uk", "https://absmotsauto.co.uk"),
            )
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url.toString()
                if (isAdminUrl(url)) return false
                openExternal(url)
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(BRIDGE_JS, null)
                cookies.flush()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (!request.isForMainFrame) return
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("ABS MOTS")
                    .setMessage(
                        "Could not open the admin desk.\n\nCheck the internet connection and try again.",
                    )
                    .setPositiveButton("Retry") { _, _ -> reloadDesk() }
                    .setNegativeButton("Close", null)
                    .show()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    filePicker.launch(intent)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    Toast.makeText(this@MainActivity, "No file picker on this phone.", Toast.LENGTH_SHORT).show()
                    false
                }
            }

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?,
            ): Boolean {
                val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                val extra = WebView(this@MainActivity)
                extra.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        v: WebView,
                        request: WebResourceRequest,
                    ): Boolean {
                        val url = request.url.toString()
                        if (isAdminUrl(url)) webView.loadUrl(url) else openExternal(url)
                        return true
                    }
                }
                transport.webView = extra
                resultMsg.sendToTarget()
                return true
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (url.startsWith("blob:") || url.startsWith("data:")) return@setDownloadListener
            try {
                val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    addRequestHeader("User-Agent", userAgent)
                    val cookie = cookies.getCookie(url)
                    if (!cookie.isNullOrBlank()) addRequestHeader("Cookie", cookie)
                    setMimeType(mimeType)
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                    setTitle(name)
                }
                getSystemService(DownloadManager::class.java).enqueue(request)
                Toast.makeText(this, "Downloading $name", Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {
                openExternal(url)
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack() else finish()
                }
            },
        )

        askNotifyPermission()
        webView.loadUrl(liveAdminUrl())
    }

    override fun onResume() {
        super.onResume()
        webView.evaluateJavascript(
            "try{window.dispatchEvent(new Event('abs-desktop-refresh'));}catch(e){}",
            null,
        )
    }

    fun reloadDesk() {
        webView.clearCache(true)
        webView.loadUrl(liveAdminUrl())
    }

    fun updateBadge(count: Int) {
        val n = count.coerceAtLeast(0)
        lastPending = n
        title = if (n > 0) "($n) ABS MOTS" else "ABS MOTS"
        val manager = getSystemService(NotificationManager::class.java)
        if (n <= 0) {
            manager.cancel(BADGE_ID)
            return
        }
        val open = android.app.PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, AbsApp.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_abs)
            .setContentTitle("ABS MOTS")
            .setContentText(
                "$n online booking${if (n == 1) "" else "s"} waiting to confirm.",
            )
            .setNumber(n)
            .setAutoCancel(false)
            .setContentIntent(open)
            .setColor(ContextCompat.getColor(this, R.color.abs_accent))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        manager.notify(BADGE_ID, notification)
    }

    private fun askNotifyPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Could not open that link.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun isAdminUrl(target: String): Boolean {
        return try {
            val uri = Uri.parse(target)
            val host = uri.host ?: return false
            if (host !in ALLOWED_HOSTS) return false
            val path = uri.path ?: ""
            path == "/admin" || path.startsWith("/admin/")
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        private const val ADMIN_URL = "https://www.absmotsauto.co.uk/admin"
        private const val BADGE_ID = 1
        private val ALLOWED_HOSTS = setOf(
            "www.absmotsauto.co.uk",
            "absmotsauto.co.uk",
            "absmotsauto.onrender.com",
        )
        private const val BRIDGE_JS = """
            (function(){
              window.absDesktop = {
                isDesktop: true,
                isAndroid: true,
                setPendingBookings: function(count){
                  try { ABSMots.setPendingBookings(String(count||0)); } catch (e) {}
                },
                reload: function(){
                  try { ABSMots.reload(); } catch (e) { location.reload(); }
                }
              };
            })();
        """

        fun liveAdminUrl(): String {
            val sep = if (ADMIN_URL.contains("?")) "&" else "?"
            return ADMIN_URL + sep + "desk=" + System.currentTimeMillis()
        }
    }
}
