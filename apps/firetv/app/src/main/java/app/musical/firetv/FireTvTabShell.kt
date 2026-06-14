package app.musical.firetv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

internal class FireTvTabShell(
    context: Context,
    private val onSelectTab: (FireTvTab) -> Unit,
) {
    val view: LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(48, 22, 48, 0)
        background = FireTvTheme.navBarBackground()
        isFocusable = true
        isFocusableInTouchMode = true
    }

    private val tabButtons = mutableMapOf<FireTvTab, TextView>()

    init {
        for (tab in fireTvTabs) {
            val tabButton = TextView(context).apply {
                text = tab.title
                textSize = 20f
                setTextColor(Color.WHITE)
                gravity = android.view.Gravity.CENTER
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(20, 18, 20, 20)
                isFocusable = false
                setOnClickListener { onSelectTab(tab) }
            }
            tabButtons[tab] = tabButton
            view.addView(
                tabButton,
                LinearLayout.LayoutParams(0, 84, 1f),
            )
        }
    }

    fun moveFocusedTab(focusedTab: FireTvTab, delta: Int): FireTvTab {
        val currentIndex = fireTvTabs.indexOf(focusedTab)
        return fireTvTabs[(currentIndex + delta + fireTvTabs.size) % fireTvTabs.size]
    }

    fun requestFocus() {
        view.requestFocus()
    }

    fun updateStyles(
        selectedTab: FireTvTab,
        focusedTab: FireTvTab,
        isWebSurfaceFocused: Boolean,
        isSettingsContentFocused: Boolean,
    ) {
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
                    isSelected -> FireTvTheme.onPlayerColor()
                    else -> Color.rgb(206, 186, 188)
                },
            )
            button.background = FireTvTheme.tabBackground(isSelected, isFocused && !isWebSurfaceFocused)
        }
    }
}
