package app.musical.firetv

import org.junit.Assert.assertEquals
import org.junit.Test

class FireTvUrlHelpersTest {
    @Test
    fun serverBaseUrlKeepsSchemeHostAndPort() {
        assertEquals(
            "http://192.168.1.82:1422",
            FireTvUrlHelpers.serverBaseUrl("http://192.168.1.82:1422/tv?libraryId=main"),
        )
    }

    @Test
    fun serverBaseUrlFallsBackForPlainUrlLikeValues() {
        assertEquals(
            "musical.local",
            FireTvUrlHelpers.serverBaseUrl("musical.local/tv"),
        )
    }

    @Test
    fun tvUrlForTrimsTrailingSlash() {
        assertEquals(
            "http://192.168.1.82:1422/tv",
            FireTvUrlHelpers.tvUrlFor("http://192.168.1.82:1422/"),
        )
    }

    @Test
    fun displayUrlForReturnsTvUrlWhenLibraryIdIsBlank() {
        assertEquals(
            "http://192.168.1.82:1422/tv",
            FireTvUrlHelpers.displayUrlFor("http://192.168.1.82:1422/tv", ""),
        )
    }

    @Test
    fun displayUrlForAppendsEncodedLibraryId() {
        assertEquals(
            "http://192.168.1.82:1422/tv?libraryId=family%20room%2Fmain",
            FireTvUrlHelpers.displayUrlFor("http://192.168.1.82:1422/tv", "family room/main"),
        )
    }

    @Test
    fun displayUrlForPreservesExistingQueryAndFragment() {
        assertEquals(
            "http://192.168.1.82:1422/tv?mode=remote&libraryId=main%3F1#now",
            FireTvUrlHelpers.displayUrlFor("http://192.168.1.82:1422/tv?mode=remote#now", "main?1"),
        )
    }
}
