package app.musical.firetv

import org.json.JSONObject

internal object FireTvLibraryParser {
    fun parseRemoteLibraries(body: String): List<RemoteLibrary> {
        val librariesJson = JSONObject(body).optJSONArray("libraries") ?: return emptyList()
        val libraries = mutableListOf<RemoteLibrary>()
        for (index in 0 until librariesJson.length()) {
            val item = librariesJson.optJSONObject(index) ?: continue
            val id = item.optString("id").takeIf { it.isNotBlank() } ?: continue
            libraries.add(
                RemoteLibrary(
                    id = id,
                    name = item.optString("name").takeIf { it.isNotBlank() } ?: id,
                    path = item.optString("path").takeIf { it.isNotBlank() },
                    albumCount = item.optInt("albumCount", 0),
                    trackCount = item.optInt("trackCount", 0),
                ),
            )
        }
        return libraries
    }
}
