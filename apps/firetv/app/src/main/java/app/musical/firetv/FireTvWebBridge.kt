package app.musical.firetv

import android.webkit.WebView
import android.webkit.ValueCallback
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

    fun memoryDiagnostics(usedMb: Long, totalMb: Long, maxMb: Long, availableMb: Long?) {
        val available = availableMb?.let { """, availableMb: $it""" } ?: ""
        val script = """
            window.dispatchEvent(new CustomEvent('musical-firetv-diagnostics', {
              detail: {
                memory: {
                  usedMb: $usedMb,
                  totalMb: $totalMb,
                  maxMb: $maxMb$available
                }
              }
            }));
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    fun shutdownPlayer(callback: ValueCallback<String>? = null) {
        val script = """
            (() => {
              const audioElements = Array.from(document.querySelectorAll('audio'));
              let pausedCount = 0;
              let clearedCount = 0;
              for (const audio of audioElements) {
                try {
                  audio.pause();
                  pausedCount += 1;
                } catch (_) {}
                try {
                  audio.removeAttribute('src');
                  while (audio.firstChild) audio.removeChild(audio.firstChild);
                  audio.load();
                  clearedCount += 1;
                } catch (_) {}
              }
              window.dispatchEvent(new CustomEvent('musical-firetv-player-shutdown', {
                detail: {
                  audioCount: audioElements.length,
                  pausedCount,
                  clearedCount
                }
              }));
              return JSON.stringify({
                audioCount: audioElements.length,
                pausedCount,
                clearedCount,
                destroyed: audioElements.length === clearedCount
              });
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, callback)
    }
}
