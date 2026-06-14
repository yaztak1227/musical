package app.musical.firetv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

internal data class FireTvSettingsState(
    val discoveryStatus: String,
    val discoveredServers: List<DiscoveredServer>,
    val selectedServerBaseUrl: String?,
    val selectedLibraryId: String?,
    val selectedLibraryName: String?,
    val selectedLocale: String,
)

internal class FireTvSettingsPanel(
    private val context: Context,
    private val onRescan: () -> Unit,
    private val onSelectLibrary: (DiscoveredServer, RemoteLibrary) -> Unit,
    private val onSelectLocale: (String) -> Unit,
) {
    lateinit var view: ScrollView
        private set

    private lateinit var settingsStatusView: TextView
    private lateinit var serverListView: LinearLayout
    private lateinit var libraryListView: LinearLayout
    private lateinit var languageListView: LinearLayout
    private lateinit var selectedLibraryView: TextView
    private lateinit var rescanButton: Button

    fun createView(): ScrollView {
        val panel = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(56, 48, 56, 56)
        }

        val title = TextView(context).apply {
            text = context.getString(R.string.settings_title)
            textSize = 30f
            setTextColor(Color.WHITE)
        }
        settingsStatusView = TextView(context).apply {
            textSize = 19f
            setTextColor(Color.rgb(214, 222, 236))
            setPadding(0, 12, 0, 28)
        }
        rescanButton = Button(context).apply {
            text = context.getString(R.string.settings_rescan)
            textSize = 18f
            setAllCaps(false)
            setTextColor(FireTvTheme.onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minWidth = 320
            minHeight = 78
            setPadding(28, 0, 28, 0)
            background = FireTvTheme.outlinedControlBackground(focused = false)
            setOnFocusChangeListener { control, hasFocus ->
                control.background = FireTvTheme.outlinedControlBackground(focused = hasFocus)
            }
            setOnClickListener { onRescan() }
        }

        serverListView = verticalList(top = 28, bottom = 18)
        libraryListView = verticalList(top = 20, bottom = 18)
        languageListView = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 20, 0, 18)
        }
        selectedLibraryView = TextView(context).apply {
            textSize = 18f
            setTextColor(Color.rgb(228, 234, 245))
            setPadding(0, 12, 0, 0)
        }

        panel.addView(title)
        panel.addView(settingsStatusView)
        panel.addView(rescanButton, LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        panel.addView(sectionHeading(context.getString(R.string.settings_servers)))
        panel.addView(serverListView)
        panel.addView(sectionHeading(context.getString(R.string.settings_libraries)))
        panel.addView(libraryListView)
        panel.addView(selectedLibraryView)
        panel.addView(sectionHeading(context.getString(R.string.settings_language)))
        panel.addView(languageListView)

        view = ScrollView(context).apply {
            isFocusable = true
            isFocusableInTouchMode = true
            visibility = View.GONE
            addView(panel)
        }
        return view
    }

    fun update(state: FireTvSettingsState, refocus: Boolean) {
        settingsStatusView.text = state.discoveryStatus.ifBlank {
            context.getString(R.string.settings_status_idle)
        }
        serverListView.removeAllViews()
        libraryListView.removeAllViews()
        languageListView.removeAllViews()

        renderServers(state.discoveredServers)
        renderLibraries(state)
        selectedLibraryView.text = context.getString(
            R.string.settings_selected_library,
            state.selectedLibraryName ?: context.getString(R.string.settings_no_library_selected),
        )
        languageListView.addView(languageButton("en", context.getString(R.string.settings_language_english), state.selectedLocale))
        languageListView.addView(languageButton("ja", context.getString(R.string.settings_language_japanese), state.selectedLocale))

        if (refocus) view.post { focusDefault(state) }
    }

    fun focusDefault(state: FireTvSettingsState? = null) {
        val selectedLibrary = state?.let {
            findLibraryButton(it.selectedServerBaseUrl, it.selectedLibraryId)
        }
        (selectedLibrary ?: firstFocusableChild(libraryListView) ?: rescanButton).requestFocus()
    }

    fun clearFocus() {
        view.findFocus()?.clearFocus()
    }

    fun clickFocusedItem(currentFocus: View?, contentFocus: View?): Boolean {
        val candidates = listOfNotNull(view.findFocus(), contentFocus, currentFocus)
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

    private fun renderServers(servers: List<DiscoveredServer>) {
        if (servers.isEmpty()) {
            serverListView.addView(settingsLine(context.getString(R.string.settings_no_servers)))
            return
        }

        for (server in servers) {
            serverListView.addView(settingsLine(server.baseUrl))
            serverListView.addView(settingsLine(context.getString(R.string.settings_tv_url, server.tvUrl)))
            if (server.fallback) serverListView.addView(settingsLine(context.getString(R.string.settings_fallback_active)))
            if (!server.reachable) serverListView.addView(settingsLine(context.getString(R.string.settings_server_unreachable)))
        }
    }

    private fun renderLibraries(state: FireTvSettingsState) {
        val reachableServers = state.discoveredServers.filter { it.reachable }
        if (reachableServers.isEmpty()) {
            libraryListView.addView(settingsLine(context.getString(R.string.settings_no_libraries)))
            return
        }

        for (server in reachableServers) {
            when {
                server.libraryError != null -> {
                    libraryListView.addView(settingsLine(context.getString(R.string.settings_library_fetch_failed, server.baseUrl)))
                    libraryListView.addView(settingsLine(server.libraryError))
                }
                server.libraries.isEmpty() -> {
                    libraryListView.addView(settingsLine(context.getString(R.string.settings_no_libraries)))
                }
                else -> {
                    for (library in server.libraries) {
                        libraryListView.addView(libraryButton(server, library, state))
                    }
                }
            }
        }
    }

    private fun libraryButton(
        server: DiscoveredServer,
        library: RemoteLibrary,
        state: FireTvSettingsState,
    ): Button =
        Button(context).apply {
            val selected = library.id == state.selectedLibraryId && server.baseUrl == state.selectedServerBaseUrl
            text = if (selected) {
                context.getString(R.string.settings_library_selected_item, library.name, library.albumCount, library.trackCount)
            } else {
                context.getString(R.string.settings_library_item, library.name, library.albumCount, library.trackCount)
            }
            textSize = 18f
            setTag(R.id.fire_tv_server_base_url, server.baseUrl)
            setTag(R.id.fire_tv_library_id, library.id)
            setAllCaps(false)
            setTextColor(FireTvTheme.onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(24, 0, 24, 0)
            background = FireTvTheme.libraryControlBackground(selected = selected, focused = false)
            setOnFocusChangeListener { control, hasFocus ->
                control.setPadding(if (hasFocus) 32 else 24, 0, 24, 0)
                control.background = FireTvTheme.libraryControlBackground(selected = selected, focused = hasFocus)
            }
            setOnClickListener { onSelectLibrary(server, library) }
        }

    private fun languageButton(locale: String, label: String, selectedLocale: String): Button =
        Button(context).apply {
            val selected = locale == selectedLocale
            text = if (selected) context.getString(R.string.settings_language_selected, label) else label
            textSize = 18f
            setTag(R.id.fire_tv_locale, locale)
            setAllCaps(false)
            setTextColor(FireTvTheme.onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minWidth = 220
            minHeight = 72
            setPadding(24, 0, 24, 0)
            background = FireTvTheme.languageControlBackground(selected = selected, focused = false)
            setOnFocusChangeListener { control, hasFocus ->
                control.background = FireTvTheme.languageControlBackground(selected = selected, focused = hasFocus)
            }
            setOnClickListener { onSelectLocale(locale) }
            val margin = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            margin.setMargins(0, 0, 18, 0)
            layoutParams = margin
        }

    private fun sectionHeading(text: String): TextView =
        TextView(context).apply {
            this.text = text
            textSize = 22f
            setTextColor(Color.WHITE)
            setPadding(0, 30, 0, 8)
        }

    private fun settingsLine(text: String): TextView =
        TextView(context).apply {
            this.text = text
            textSize = 18f
            setTextColor(Color.rgb(210, 218, 232))
            setPadding(0, 7, 0, 7)
        }

    private fun verticalList(top: Int, bottom: Int): LinearLayout =
        LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, top, 0, bottom)
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

    private fun firstFocusableChild(container: LinearLayout): View? {
        for (index in 0 until container.childCount) {
            val child = container.getChildAt(index)
            if (child.isFocusable) return child
        }
        return null
    }
}
