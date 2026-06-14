package app.musical.firetv

internal object FireTvSubnetCandidates {
    fun subnetCandidates(localIpv4HostAddresses: List<String>): List<String> {
        val candidates = linkedSetOf<String>()
        for (address in localIpv4HostAddresses) {
            val octets = address.split('.')
            if (octets.size != 4 || octets.any { it.toIntOrNull() == null }) continue
            val prefix = "${octets[0]}.${octets[1]}.${octets[2]}"
            for (host in 1..254) {
                val candidate = "$prefix.$host"
                if (candidate != address) candidates.add(candidate)
            }
        }
        return candidates.toList()
    }
}
