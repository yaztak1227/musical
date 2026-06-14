package app.musical.firetv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FireTvSubnetCandidatesTest {
    @Test
    fun subnetCandidatesBuildsLanHostRangeAndExcludesOwnAddress() {
        val candidates = FireTvSubnetCandidates.subnetCandidates(listOf("192.168.1.82"))

        assertEquals(253, candidates.size)
        assertEquals("192.168.1.1", candidates.first())
        assertEquals("192.168.1.254", candidates.last())
        assertFalse(candidates.contains("192.168.1.82"))
    }

    @Test
    fun subnetCandidatesDeduplicatesMultipleInterfacesOnSameSubnet() {
        val candidates = FireTvSubnetCandidates.subnetCandidates(listOf("192.168.1.82", "192.168.1.83"))

        assertEquals(254, candidates.size)
        assertTrue(candidates.contains("192.168.1.82"))
        assertTrue(candidates.contains("192.168.1.83"))
    }

    @Test
    fun subnetCandidatesIgnoresMalformedAddresses() {
        val candidates = FireTvSubnetCandidates.subnetCandidates(listOf("not-an-ip", "10.0.0.3"))

        assertEquals(253, candidates.size)
        assertTrue(candidates.contains("10.0.0.1"))
        assertFalse(candidates.contains("10.0.0.3"))
    }
}
