package app.musical.firetv

import android.content.Context
import android.graphics.Typeface
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

internal class FireTvSplashOverlay(
    private val context: Context,
) {
    fun create(): View {
        val splash = FrameLayout(context).apply {
            setBackgroundColor(FireTvTheme.playerStrongColor())
            isClickable = true
            isFocusable = true
            scaleX = 0.96f
            scaleY = 0.96f
            elevation = 1000f
            translationZ = 1000f
        }
        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
        }
        val icon = TextView(context).apply {
            text = "M"
            textSize = 44f
            gravity = android.view.Gravity.CENTER
            setTextColor(FireTvTheme.playerStrongColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            background = FireTvTheme.splashIconBackground()
        }
        val brand = TextView(context).apply {
            text = context.getString(R.string.app_name).removeSuffix(" TV")
            textSize = 34f
            letterSpacing = 0.02f
            setTextColor(FireTvTheme.onPlayerColor())
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = android.view.Gravity.CENTER
            setPadding(0, 18, 0, 0)
        }
        content.addView(icon, LinearLayout.LayoutParams(112, 112))
        content.addView(brand, LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        splash.addView(
            content,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                android.view.Gravity.CENTER,
            ),
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

    fun hide(splash: View) {
        splash.animate()
            .alpha(0f)
            .scaleX(1.03f)
            .scaleY(1.03f)
            .setDuration(220)
            .withEndAction { (splash.parent as? FrameLayout)?.removeView(splash) }
            .start()
    }
}
