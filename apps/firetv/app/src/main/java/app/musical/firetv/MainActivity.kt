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
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var webBridge: FireTvWebBridge
    private lateinit var statusView: TextView
    private lateinit var tabShell: FireTvTabShell
    private lateinit var contentArea: FrameLayout
    private lateinit var settingsPanel: FireTvSettingsPanel
    private lateinit var splashOverlayController: FireTvSplashOverlay
    private var splashOverlay: View? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val discoveryRepository = FireTvDiscoveryRepository()
    private var discoveryGeneration = 0
    private var displayUrl: String = BuildConfig.DEFAULT_TV_URL
    private var selectedTab = FireTvTab.PLAYER
    private var focusedTab = FireTvTab.PLAYER
    private var discoveredServers: List<DiscoveredServer> = emptyList()
    private var selectedServerBaseUrl: String? = null
    private var selectedLibraryId: String? = null
    private var discoveryStatus: String = ""
    private var fallbackMode = false
    private var selectedLibraryName: String? = null
    private var statusMessageVisible = true
    private var isWebSurfaceFocused = true
    private var isSettingsContentFocused = false
    private var selectedLocale: String = "en"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val explicitUrl = FireTvIntentResolver.resolveExplicitDisplayUrl(
            intent?.data,
            intent?.getStringExtra(EXTRA_DISPLAY_URL),
        )
        selectedLocale = preferences().getString(PREF_LOCALE, null)?.takeIf { isSupportedLocale(it) } ?: "en"

        val outer = FrameLayout(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        root.setBackgroundColor(FireTvTheme.playerStrongColor())

        tabShell = FireTvTabShell(this) { tab ->
            focusedTab = tab
            selectTab(tab)
        }

        contentArea = FrameLayout(this).apply {
            setBackgroundColor(FireTvTheme.playerStrongColor())
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isFocusable = true
            isFocusableInTouchMode = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    statusMessageVisible = false
                    statusView.visibility = View.GONE
                    webBridge.remoteKey("APP_READY")
                    webBridge.selectedTab(selectedTab)
                    hideSplashOverlay()
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
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            clearCache(true)
        }
        webBridge = FireTvWebBridge(webView)

        statusView = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 20f
            setPadding(40, 40, 40, 40)
            text = getString(R.string.loading, displayUrl)
        }

        settingsPanel = FireTvSettingsPanel(
            context = this,
            onRescan = { startDiscovery(showSettingsTab = true) },
            onSelectLibrary = { server, library -> selectLibrary(server, library) },
            onSelectLocale = { locale -> selectLocale(locale) },
        )
        val settingsView = settingsPanel.createView()
        contentArea.addView(webView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        contentArea.addView(settingsView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        contentArea.addView(statusView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT)

        root.addView(tabShell.view, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        root.addView(contentArea, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        splashOverlayController = FireTvSplashOverlay(this)
        val splashView = splashOverlayController.create()
        splashOverlay = splashView
        outer.addView(root, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        outer.addView(splashView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        setContentView(outer)
        splashView.bringToFront()

        updateSettingsView(refocus = false)
        selectTab(FireTvTab.PLAYER)
        webView.requestFocus()
        openInitialUrl(explicitUrl)
        mainHandler.postDelayed({ hideSplashOverlay() }, 6500)
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        val nextUrl = FireTvIntentResolver.resolveExplicitDisplayUrl(
            intent?.data,
            intent?.getStringExtra(EXTRA_DISPLAY_URL),
        )
            ?: BuildConfig.DEFAULT_TV_URL
        if (nextUrl != displayUrl) {
            loadDisplayUrl(nextUrl, remember = true)
        }
    }

    override fun onDestroy() {
        discoveryRepository.shutdown()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            if (selectedTab != FireTvTab.SETTINGS && isWebSurfaceFocused) {
                if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                    isWebSurfaceFocused = false
                    focusedTab = selectedTab
                    updateTabStyles()
                    return true
                }

                val handledKey = when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
                    KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
                    KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
                    KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> "Enter"
                    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "MediaPlayPause"
                    KeyEvent.KEYCODE_MEDIA_PLAY -> "MediaPlay"
                    KeyEvent.KEYCODE_MEDIA_PAUSE -> "MediaPause"
                    KeyEvent.KEYCODE_MEDIA_NEXT -> "MediaTrackNext"
                    KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "MediaTrackPrevious"
                    in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> (event.keyCode - KeyEvent.KEYCODE_0).toString()
                    else -> null
                }

                if (handledKey != null) {
                    webBridge.remoteKey(handledKey)
                    return true
                }
            }

            if (selectedTab == FireTvTab.SETTINGS && isSettingsContentFocused) {
                if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                    isSettingsContentFocused = false
                    focusedTab = selectedTab
                    settingsPanel.clearFocus()
                    tabShell.requestFocus()
                    updateTabStyles()
                    return true
                }
                if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || event.keyCode == KeyEvent.KEYCODE_ENTER) {
                    if (clickFocusedSettingsItem()) return true
                }
                return false
            }

            if (event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                moveFocusedTab(-1)
                return true
            }
            if (event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                moveFocusedTab(1)
                return true
            }
            if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || event.keyCode == KeyEvent.KEYCODE_ENTER) {
                if (focusedTab != selectedTab) {
                    selectTab(focusedTab)
                    return true
                }
                if (selectedTab == FireTvTab.SETTINGS) {
                    isSettingsContentFocused = true
                    updateTabStyles()
                    focusSettingsDefault()
                    return true
                }
                isWebSurfaceFocused = true
                webView.requestFocus()
                updateTabStyles()
                return true
            }
            if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                if (selectedTab != FireTvTab.PLAYER) {
                    focusedTab = FireTvTab.PLAYER
                    selectTab(FireTvTab.PLAYER)
                    return true
                }
                if (webView.canGoBack()) {
                    webView.goBack()
                    return true
                }
                return super.dispatchKeyEvent(event)
            }
        }

        return super.dispatchKeyEvent(event)
    }

    private fun moveFocusedTab(delta: Int) {
        focusedTab = tabShell.moveFocusedTab(focusedTab, delta)
        updateTabStyles()
    }

    private fun selectTab(tab: FireTvTab) {
        selectedTab = tab
        focusedTab = tab
        isWebSurfaceFocused = tab != FireTvTab.SETTINGS
        isSettingsContentFocused = tab == FireTvTab.SETTINGS
        settingsPanel.view.visibility = if (tab == FireTvTab.SETTINGS) View.VISIBLE else View.GONE
        webView.visibility = if (tab == FireTvTab.SETTINGS) View.GONE else View.VISIBLE
        statusView.visibility = if (tab == FireTvTab.PLAYER && statusMessageVisible) View.VISIBLE else View.GONE
        updateTabStyles()
        if (tab == FireTvTab.SETTINGS) {
            focusSettingsDefault()
        } else {
            webView.requestFocus()
            webBridge.selectedTab(selectedTab)
        }
    }

    private fun updateTabStyles() {
        tabShell.updateStyles(
            selectedTab = selectedTab,
            focusedTab = focusedTab,
            isWebSurfaceFocused = isWebSurfaceFocused,
            isSettingsContentFocused = isSettingsContentFocused,
        )
    }

    private fun showSettings() {
        focusedTab = FireTvTab.SETTINGS
        selectTab(FireTvTab.SETTINGS)
    }

    private fun focusSettingsDefault() {
        settingsPanel.focusDefault(settingsState())
    }

    private fun hideSplashOverlay() {
        val splash = splashOverlay ?: return
        splashOverlay = null
        splashOverlayController.hide(splash)
    }

    private fun clickFocusedSettingsItem(): Boolean {
        return settingsPanel.clickFocusedItem(currentFocus = currentFocus, contentFocus = contentArea.findFocus())
    }

    private fun updateSettingsView(refocus: Boolean = selectedTab == FireTvTab.SETTINGS) {
        settingsPanel.update(settingsState(), refocus = refocus)
    }

    private fun settingsState(): FireTvSettingsState =
        FireTvSettingsState(
            discoveryStatus = discoveryStatus,
            discoveredServers = discoveredServers,
            selectedServerBaseUrl = selectedServerBaseUrl,
            selectedLibraryId = selectedLibraryId,
            selectedLibraryName = selectedLibraryName,
            selectedLocale = selectedLocale,
        )

    private fun selectLocale(locale: String) {
        if (!isSupportedLocale(locale)) return
        selectedLocale = locale
        preferences().edit().putString(PREF_LOCALE, locale).apply()
        webBridge.applyLocale(locale)
        updateSettingsView(refocus = false)
    }

    private fun openInitialUrl(explicitUrl: String?) {
        if (!explicitUrl.isNullOrBlank()) {
            val explicitBaseUrl = serverBaseUrl(explicitUrl)
            val explicitLibraryId = Uri.parse(explicitUrl).getQueryParameter("libraryId")
            if (!explicitLibraryId.isNullOrBlank()) selectedLibraryId = explicitLibraryId
            val generation = nextDiscoveryGeneration()
            setDiscoveryStatus(getString(R.string.checking_saved, explicitBaseUrl))
            Thread {
                val server = discoveryRepository.createServerCandidate(
                    explicitBaseUrl,
                    fallback = false,
                    forceReachable = true,
                )
                runOnUiThread {
                    if (!isCurrentDiscovery(generation)) return@runOnUiThread
                    applyDiscoveredServers(listOf(server), getString(R.string.discovered, explicitBaseUrl))
                    loadDisplayUrl(displayUrlFor(server, selectedLibraryId), remember = true)
                }
            }.start()
            return
        }

        val savedUrl = preferences().getString(PREF_DISPLAY_URL, null)
        if (!savedUrl.isNullOrBlank()) {
            val generation = nextDiscoveryGeneration()
            setDiscoveryStatus(getString(R.string.checking_saved, savedUrl))
            Thread {
                val savedBaseUrl = serverBaseUrl(savedUrl)
                if (discoveryRepository.isMusicalServerReachable(savedBaseUrl)) {
                    val server = discoveryRepository.createServerCandidate(
                        savedBaseUrl,
                        fallback = false,
                        forceReachable = true,
                    )
                    runOnUiThread {
                        if (!isCurrentDiscovery(generation)) return@runOnUiThread
                        applyDiscoveredServers(listOf(server), getString(R.string.discovered, savedBaseUrl))
                        loadDisplayUrl(displayUrlFor(server, selectedLibraryId), remember = false)
                    }
                } else {
                    discoverAndOpen(generation)
                }
            }.start()
            return
        }

        startDiscovery(showSettingsTab = false)
    }

    private fun startDiscovery(showSettingsTab: Boolean) {
        val generation = nextDiscoveryGeneration()
        fallbackMode = false
        setDiscoveryStatus(getString(R.string.discovering))
        if (showSettingsTab) showSettings()
        Thread { discoverAndOpen(generation) }.start()
    }

    private fun nextDiscoveryGeneration(): Int {
        discoveryRepository.shutdown()
        discoveryGeneration += 1
        return discoveryGeneration
    }

    private fun isCurrentDiscovery(generation: Int): Boolean = generation == discoveryGeneration

    private fun setDiscoveryStatus(status: String) {
        discoveryStatus = status
        updateSettingsView()
        showStatus(status)
    }

    private fun discoverAndOpen(generation: Int) {
        val servers = discoveryRepository.discoverMusicalServers()
        val primaryServer = servers.firstOrNull()
        val nextUrl = if (primaryServer != null) {
            Log.i(TAG, "Discovered Musical server at ${primaryServer.baseUrl}")
            displayUrlFor(primaryServer, selectedLibraryId)
        } else {
            Log.w(TAG, "No Musical server discovered; falling back to ${BuildConfig.DEFAULT_TV_URL}")
            BuildConfig.DEFAULT_TV_URL
        }

        runOnUiThread {
            if (!isCurrentDiscovery(generation)) return@runOnUiThread
            if (primaryServer != null) {
                fallbackMode = false
                applyDiscoveredServers(servers, getString(R.string.discovered, primaryServer.baseUrl))
                val selectedServer = discoveredServers.firstOrNull { it.baseUrl == selectedServerBaseUrl } ?: primaryServer
                val selectedLibrary = selectedLibraryId.takeIf { selectedServer.baseUrl == selectedServerBaseUrl }
                loadDisplayUrl(displayUrlFor(selectedServer, selectedLibrary), remember = true)
            } else {
                fallbackMode = true
                applyDiscoveredServers(
                    listOf(DiscoveredServer(serverBaseUrl(nextUrl), nextUrl, reachable = false, fallback = true)),
                    getString(R.string.discovery_failed, nextUrl),
                )
                loadDisplayUrl(nextUrl, remember = false)
                showSettings()
            }
        }
    }

    private fun applyDiscoveredServers(servers: List<DiscoveredServer>, status: String) {
        discoveredServers = servers
        discoveryStatus = status
        showStatus(status)
        restoreSelectedLibrary(servers)
        updateSettingsView()
    }

    private fun restoreSelectedLibrary(servers: List<DiscoveredServer>) {
        val preferredLibraryId = selectedLibraryId ?: preferences().getString(PREF_LIBRARY_ID, null)
        val savedLibrary = FireTvSelectionPolicy.restoreSelectedLibrary(preferredLibraryId, servers)

        if (savedLibrary == null) {
            selectedLibraryId = null
            selectedLibraryName = null
            selectedServerBaseUrl = null
            preferences().edit().remove(PREF_LIBRARY_ID).apply()
            return
        }

        selectedServerBaseUrl = savedLibrary.serverBaseUrl
        selectedLibraryId = savedLibrary.libraryId
        selectedLibraryName = savedLibrary.libraryName
    }

    private fun selectLibrary(server: DiscoveredServer, library: RemoteLibrary) {
        selectedServerBaseUrl = server.baseUrl
        selectedLibraryId = library.id
        selectedLibraryName = library.name
        preferences().edit().putString(PREF_LIBRARY_ID, library.id).apply()
        loadDisplayUrl(displayUrlFor(server, library.id), remember = true)
        selectTab(FireTvTab.PLAYER)
    }

    private fun loadDisplayUrl(url: String, remember: Boolean) {
        displayUrl = url
        if (remember) preferences().edit().putString(PREF_DISPLAY_URL, url).apply()
        if (discoveredServers.isEmpty()) {
            val baseUrl = serverBaseUrl(url)
            discoveredServers = listOf(DiscoveredServer(baseUrl, tvUrlFor(baseUrl), reachable = true, fallback = fallbackMode))
        }
        updateSettingsView()
        showStatus(getString(R.string.loading, displayUrl))
        webView.loadUrl(displayUrl)
    }

    private fun serverBaseUrl(url: String): String {
        return FireTvUrlHelpers.serverBaseUrl(url)
    }

    private fun tvUrlFor(baseUrl: String): String = FireTvUrlHelpers.tvUrlFor(baseUrl)

    private fun displayUrlFor(server: DiscoveredServer, libraryId: String?): String {
        return FireTvUrlHelpers.displayUrlFor(server.tvUrl, libraryId)
    }

    private fun preferences() = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

    private fun runOnUiThread(action: () -> Unit) {
        mainHandler.post(action)
    }

    private fun isSupportedLocale(locale: String): Boolean = locale == "en" || locale == "ja"

    private fun showStatus(message: String) {
        statusView.text = message
        statusMessageVisible = true
        statusView.visibility = if (selectedTab == FireTvTab.PLAYER) View.VISIBLE else View.GONE
    }

    companion object {
        private const val TAG = "MusicalFireTv"
        const val EXTRA_DISPLAY_URL = "display_url"
        private const val PREFS_NAME = "musical_firetv"
        private const val PREF_DISPLAY_URL = "display_url"
        private const val PREF_LIBRARY_ID = "library_id"
        private const val PREF_LOCALE = "locale"
    }
}
