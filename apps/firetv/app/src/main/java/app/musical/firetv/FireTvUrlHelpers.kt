package app.musical.firetv

import java.net.URI
import java.net.URLEncoder

internal object FireTvUrlHelpers {
    fun serverBaseUrl(url: String): String {
        val uri = try {
            URI(url)
        } catch (_: Exception) {
            return url.removeSuffix("/tv")
        }

        val scheme = uri.scheme ?: "http"
        val host = uri.host ?: return url.removeSuffix("/tv")
        val port = if (uri.port > 0) ":${uri.port}" else ""
        return "$scheme://$host$port"
    }

    fun tvUrlFor(baseUrl: String): String = "${baseUrl.trimEnd('/')}/tv"

    fun displayUrlFor(tvUrl: String, libraryId: String?): String {
        if (libraryId.isNullOrBlank()) return tvUrl

        val fragmentIndex = tvUrl.indexOf('#')
        val urlWithoutFragment = if (fragmentIndex >= 0) tvUrl.substring(0, fragmentIndex) else tvUrl
        val fragment = if (fragmentIndex >= 0) tvUrl.substring(fragmentIndex) else ""
        val separator = if (urlWithoutFragment.contains('?')) "&" else "?"
        return "$urlWithoutFragment${separator}libraryId=${encodeQueryValue(libraryId)}$fragment"
    }

    private fun encodeQueryValue(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}
