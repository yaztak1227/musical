package app.musical.firetv

internal object FireTvSelectionPolicy {
    fun restoreSelectedLibrary(
        savedLibraryId: String?,
        servers: List<DiscoveredServer>,
    ): RestoredLibrarySelection? {
        if (savedLibraryId.isNullOrBlank()) return null

        val savedLibrary = servers.asSequence()
            .flatMap { server -> server.libraries.asSequence().map { library -> server to library } }
            .firstOrNull { (_, library) -> library.id == savedLibraryId }
            ?: return null

        return RestoredLibrarySelection(
            serverBaseUrl = savedLibrary.first.baseUrl,
            libraryId = savedLibrary.second.id,
            libraryName = savedLibrary.second.name,
        )
    }
}
