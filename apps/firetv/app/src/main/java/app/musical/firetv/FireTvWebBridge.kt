package app.musical.firetv

import android.webkit.WebView
import java.net.URLEncoder

internal class FireTvWebBridge(
    private val webView: WebView,
) {
    fun remoteKey(key: String) {
        val encodedKey = URLEncoder.encode(key, "UTF-8")
        val script = """
            window.dispatchEvent(new CustomEvent('musical-firetv-key', {
              detail: { key: decodeURIComponent('$encodedKey') }
            }));
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    fun selectedTab(tab: FireTvTab) {
        val webSurface = tab.webSurface ?: return
        val encodedTab = URLEncoder.encode(webSurface, "UTF-8")
        val script = """
            window.dispatchEvent(new CustomEvent('musical-firetv-tab', {
              detail: { tab: decodeURIComponent('$encodedTab') }
            }));
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    fun applyLocale(locale: String) {
        val encodedLocale = URLEncoder.encode(locale, "UTF-8")
        val script = """
            localStorage.setItem('musical.locale', decodeURIComponent('$encodedLocale'));
            window.location.reload();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }
}
