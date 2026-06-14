package app.musical.firetv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FireTvLibraryParserTest {
    @Test
    fun parseRemoteLibrariesReadsCompleteItems() {
        val libraries = FireTvLibraryParser.parseRemoteLibraries(
            """
            {
              "libraries": [
                {
                  "id": "main",
                  "name": "Main Library",
                  "path": "/music",
                  "albumCount": 42,
                  "trackCount": 900
                }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(1, libraries.size)
        assertEquals("main", libraries[0].id)
        assertEquals("Main Library", libraries[0].name)
        assertEquals("/music", libraries[0].path)
        assertEquals(42, libraries[0].albumCount)
        assertEquals(900, libraries[0].trackCount)
    }

    @Test
    fun parseRemoteLibrariesSkipsItemsWithoutIdAndDefaultsOptionalFields() {
        val libraries = FireTvLibraryParser.parseRemoteLibraries(
            """
            {
              "libraries": [
                { "name": "Missing id" },
                { "id": "portable" }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(1, libraries.size)
        assertEquals("portable", libraries[0].id)
        assertEquals("portable", libraries[0].name)
        assertNull(libraries[0].path)
        assertEquals(0, libraries[0].albumCount)
        assertEquals(0, libraries[0].trackCount)
    }

    @Test
    fun parseRemoteLibrariesTreatsMissingLibrariesArrayAsEmpty() {
        assertEquals(emptyList<RemoteLibrary>(), FireTvLibraryParser.parseRemoteLibraries("{}"))
    }
}
