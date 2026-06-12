# Fire TV Voice Command Memory

## Purpose

Voice commands often refer to recent context:

- "さっきのやつを消して"
- "さっきのテレビに戻して"
- "今の曲をテレビに出して"
- "それを寝室にも表示して"

The app should resolve those references from event history rather than by adding many static attributes to every entity.

## Alexa Role

Alexa should be a short command entry point.

Alexa Skill responsibilities:

- Capture broad intent.
- Capture raw slot text.
- Send command to Cloud Command API.

Alexa should not own:

- LAN device discovery.
- Deep library search.
- Final fuzzy device resolution.
- Display session state.
- Local playback state.

## Command Flow

```txt
Echo / Alexa
  -> Alexa Skill
  -> Cloud Command API
  -> Tauri Desktop Agent
  -> local resolver / playback / display session
  -> Fire TV candidate prompt when needed
```

## Memory Event

```ts
type MemoryEvent = {
  id: string;
  time: string;
  type:
    | "device_selected"
    | "display_session_created"
    | "panel_opened"
    | "track_selected"
    | "command_executed"
    | "candidate_presented";
  entities: EntityRef[];
  summary: string;
  salience: number;
};
```

## Entity Reference

```ts
type EntityRef = {
  kind:
    | "device"
    | "track"
    | "playlist"
    | "display_session"
    | "view"
    | "panel"
    | "command";
  id: string;
  role: "target" | "source" | "content" | "result" | "context" | "candidate";
};
```

The role matters as much as the entity:

- "さっきのやつ" often means recent `result` or `content`.
- "さっきのテレビ" means recent target `device`.
- "さっき選んだやつ" means recent selected `candidate`.

## Example Event

```json
{
  "id": "evt_001",
  "time": "2026-06-10T17:20:10+09:00",
  "type": "display_session_created",
  "summary": "リビングのFire TVにNow Playing画面を表示した",
  "entities": [
    { "kind": "device", "id": "firetv_living_01", "role": "target" },
    { "kind": "display_session", "id": "sess_abc", "role": "result" },
    { "kind": "view", "id": "now_playing", "role": "content" }
  ],
  "salience": 0.9
}
```

## Reference Resolution

Initial scoring:

```ts
score =
  recencyScore * 0.4
  + actionCompatibilityScore * 0.3
  + entityTypeScore * 0.2
  + salienceScore * 0.1;
```

Examples:

```txt
"さっきのやつを消して"
  -> prefer display_session / panel / view

"さっきのやつを寝室にも出して"
  -> prefer view / track / playlist / display_session content

"さっきのテレビに戻して"
  -> prefer device
```

## Candidate Prompt Fallback

When confidence is low, show candidates on Fire TV instead of forcing a voice-only confirmation loop.

```txt
どれを操作しますか？

1. Now Playing表示
2. 歌詞パネル
3. リビングのFire TV接続
4. 現在の曲
```

Selection options:

- Voice: "1番"
- Remote: direction keys and select
- Desktop UI: click a candidate

## SQLite Schema Candidate

```sql
CREATE TABLE memory_events (
  id TEXT PRIMARY KEY,
  time TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  salience REAL NOT NULL,
  metadata_json TEXT
);

CREATE TABLE memory_event_entities (
  event_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL
);
```

## Implementation Targets

Candidate files:

```txt
src/features/voice-command/domain/memoryEvent.ts
src/features/voice-command/domain/referenceResolver.ts
src/features/voice-command/application/recordMemoryEvent.ts
src/features/voice-command/application/resolveReference.ts
src/features/voice-command/infrastructure/memoryEventRepository.ts
```

## MVP Completion

- Display session creation records a MemoryEvent.
- Candidate prompt presentation records a MemoryEvent.
- Reference resolver can rank recent devices, views, sessions, and tracks.
- Low-confidence resolution returns candidates rather than one forced answer.

