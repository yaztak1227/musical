package app.musical.firetv

import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.Collections
import java.util.concurrent.Callable
import java.util.concurrent.CompletionService
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal class FireTvDiscoveryRepository {
    private var discoveryExecutor: ExecutorService? = null

    fun shutdown() {
        discoveryExecutor?.shutdownNow()
        discoveryExecutor = null
    }

    fun discoverMusicalServers(): List<DiscoveredServer> {
        val hosts = subnetCandidates()
        if (hosts.isEmpty()) return emptyList()

        val executor = Executors.newFixedThreadPool(DISCOVERY_THREADS)
        discoveryExecutor = executor
        val completionService: CompletionService<DiscoveredServer?> = ExecutorCompletionService(executor)
        for (host in hosts) {
            completionService.submit(Callable {
                val baseUrl = "http://$host:$DEFAULT_SERVER_PORT"
                if (isMusicalServerReachable(baseUrl)) {
                    createServerCandidate(baseUrl, fallback = false, forceReachable = true)
                } else {
                    null
                }
            })
        }

        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(DISCOVERY_TOTAL_TIMEOUT_MS)
        val servers = mutableListOf<DiscoveredServer>()
        try {
            repeat(hosts.size) {
                val remainingNanos = deadline - System.nanoTime()
                if (remainingNanos <= 0) return servers
                val future = completionService.poll(remainingNanos, TimeUnit.NANOSECONDS) ?: return servers
                val server = future.get()
                if (server != null) servers.add(server)
            }
        } catch (_: Exception) {
            return servers
        } finally {
            executor.shutdownNow()
            if (discoveryExecutor === executor) discoveryExecutor = null
        }

        return servers
    }

    fun createServerCandidate(
        baseUrl: String,
        fallback: Boolean,
        forceReachable: Boolean = false,
    ): DiscoveredServer {
        val reachable = forceReachable || isMusicalServerReachable(baseUrl)
        if (!reachable) {
            return DiscoveredServer(baseUrl, FireTvUrlHelpers.tvUrlFor(baseUrl), reachable = false, fallback = fallback)
        }

        val libraryResult = fetchRemoteLibraries(baseUrl)
        return DiscoveredServer(
            baseUrl = baseUrl,
            tvUrl = FireTvUrlHelpers.tvUrlFor(baseUrl),
            reachable = true,
            fallback = fallback,
            libraries = libraryResult.getOrElse { emptyList() },
            libraryError = libraryResult.exceptionOrNull()?.message,
        )
    }

    fun isMusicalServerReachable(baseUrl: String): Boolean {
        val connection = try {
            URL("$baseUrl/api/app_status").openConnection() as HttpURLConnection
        } catch (_: Exception) {
            return false
        }

        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = DISCOVERY_CONNECT_TIMEOUT_MS
            connection.readTimeout = DISCOVERY_READ_TIMEOUT_MS
            connection.useCaches = false
            val body = if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                ""
            }
            body.contains("Musical desktop bridge is ready")
        } catch (_: Exception) {
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun fetchRemoteLibraries(baseUrl: String): Result<List<RemoteLibrary>> {
        val connection = try {
            URL("$baseUrl/api/tv/libraries").openConnection() as HttpURLConnection
        } catch (error: Exception) {
            return Result.failure(error)
        }

        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = DISCOVERY_CONNECT_TIMEOUT_MS
            connection.readTimeout = LIBRARY_READ_TIMEOUT_MS
            connection.useCaches = false
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                return Result.failure(IllegalStateException("HTTP ${connection.responseCode}"))
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            Result.success(FireTvLibraryParser.parseRemoteLibraries(body))
        } catch (error: Exception) {
            Result.failure(error)
        } finally {
            connection.disconnect()
        }
    }

    private fun subnetCandidates(): List<String> {
        return FireTvSubnetCandidates.subnetCandidates(localIpv4Addresses().mapNotNull { it.hostAddress })
    }

    private fun localIpv4Addresses(): List<Inet4Address> {
        val addresses = mutableListOf<Inet4Address>()
        val interfaces = try {
            Collections.list(NetworkInterface.getNetworkInterfaces())
        } catch (_: Exception) {
            return addresses
        }

        for (networkInterface in interfaces) {
            if (!networkInterface.isUp || networkInterface.isLoopback) continue
            for (address in Collections.list(networkInterface.inetAddresses)) {
                if (address is Inet4Address && !address.isLoopbackAddress && address.isSiteLocalAddress) {
                    addresses.add(address)
                }
            }
        }
        return addresses
    }

    companion object {
        private const val DEFAULT_SERVER_PORT = 1422
        private const val DISCOVERY_THREADS = 32
        private const val DISCOVERY_CONNECT_TIMEOUT_MS = 220
        private const val DISCOVERY_READ_TIMEOUT_MS = 450
        private const val LIBRARY_READ_TIMEOUT_MS = 6000
        private const val DISCOVERY_TOTAL_TIMEOUT_MS = 8500L
    }
}
