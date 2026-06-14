package app.musical.firetv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
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
    private lateinit var tabBar: LinearLayout
    private lateinit var contentArea: FrameLayout
    private lateinit var settingsView: ScrollView
    private lateinit var settingsStatusView: TextView
    private lateinit var serverListView: LinearLayout
    private lateinit var libraryListView: LinearLayout
    private lateinit var languageListView: LinearLayout
    private lateinit var selectedLibraryView: TextView
    private lateinit var rescanButton: Button
    private var splashOverlay: View? = null
    private val tabButtons = mutableMapOf<FireTvTab, TextView>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var discoveryExecutor: ExecutorService? = null
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

    private enum class FireTvTab(val title: String, val webSurface: String?) {
        SETTINGS("Settings", null),
        ALBUMS("Albums", "albums"),
        TRACKS("Tracks", "tracks"),
        PLAYER("Player", "player"),
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val explicitUrl = resolveExplicitDisplayUrl(intent?.data, intent?.getStringExtra(EXTRA_DISPLAY_URL))
        selectedLocale = preferences().getString(PREF_LOCALE, null)?.takeIf { isSupportedLocale(it) } ?: "en"

        val outer = FrameLayout(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        root.setBackgroundColor(playerStrongColor())

        tabBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(48, 22, 48, 0)
            background = navBarBackground()
            isFocusable = true
            isFocusableInTouchMode = true
        }

        for (tab in fireTvTabs) {
            val tabButton = TextView(this).apply {
                text = tab.title
                textSize = 20f
                setTextColor(Color.WHITE)
                gravity = android.view.Gravity.CENTER
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(20, 18, 20, 20)
                isFocusable = false
                setOnClickListener {
                    focusedTab = tab
                    selectTab(tab)
                }
            }
            tabButtons[tab] = tabButton
            tabBar.addView(
                tabButton,
                LinearLayout.LayoutParams(0, 84, 1f),
            )
        }

        contentArea = FrameLayout(this).apply {
            setBackgroundColor(playerStrongColor())
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
                    bridgeRemoteKey("APP_READY")
                    bridgeSelectedTab()
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

        statusView = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 20f
            setPadding(40, 40, 40, 40)
            text = getString(R.string.loading, displayUrl)
        }

        settingsView = createSettingsView()
        contentArea.addView(webView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        contentArea.addView(settingsView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        contentArea.addView(statusView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT)

        root.addView(tabBar, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        root.addView(contentArea, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        val splashView = createSplashView()
        splashOverlay = splashView
        outer.addView(root, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        outer.addView(splashView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        setContentView(outer)
        splashView.bringToFront()

        updateSettingsView()
        selectTab(FireTvTab.PLAYER)
        webView.requestFocus()
        openInitialUrl(explicitUrl)
        mainHandler.postDelayed({ hideSplashOverlay() }, 6500)
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
                    bridgeRemoteKey(handledKey)
                    return true
                }
            }

            if (selectedTab == FireTvTab.SETTINGS && isSettingsContentFocused) {
                if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                    isSettingsContentFocused = false
                    focusedTab = selectedTab
                    currentFocus?.clearFocus()
                    tabBar.requestFocus()
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
        val tabs = fireTvTabs
        val currentIndex = tabs.indexOf(focusedTab)
        focusedTab = tabs[(currentIndex + delta + tabs.size) % tabs.size]
        updateTabStyles()
    }

    private fun selectTab(tab: FireTvTab) {
        selectedTab = tab
        focusedTab = tab
        isWebSurfaceFocused = tab != FireTvTab.SETTINGS
        isSettingsContentFocused = tab == FireTvTab.SETTINGS
        settingsView.visibility = if (tab == FireTvTab.SETTINGS) View.VISIBLE else View.GONE
        webView.visibility = if (tab == FireTvTab.SETTINGS) View.GONE else View.VISIBLE
        statusView.visibility = if (tab == FireTvTab.PLAYER && statusMessageVisible) View.VISIBLE else View.GONE
        updateTabStyles()
        if (tab == FireTvTab.SETTINGS) {
            focusSettingsDefault()
        } else {
            webView.requestFocus()
            bridgeSelectedTab()
        }
    }

    private fun updateTabStyles() {
        val isTabNavigationFocused = if (selectedTab == FireTvTab.SETTINGS) {
            !isSettingsContentFocused
        } else {
            !isWebSurfaceFocused
        }
        for ((tab, button) in tabButtons) {
            val isSelected = tab == selectedTab
            val isFocused = tab == focusedTab && isTabNavigationFocused
            button.setTextColor(
                when {
                    isFocused && !isWebSurfaceFocused -> Color.WHITE
                    isSelected -> onPlayerColor()
                    else -> Color.rgb(206, 186, 188)
                },
            )
            button.background = tabBackground(isSelected, isFocused && !isWebSurfaceFocused)
        }
    }

    private fun createSettingsView(): ScrollView {
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 48, 56, 56)
        }

        val title = TextView(this).apply {
            text = getString(R.string.settings_title)
            textSize = 30f
            setTextColor(Color.WHITE)
        }
        settingsStatusView = TextView(this).apply {
            textSize = 19f
            setTextColor(Color.rgb(214, 222, 236))
            setPadding(0, 12, 0, 28)
        }
        rescanButton = Button(this).apply {
            text = getString(R.string.settings_rescan)
            textSize = 18f
            setAllCaps(false)
            setTextColor(onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minWidth = 320
            minHeight = 78
            setPadding(28, 0, 28, 0)
            background = outlinedControlBackground(focused = false)
            setOnFocusChangeListener { view, hasFocus ->
                view.background = outlinedControlBackground(focused = hasFocus)
            }
            setOnClickListener {
                startDiscovery(showSettingsTab = true)
            }
        }

        serverListView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 28, 0, 18)
        }
        libraryListView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 20, 0, 18)
        }
        languageListView = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 20, 0, 18)
        }
        selectedLibraryView = TextView(this).apply {
            textSize = 18f
            setTextColor(Color.rgb(228, 234, 245))
            setPadding(0, 12, 0, 0)
        }

        panel.addView(title)
        panel.addView(settingsStatusView)
        panel.addView(rescanButton, LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        panel.addView(sectionHeading(getString(R.string.settings_servers)))
        panel.addView(serverListView)
        panel.addView(sectionHeading(getString(R.string.settings_libraries)))
        panel.addView(libraryListView)
        panel.addView(selectedLibraryView)
        panel.addView(sectionHeading(getString(R.string.settings_language)))
        panel.addView(languageListView)

        return ScrollView(this).apply {
            isFocusable = true
            isFocusableInTouchMode = true
            visibility = View.GONE
            addView(panel)
        }
    }

    private fun sectionHeading(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 22f
            setTextColor(Color.WHITE)
            setPadding(0, 30, 0, 8)
        }

    private fun showSettings() {
        focusedTab = FireTvTab.SETTINGS
        selectTab(FireTvTab.SETTINGS)
    }

    private fun focusSettingsDefault() {
        rescanButton.requestFocus()
    }

    private fun createSplashView(): View {
        val splash = FrameLayout(this).apply {
            setBackgroundColor(playerStrongColor())
            isClickable = true
            isFocusable = true
            scaleX = 0.96f
            scaleY = 0.96f
            elevation = 1000f
            translationZ = 1000f
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
        }
        val icon = TextView(this).apply {
            text = "M"
            textSize = 44f
            gravity = android.view.Gravity.CENTER
            setTextColor(playerStrongColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            background = splashIconBackground()
        }
        val brand = TextView(this).apply {
            text = getString(R.string.app_name).removeSuffix(" TV")
            textSize = 34f
            letterSpacing = 0.02f
            setTextColor(onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = android.view.Gravity.CENTER
            setPadding(0, 18, 0, 0)
        }
        content.addView(icon, LinearLayout.LayoutParams(112, 112))
        content.addView(brand, LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        splash.addView(
            content,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, android.view.Gravity.CENTER),
        )
        splash.viewTreeObserver.addOnPreDrawListener(
            object : android.view.ViewTreeObserver.OnPreDrawListener {
                override fun onPreDraw(): Boolean {
                    splash.viewTreeObserver.removeOnPreDrawListener(this)
                    splash.animate().scaleX(1f).scaleY(1f).setDuration(1000).start()
                    return true
                }
            },
        )
        return splash
    }

    private fun hideSplashOverlay() {
        val splash = splashOverlay ?: return
        splashOverlay = null
        splash.animate()
            .alpha(0f)
            .scaleX(1.03f)
            .scaleY(1.03f)
            .setDuration(220)
            .withEndAction { (splash.parent as? FrameLayout)?.removeView(splash) }
            .start()
    }

    private fun findLibraryButton(serverBaseUrl: String?, libraryId: String?): View? {
        if (serverBaseUrl.isNullOrBlank() || libraryId.isNullOrBlank()) return null
        for (index in 0 until libraryListView.childCount) {
            val child = libraryListView.getChildAt(index)
            if (child.getTag(R.id.fire_tv_server_base_url) == serverBaseUrl &&
                child.getTag(R.id.fire_tv_library_id) == libraryId
            ) {
                return child
            }
        }
        return null
    }

    private fun findLanguageButton(locale: String): View? {
        for (index in 0 until languageListView.childCount) {
            val child = languageListView.getChildAt(index)
            if (child.getTag(R.id.fire_tv_locale) == locale) return child
        }
        return null
    }

    private fun firstFocusableChild(container: LinearLayout): View? {
        for (index in 0 until container.childCount) {
            val child = container.getChildAt(index)
            if (child.isFocusable) return child
        }
        return null
    }

    private fun clickFocusedSettingsItem(): Boolean {
        val candidates = listOfNotNull(settingsView.findFocus(), contentArea.findFocus(), currentFocus)
        for (candidate in candidates) {
            if (candidate.isShown && candidate.isClickable) {
                candidate.performClick()
                return true
            }
        }

        val fallback = firstFocusableChild(libraryListView) ?: rescanButton
        if (fallback.isShown && fallback.isClickable) {
            fallback.performClick()
            return true
        }
        return false
    }

    private fun updateSettingsView() {
        settingsStatusView.text = discoveryStatus.ifBlank { getString(R.string.settings_status_idle) }
        serverListView.removeAllViews()
        libraryListView.removeAllViews()
        languageListView.removeAllViews()

        if (discoveredServers.isEmpty()) {
            serverListView.addView(settingsLine(getString(R.string.settings_no_servers)))
        } else {
            for (server in discoveredServers) {
                serverListView.addView(settingsLine(server.baseUrl))
                serverListView.addView(settingsLine(getString(R.string.settings_tv_url, server.tvUrl)))
                if (server.fallback) serverListView.addView(settingsLine(getString(R.string.settings_fallback_active)))
                if (!server.reachable) serverListView.addView(settingsLine(getString(R.string.settings_server_unreachable)))
            }
        }

        val reachableServers = discoveredServers.filter { it.reachable }
        if (reachableServers.isEmpty()) {
            libraryListView.addView(settingsLine(getString(R.string.settings_no_libraries)))
        } else {
            for (server in reachableServers) {
                if (server.libraryError != null) {
                    libraryListView.addView(settingsLine(getString(R.string.settings_library_fetch_failed, server.baseUrl)))
                    libraryListView.addView(settingsLine(server.libraryError))
                } else if (server.libraries.isEmpty()) {
                    libraryListView.addView(settingsLine(getString(R.string.settings_no_libraries)))
                } else {
                    for (library in server.libraries) {
                        libraryListView.addView(libraryButton(server, library))
                    }
                }
            }
        }
        selectedLibraryView.text = getString(
            R.string.settings_selected_library,
            selectedLibraryName ?: getString(R.string.settings_no_library_selected),
        )
        languageListView.addView(languageButton("en", getString(R.string.settings_language_english)))
        languageListView.addView(languageButton("ja", getString(R.string.settings_language_japanese)))
        if (selectedTab == FireTvTab.SETTINGS) {
            mainHandler.post { focusSettingsDefault() }
        }
    }

    private fun libraryButton(server: DiscoveredServer, library: RemoteLibrary): Button =
        Button(this).apply {
            val selected = library.id == selectedLibraryId && server.baseUrl == selectedServerBaseUrl
            text = if (selected) {
                getString(R.string.settings_library_selected_item, library.name, library.albumCount, library.trackCount)
            } else {
                getString(R.string.settings_library_item, library.name, library.albumCount, library.trackCount)
            }
            textSize = 18f
            setTag(R.id.fire_tv_server_base_url, server.baseUrl)
            setTag(R.id.fire_tv_library_id, library.id)
            setAllCaps(false)
            setTextColor(onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(24, 0, 24, 0)
            background = libraryControlBackground(selected = selected, focused = false)
            setOnFocusChangeListener { view, hasFocus ->
                view.setPadding(if (hasFocus) 32 else 24, 0, 24, 0)
                view.background = libraryControlBackground(selected = selected, focused = hasFocus)
            }
            setOnClickListener {
                selectLibrary(server, library)
            }
        }

    private fun languageButton(locale: String, label: String): Button =
        Button(this).apply {
            val selected = locale == selectedLocale
            text = if (selected) getString(R.string.settings_language_selected, label) else label
            textSize = 18f
            setTag(R.id.fire_tv_locale, locale)
            setAllCaps(false)
            setTextColor(onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minWidth = 220
            minHeight = 72
            setPadding(24, 0, 24, 0)
            background = languageControlBackground(selected = selected, focused = false)
            setOnFocusChangeListener { view, hasFocus ->
                view.background = languageControlBackground(selected = selected, focused = hasFocus)
            }
            setOnClickListener {
                selectLocale(locale)
            }
            val margin = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            margin.setMargins(0, 0, 18, 0)
            layoutParams = margin
        }

    private fun selectLocale(locale: String) {
        if (!isSupportedLocale(locale)) return
        selectedLocale = locale
        preferences().edit().putString(PREF_LOCALE, locale).apply()
        applyWebLocale(locale)
        updateSettingsView()
        mainHandler.post { findLanguageButton(locale)?.requestFocus() }
    }

    private fun navBarBackground(): GradientDrawable =
        GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(Color.rgb(63, 15, 18), Color.rgb(84, 19, 22), Color.rgb(48, 13, 18)),
        ).apply {
            setStroke(0, Color.TRANSPARENT)
        }

    private fun splashIconBackground(): GradientDrawable =
        GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(onPlayerColor(), Color.rgb(244, 188, 184)),
        ).apply {
            shape = GradientDrawable.OVAL
            setStroke(3, Color.argb(190, 255, 255, 255))
        }

    private fun tabBackground(selected: Boolean, focused: Boolean): GradientDrawable =
        roundedBackground(
            fillColor = when {
                selected && focused -> Color.rgb(162, 32, 40)
                selected -> Color.rgb(132, 28, 34)
                focused -> Color.rgb(96, 24, 30)
                else -> Color.TRANSPARENT
            },
            strokeColor = when {
                focused -> Color.WHITE
                else -> Color.TRANSPARENT
            },
            strokeWidth = if (focused) 3 else 0,
            radius = if (selected) 0f else 8f,
        )

    private fun outlinedControlBackground(focused: Boolean): GradientDrawable =
        roundedBackground(
            fillColor = if (focused) Color.argb(82, 244, 222, 218) else Color.TRANSPARENT,
            strokeColor = if (focused) Color.WHITE else Color.argb(178, 244, 222, 218),
            strokeWidth = if (focused) 4 else 2,
            radius = 28f,
        )

    private fun libraryControlBackground(selected: Boolean, focused: Boolean): GradientDrawable =
        roundedBackground(
            fillColor = when {
                focused -> Color.argb(92, 244, 222, 218)
                selected -> Color.argb(58, 244, 222, 218)
                else -> Color.argb(18, 244, 222, 218)
            },
            strokeColor = when {
                focused -> Color.WHITE
                selected -> Color.rgb(244, 222, 218)
                else -> Color.argb(132, 244, 222, 218)
            },
            strokeWidth = if (focused) 5 else if (selected) 3 else 2,
            radius = 8f,
        )

    private fun languageControlBackground(selected: Boolean, focused: Boolean): GradientDrawable =
        roundedBackground(
            fillColor = when {
                focused -> Color.argb(96, 244, 222, 218)
                selected -> Color.argb(74, 162, 32, 40)
                else -> Color.argb(16, 244, 222, 218)
            },
            strokeColor = when {
                focused -> Color.WHITE
                selected -> Color.argb(120, 244, 222, 218)
                else -> Color.argb(112, 244, 222, 218)
            },
            strokeWidth = if (focused) 5 else 2,
            radius = 8f,
        )

    private fun roundedBackground(
        fillColor: Int,
        strokeColor: Int,
        strokeWidth: Int,
        radius: Float,
    ): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radius
            setColor(fillColor)
            if (strokeWidth > 0) setStroke(strokeWidth, strokeColor)
        }

    private fun playerStrongColor(): Int = Color.rgb(58, 14, 18)

    private fun onPlayerColor(): Int = Color.rgb(255, 247, 244)

    private fun settingsLine(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 18f
            setTextColor(Color.rgb(210, 218, 232))
            setPadding(0, 7, 0, 7)
        }

    private fun resolveExplicitDisplayUrl(data: Uri?, extraUrl: String?): String? {
        if (!extraUrl.isNullOrBlank()) return extraUrl
        val deepLinkUrl = data?.getQueryParameter("url")
        if (!deepLinkUrl.isNullOrBlank()) return deepLinkUrl
        return null
    }

    private fun openInitialUrl(explicitUrl: String?) {
        if (!explicitUrl.isNullOrBlank()) {
            val explicitBaseUrl = serverBaseUrl(explicitUrl)
            val explicitLibraryId = Uri.parse(explicitUrl).getQueryParameter("libraryId")
            if (!explicitLibraryId.isNullOrBlank()) selectedLibraryId = explicitLibraryId
            val generation = nextDiscoveryGeneration()
            setDiscoveryStatus(getString(R.string.checking_saved, explicitBaseUrl))
            Thread {
                val server = createServerCandidate(explicitBaseUrl, fallback = false, forceReachable = true)
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
                if (isMusicalServerReachable(savedBaseUrl)) {
                    val server = createServerCandidate(savedBaseUrl, fallback = false, forceReachable = true)
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
        discoveryExecutor?.shutdownNow()
        discoveryExecutor = null
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
        val servers = discoverMusicalServers()
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

    private fun discoverMusicalServers(): List<DiscoveredServer> {
        val hosts = subnetCandidates()
        if (hosts.isEmpty()) return emptyList()

        val executor = Executors.newFixedThreadPool(DISCOVERY_THREADS)
        discoveryExecutor = executor
        val completionService: CompletionService<DiscoveredServer?> = ExecutorCompletionService(executor)
        for (host in hosts) {
            completionService.submit(Callable {
                val baseUrl = "http://$host:$DEFAULT_SERVER_PORT"
                if (isMusicalServerReachable(baseUrl)) createServerCandidate(baseUrl, fallback = false, forceReachable = true) else null
            })
        }

        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(DISCOVERY_TOTAL_TIMEOUT_MS)
        val servers = mutableListOf<DiscoveredServer>()
        try {
            repeat(hosts.size) {
                val remainingNanos = deadline - System.nanoTime()
                if (remainingNanos <= 0) return servers
                val future = completionService.poll(remainingNanos, TimeUnit.NANOSECONDS) ?: return servers
                val server = future.get()
                if (server != null) servers.add(server)
            }
        } catch (_: Exception) {
            return servers
        } finally {
            executor.shutdownNow()
            if (discoveryExecutor === executor) discoveryExecutor = null
        }

        return servers
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
        return FireTvSubnetCandidates.subnetCandidates(localIpv4Addresses().mapNotNull { it.hostAddress })
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

    private fun createServerCandidate(baseUrl: String, fallback: Boolean, forceReachable: Boolean = false): DiscoveredServer {
        val reachable = forceReachable || isMusicalServerReachable(baseUrl)
        if (!reachable) {
            return DiscoveredServer(baseUrl, tvUrlFor(baseUrl), reachable = false, fallback = fallback)
        }

        val libraryResult = fetchRemoteLibraries(baseUrl)
        return DiscoveredServer(
            baseUrl = baseUrl,
            tvUrl = tvUrlFor(baseUrl),
            reachable = true,
            fallback = fallback,
            libraries = libraryResult.getOrElse { emptyList() },
            libraryError = libraryResult.exceptionOrNull()?.message,
        )
    }

    private fun fetchRemoteLibraries(baseUrl: String): Result<List<RemoteLibrary>> {
        val connection = try {
            URL("$baseUrl/api/tv/libraries").openConnection() as HttpURLConnection
        } catch (error: Exception) {
            return Result.failure(error)
        }

        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = DISCOVERY_CONNECT_TIMEOUT_MS
            connection.readTimeout = LIBRARY_READ_TIMEOUT_MS
            connection.useCaches = false
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                return Result.failure(IllegalStateException("HTTP ${connection.responseCode}"))
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            Result.success(FireTvLibraryParser.parseRemoteLibraries(body))
        } catch (error: Exception) {
            Result.failure(error)
        } finally {
            connection.disconnect()
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

    private fun bridgeRemoteKey(key: String) {
        val encodedKey = URLEncoder.encode(key, "UTF-8")
        val script = """
            window.dispatchEvent(new CustomEvent('musical-firetv-key', {
              detail: { key: decodeURIComponent('$encodedKey') }
            }));
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun bridgeSelectedTab() {
        val webSurface = selectedTab.webSurface ?: return
        val encodedTab = URLEncoder.encode(webSurface, "UTF-8")
        val script = """
            window.dispatchEvent(new CustomEvent('musical-firetv-tab', {
              detail: { tab: decodeURIComponent('$encodedTab') }
            }));
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun applyWebLocale(locale: String) {
        val encodedLocale = URLEncoder.encode(locale, "UTF-8")
        val script = """
            localStorage.setItem('musical.locale', decodeURIComponent('$encodedLocale'));
            window.location.reload();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
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
        private const val DEFAULT_SERVER_PORT = 1422
        private const val DISCOVERY_THREADS = 32
        private const val DISCOVERY_CONNECT_TIMEOUT_MS = 220
        private const val DISCOVERY_READ_TIMEOUT_MS = 450
        private const val LIBRARY_READ_TIMEOUT_MS = 6000
        private const val DISCOVERY_TOTAL_TIMEOUT_MS = 8500L
        private val fireTvTabs = listOf(FireTvTab.SETTINGS, FireTvTab.ALBUMS, FireTvTab.TRACKS, FireTvTab.PLAYER)
    }
}
