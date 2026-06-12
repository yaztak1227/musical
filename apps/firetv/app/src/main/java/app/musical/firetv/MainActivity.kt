package app.musical.firetv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.net.URLEncoder
import java.util.Collections
import java.util.concurrent.Callable
import java.util.concurrent.CompletionService
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var statusView: TextView
    private val mainHandler = Handler(Looper.getMainLooper())
    private var discoveryExecutor: ExecutorService? = null
    private var displayUrl: String = BuildConfig.DEFAULT_TV_URL

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val explicitUrl = resolveExplicitDisplayUrl(intent?.data, intent?.getStringExtra(EXTRA_DISPLAY_URL))

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.rgb(10, 12, 18))

        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isFocusable = true
            isFocusableInTouchMode = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    statusView.visibility = View.GONE
                    bridgeRemoteKey("APP_READY")
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?,
                ) {
                    if (request?.isForMainFrame == true) {
                        showStatus(getString(R.string.load_error, displayUrl))
                    }
                }
            }

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        statusView = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 20f
            setPadding(40, 40, 40, 40)
            text = getString(R.string.loading, displayUrl)
        }

        root.addView(webView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        root.addView(statusView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT)
        setContentView(root)

        webView.requestFocus()
        openInitialUrl(explicitUrl)
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        val nextUrl = resolveExplicitDisplayUrl(intent?.data, intent?.getStringExtra(EXTRA_DISPLAY_URL))
            ?: BuildConfig.DEFAULT_TV_URL
        if (nextUrl != displayUrl) {
            loadDisplayUrl(nextUrl, remember = true)
        }
    }

    override fun onDestroy() {
        discoveryExecutor?.shutdownNow()
        discoveryExecutor = null
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val handledKey = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
                KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
                KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
                KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> "Enter"
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "MediaPlayPause"
                KeyEvent.KEYCODE_MEDIA_PLAY -> "MediaPlay"
                KeyEvent.KEYCODE_MEDIA_PAUSE -> "MediaPause"
                KeyEvent.KEYCODE_MEDIA_NEXT -> "MediaTrackNext"
                KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "MediaTrackPrevious"
                KeyEvent.KEYCODE_BACK -> "Back"
                in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> (event.keyCode - KeyEvent.KEYCODE_0).toString()
                else -> null
            }

            if (handledKey != null) {
                bridgeRemoteKey(handledKey)
                if (handledKey == "Back" && webView.canGoBack()) {
                    webView.goBack()
                    return true
                }
                if (handledKey != "Back") return true
            }
        }

        return super.dispatchKeyEvent(event)
    }

    private fun resolveExplicitDisplayUrl(data: Uri?, extraUrl: String?): String? {
        if (!extraUrl.isNullOrBlank()) return extraUrl
        val deepLinkUrl = data?.getQueryParameter("url")
        if (!deepLinkUrl.isNullOrBlank()) return deepLinkUrl
        return null
    }

    private fun openInitialUrl(explicitUrl: String?) {
        if (!explicitUrl.isNullOrBlank()) {
            loadDisplayUrl(explicitUrl, remember = true)
            return
        }

        val savedUrl = preferences().getString(PREF_DISPLAY_URL, null)
        if (!savedUrl.isNullOrBlank()) {
            showStatus(getString(R.string.checking_saved, savedUrl))
            Thread {
                if (isMusicalServerReachable(serverBaseUrl(savedUrl))) {
                    runOnUiThread { loadDisplayUrl(savedUrl, remember = false) }
                } else {
                    discoverAndOpen()
                }
            }.start()
            return
        }

        showStatus(getString(R.string.discovering))
        Thread { discoverAndOpen() }.start()
    }

    private fun discoverAndOpen() {
        val discoveredBaseUrl = discoverMusicalServer()
        val nextUrl = if (discoveredBaseUrl != null) {
            Log.i(TAG, "Discovered Musical server at $discoveredBaseUrl")
            "$discoveredBaseUrl/tv"
        } else {
            Log.w(TAG, "No Musical server discovered; falling back to ${BuildConfig.DEFAULT_TV_URL}")
            BuildConfig.DEFAULT_TV_URL
        }

        runOnUiThread {
            if (discoveredBaseUrl != null) {
                showStatus(getString(R.string.discovered, discoveredBaseUrl))
                loadDisplayUrl(nextUrl, remember = true)
            } else {
                showStatus(getString(R.string.discovery_failed, nextUrl))
                loadDisplayUrl(nextUrl, remember = false)
            }
        }
    }

    private fun discoverMusicalServer(): String? {
        val hosts = subnetCandidates()
        if (hosts.isEmpty()) return null

        discoveryExecutor?.shutdownNow()
        val executor = Executors.newFixedThreadPool(DISCOVERY_THREADS)
        discoveryExecutor = executor
        val completionService: CompletionService<String?> = ExecutorCompletionService(executor)
        for (host in hosts) {
            completionService.submit(Callable {
                val baseUrl = "http://$host:$DEFAULT_SERVER_PORT"
                if (isMusicalServerReachable(baseUrl)) baseUrl else null
            })
        }

        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(DISCOVERY_TOTAL_TIMEOUT_MS)
        try {
            repeat(hosts.size) {
                val remainingNanos = deadline - System.nanoTime()
                if (remainingNanos <= 0) return null
                val future = completionService.poll(remainingNanos, TimeUnit.NANOSECONDS) ?: return null
                val baseUrl = future.get()
                if (baseUrl != null) return baseUrl
            }
        } catch (_: Exception) {
            return null
        } finally {
            executor.shutdownNow()
            if (discoveryExecutor === executor) discoveryExecutor = null
        }

        return null
    }

    private fun isMusicalServerReachable(baseUrl: String): Boolean {
        val connection = try {
            URL("$baseUrl/api/app_status").openConnection() as HttpURLConnection
        } catch (_: Exception) {
            return false
        }

        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = DISCOVERY_CONNECT_TIMEOUT_MS
            connection.readTimeout = DISCOVERY_READ_TIMEOUT_MS
            connection.useCaches = false
            val body = if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                ""
            }
            body.contains("Musical desktop bridge is ready")
        } catch (_: Exception) {
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun subnetCandidates(): List<String> {
        val candidates = linkedSetOf<String>()
        for (address in localIpv4Addresses()) {
            val octets = address.hostAddress?.split('.') ?: continue
            if (octets.size != 4) continue
            val prefix = "${octets[0]}.${octets[1]}.${octets[2]}"
            for (host in 1..254) {
                val candidate = "$prefix.$host"
                if (candidate != address.hostAddress) candidates.add(candidate)
            }
        }
        return candidates.toList()
    }

    private fun localIpv4Addresses(): List<Inet4Address> {
        val addresses = mutableListOf<Inet4Address>()
        val interfaces = try {
            Collections.list(NetworkInterface.getNetworkInterfaces())
        } catch (_: Exception) {
            return addresses
        }

        for (networkInterface in interfaces) {
            if (!networkInterface.isUp || networkInterface.isLoopback) continue
            for (address in Collections.list(networkInterface.inetAddresses)) {
                if (address is Inet4Address && !address.isLoopbackAddress && address.isSiteLocalAddress) {
                    addresses.add(address)
                }
            }
        }
        return addresses
    }

    private fun loadDisplayUrl(url: String, remember: Boolean) {
        displayUrl = url
        if (remember) preferences().edit().putString(PREF_DISPLAY_URL, url).apply()
        showStatus(getString(R.string.loading, displayUrl))
        webView.loadUrl(displayUrl)
    }

    private fun serverBaseUrl(url: String): String {
        val uri = Uri.parse(url)
        val scheme = uri.scheme ?: "http"
        val host = uri.host ?: return url.removeSuffix("/tv")
        val port = if (uri.port > 0) ":${uri.port}" else ""
        return "$scheme://$host$port"
    }

    private fun preferences() = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

    private fun runOnUiThread(action: () -> Unit) {
        mainHandler.post(action)
    }

    private fun bridgeRemoteKey(key: String) {
        val encodedKey = URLEncoder.encode(key, "UTF-8")
        val script = """
            window.dispatchEvent(new CustomEvent('musical-firetv-key', {
              detail: { key: decodeURIComponent('$encodedKey') }
            }));
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun showStatus(message: String) {
        statusView.text = message
        statusView.visibility = View.VISIBLE
    }

    companion object {
        private const val TAG = "MusicalFireTv"
        const val EXTRA_DISPLAY_URL = "display_url"
        private const val PREFS_NAME = "musical_firetv"
        private const val PREF_DISPLAY_URL = "display_url"
        private const val DEFAULT_SERVER_PORT = 1422
        private const val DISCOVERY_THREADS = 32
        private const val DISCOVERY_CONNECT_TIMEOUT_MS = 220
        private const val DISCOVERY_READ_TIMEOUT_MS = 450
        private const val DISCOVERY_TOTAL_TIMEOUT_MS = 8500L
    }
}
