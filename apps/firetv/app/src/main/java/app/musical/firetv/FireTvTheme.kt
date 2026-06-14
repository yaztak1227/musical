package app.musical.firetv

import android.graphics.Color
import android.graphics.drawable.GradientDrawable

internal object FireTvTheme {
    fun playerStrongColor(): Int = Color.rgb(58, 14, 18)

    fun onPlayerColor(): Int = Color.rgb(255, 247, 244)

    fun navBarBackground(): GradientDrawable =
        GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(Color.rgb(63, 15, 18), Color.rgb(84, 19, 22), Color.rgb(48, 13, 18)),
        ).apply {
            setStroke(0, Color.TRANSPARENT)
        }

    fun splashIconBackground(): GradientDrawable =
        GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(onPlayerColor(), Color.rgb(244, 188, 184)),
        ).apply {
            shape = GradientDrawable.OVAL
            setStroke(3, Color.argb(190, 255, 255, 255))
        }

    fun tabBackground(selected: Boolean, focused: Boolean): GradientDrawable =
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

    fun outlinedControlBackground(focused: Boolean): GradientDrawable =
        roundedBackground(
            fillColor = if (focused) Color.argb(82, 244, 222, 218) else Color.TRANSPARENT,
            strokeColor = if (focused) Color.WHITE else Color.argb(178, 244, 222, 218),
            strokeWidth = if (focused) 4 else 2,
            radius = 28f,
        )

    fun libraryControlBackground(selected: Boolean, focused: Boolean): GradientDrawable =
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

    fun languageControlBackground(selected: Boolean, focused: Boolean): GradientDrawable =
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
}
