package app.musical.firetv

internal enum class FireTvTab(val title: String, val webSurface: String?) {
    SETTINGS("Settings", null),
    ALBUMS("Albums", "albums"),
    TRACKS("Tracks", "tracks"),
    PLAYER("Player", "player"),
}

internal val fireTvTabs = listOf(
    FireTvTab.SETTINGS,
    FireTvTab.ALBUMS,
    FireTvTab.TRACKS,
    FireTvTab.PLAYER,
)
