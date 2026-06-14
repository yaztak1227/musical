package app.musical.firetv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FireTvSelectionPolicyTest {
    @Test
    fun restoreSelectedLibraryReturnsMatchingServerAndLibrary() {
        val selection = FireTvSelectionPolicy.restoreSelectedLibrary(
            savedLibraryId = "secondary",
            servers = listOf(
                discoveredServer(
                    baseUrl = "http://192.168.1.20:1422",
                    libraries = listOf(remoteLibrary("main", "Main")),
                ),
                discoveredServer(
                    baseUrl = "http://192.168.1.82:1422",
                    libraries = listOf(remoteLibrary("secondary", "Secondary")),
                ),
            ),
        )

        requireNotNull(selection)
        assertEquals("http://192.168.1.82:1422", selection.serverBaseUrl)
        assertEquals("secondary", selection.libraryId)
        assertEquals("Secondary", selection.libraryName)
    }

    @Test
    fun restoreSelectedLibraryReturnsNullWhenSavedLibraryIsMissing() {
        val selection = FireTvSelectionPolicy.restoreSelectedLibrary(
            savedLibraryId = "gone",
            servers = listOf(
                discoveredServer(
                    baseUrl = "http://192.168.1.82:1422",
                    libraries = listOf(remoteLibrary("main", "Main")),
                ),
            ),
        )

        assertNull(selection)
    }

    @Test
    fun restoreSelectedLibraryReturnsNullForBlankSavedId() {
        assertNull(FireTvSelectionPolicy.restoreSelectedLibrary("", emptyList()))
    }

    private fun discoveredServer(baseUrl: String, libraries: List<RemoteLibrary>): DiscoveredServer =
        DiscoveredServer(
            baseUrl = baseUrl,
            tvUrl = FireTvUrlHelpers.tvUrlFor(baseUrl),
            reachable = true,
            libraries = libraries,
        )

    private fun remoteLibrary(id: String, name: String): RemoteLibrary =
        RemoteLibrary(
            id = id,
            name = name,
            path = null,
            albumCount = 0,
            trackCount = 0,
        )
}
