# Fire TV Device Registry

## Purpose

The Device Registry keeps known display targets and supports fuzzy device resolution for voice and UI commands.

Example commands:

- "リビングに表示して"
- "テレビにつないで"
- "大きい方に出して"
- "さっきのテレビに戻して"

## Device Model

```ts
type DisplayDevice = {
  id: string;
  displayName: string;
  aliases: string[];
  kind: "firetv" | "browser" | "desktop" | "speaker";
  room?: string;
  online: boolean;
  lastUsedAt?: string;
  metadata?: Record<string, unknown>;
};
```

## Alias Model

```ts
type DeviceAlias = {
  deviceId: string;
  alias: string;
  source: "user" | "history" | "discovery" | "system";
  weight: number;
  createdAt: string;
  updatedAt: string;
};
```

Alias examples:

- リビング
- テレビ
- 居間
- メインテレビ
- Fire TV 4K Max
- 大きいテレビ

## Resolution Order

Use deterministic signals first. Semantic search is a later enhancement.

```txt
1. Normalize query
2. Exact alias match
3. Exact display name match
4. Partial match
5. Fuzzy search
6. Recency and online score adjustment
7. Semantic search
```

## Scoring

Initial scoring candidate:

```ts
score =
  aliasScore * 0.45
  + fuzzyScore * 0.25
  + recencyScore * 0.15
  + availabilityScore * 0.15;
```

Later semantic scoring candidate:

```ts
score =
  semanticScore * 0.55
  + aliasScore * 0.25
  + recencyScore * 0.10
  + availabilityScore * 0.10;
```

## MVP Search

For tens of devices, fuzzy search is enough.

```ts
const fuse = new Fuse(devices, {
  keys: ["displayName", "aliases", "room", "kind"],
  threshold: 0.35,
});
```

## Learning

If a user repeatedly resolves a phrase to a device, create or update a history alias.

```txt
alias: 大きいテレビ
device: firetv_living_01
source: history
weight: 0.8
```

History aliases should be visible and removable later.

## SQLite Schema Candidate

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  type TEXT NOT NULL,
  room TEXT,
  status TEXT NOT NULL,
  last_used_at TEXT,
  metadata_json TEXT
);

CREATE TABLE device_aliases (
  device_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  source TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, alias)
);

CREATE TABLE device_embeddings (
  device_id TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, text)
);
```

## Implementation Targets

Candidate files:

```txt
src/features/devices/domain/deviceRegistry.ts
src/features/devices/domain/deviceResolver.ts
src/features/devices/application/resolveDisplayDevice.ts
src/features/devices/infrastructure/deviceRegistryRepository.ts
src-tauri/src/device_registry.rs
```

## MVP Completion

- Devices can be listed and updated.
- Aliases are searchable.
- Fuzzy resolver returns ranked candidates.
- `lastUsedAt` and `online` adjust ranking.
- Unresolved or low-confidence queries can trigger a TV candidate prompt.

