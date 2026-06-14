package app.musical.firetv

import android.net.Uri

internal object FireTvIntentResolver {
    fun resolveExplicitDisplayUrl(data: Uri?, extraUrl: String?): String? {
        if (!extraUrl.isNullOrBlank()) return extraUrl
        val deepLinkUrl = data?.getQueryParameter("url")
        if (!deepLinkUrl.isNullOrBlank()) return deepLinkUrl
        return null
    }
}
