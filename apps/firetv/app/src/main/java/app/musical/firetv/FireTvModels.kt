package app.musical.firetv

internal data class DiscoveredServer(
    val baseUrl: String,
    val tvUrl: String,
    val reachable: Boolean,
    val fallback: Boolean = false,
    val libraries: List<RemoteLibrary> = emptyList(),
    val libraryError: String? = null,
)

internal data class RemoteLibrary(
    val id: String,
    val name: String,
    val path: String?,
    val albumCount: Int,
    val trackCount: Int,
)

internal data class RestoredLibrarySelection(
    val serverBaseUrl: String,
    val libraryId: String,
    val libraryName: String,
)
