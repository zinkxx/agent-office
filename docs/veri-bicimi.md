# Claude Code kayıt biçimi (Ajan Ofisi için)

> 19.11.2026'da bu bilgisayardaki 47 kayıt dosyası (6 proje, ana oturumlar + alt ajanlar) taranarak çıkarıldı.
> Resmi, belgelenmiş bir arayüz değildir; Claude Code sürümüyle değişebilir. Okuyucu tanımadığı her şeyi atlamalı.
> Bu belgede gerçek içerik yoktur; yalnızca alan adları ve yapı vardır.

## 1. Canlı oturumlar: `~/.claude/sessions/<pid>.json`

```jsonc
{
  "pid": 4860,
  "sessionId": "…uuid…", // projects/<klasör>/<sessionId>.jsonl ile eşleşir
  "cwd": "/Users/…/Desktop/Atlas",
  "name": "atlas-29", // ajanların birbirine mesaj attığı ad
  "kind": "interactive",
  "entrypoint": "cli", // "cli" = terminal, "claude-vscode" = VS Code
  "status": "busy", // "busy" | "idle"
  "startedAt": 1795113896702, // ms
  "updatedAt": 1795114308054,
  "statusUpdatedAt": 1795114308054,
  "version": "…",
  "peerProtocol": 1,
  "peerFeatures": [],
  "messagingSocketPath": "…", // kullanılmaz
}
```

- Yanındaki `<pid>.<hash>.key` dosyaları **asla okunmaz**.
- Süreç kapanınca dosya bir süre kalabilir: `process.kill(pid, 0)` ile canlılık kontrol edilmeli.

## 2. Oturum kaydı: `~/.claude/projects/<klasör>/<sessionId>.jsonl`

`<klasör>` = `cwd` içindeki `/` → `-` (ör. `-Users-kullanici-Desktop-Atlas`). Proje adı = yolun son parçası.
Dosyalar 40 MB'ı geçebilir; **sondan takip** edilmeli.

### 2.1 Satır türleri (`type`)

| type                                                                                  | Kullanım                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistant`                                                                           | **Ana kaynak.** `message.content[]`: `thinking`, `text`, `tool_use` blokları. `message.stop_reason`: `tool_use` (araç çağırdı, devam ediyor) / `end_turn` (sırasını bitirdi)        |
| `user`                                                                                | Kullanıcı mesajı ya da araç sonucu (`content[].type == "tool_result"`). `origin.kind`: `human` (gerçek kullanıcı), `task-notification` (arka plan işi bildirimi), yoksa araç sonucu |
| `system`                                                                              | `subtype`: `api_error`, `compact_boundary` (sohbet özetlendi), `turn_duration`, `local_command`, `informational`                                                                    |
| `ai-title`                                                                            | `aiTitle`: oturumun otomatik başlığı                                                                                                                                                |
| `attachment`                                                                          | Bağlam ekleri (`attachment.type`). Ofis için gereksiz; atlanabilir                                                                                                                  |
| `last-prompt`, `mode`, `permission-mode`, `file-history-*`, `tools-used`              | Gereksiz; atlanabilir                                                                                                                                                               |
| `session-owner`, `api-request`, `api-request-blob`, `api-request-shape`, `atis-latch` | **Gizlilik: okunmadan atlanır**                                                                                                                                                     |

Ortak alanlar: `timestamp` (ISO), `uuid`, `parentUuid`, `sessionId`, `cwd`, `isSidechain`, `version`, `entrypoint`.

### 2.2 `tool_use` girdileri ve ekranda gösterilecek olan

| Araç (`name`)                                                              | Girdi alanları                                           | Ekranda                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `Read`                                                                     | `file_path`, `offset`, `limit`                           | "Okuyor · <dosya adı>"                                                |
| `Edit`                                                                     | `file_path`, `old_string`, `new_string`, `replace_all`   | "Düzenliyor · <dosya adı>"                                            |
| `Write`                                                                    | `file_path` (nadiren `path`), `content`                  | "Yazıyor · <dosya adı>"                                               |
| `NotebookEdit`                                                             | `notebook_path`                                          | "Düzenliyor · <dosya adı>"                                            |
| `Grep` / `Glob`                                                            | `pattern`, `path`                                        | "Arıyor" (desen gösterilmez)                                          |
| `Bash`                                                                     | `command`, `description`, `timeout`, `run_in_background` | "Terminal" (`command` ve `description` serbest metindir, gösterilmez) |
| `WebSearch` / `WebFetch`                                                   | `query` / `url`                                          | "Web'de arıyor"                                                       |
| `Agent` (eski adı `Task`)                                                  | `description`, `subagent_type`, `prompt`                 | "Görev dağıtıyor" → alt ajan doğar                                    |
| `Workflow`                                                                 | `script`, `scriptPath`                                   | "İş akışı yürütüyor" → alt ajanlar `subagents/workflows/` altında     |
| `SendMessage`                                                              | `to`, `message`, `summary`                               | "Mesaj gönderiyor → <to>" (mesaj metni gösterilmez)                   |
| `AskUserQuestion`                                                          | `questions`                                              | "Sana soru soruyor" (izin/cevap bekliyor)                             |
| `Skill`                                                                    | `skill`                                                  | "Beceri kullanıyor · <skill adı>"                                     |
| Diğerleri (`ToolSearch`, `Monitor`, `TaskStop`, `Artifact`, MCP araçları…) | —                                                        | Araç adı                                                              |

- **Dosya adı** = `file_path`'in son parçası (`path.basename`). Tam yol hiçbir zaman gönderilmez.
- `__unparsedToolInput` gibi bozuk girdiler görülebilir: girdi yoksa yalnızca araç adı gösterilir.

### 2.3 Durum çıkarımı

- `assistant` + `thinking` bloğu → **düşünüyor**
- `assistant` + `tool_use` → araca göre durum (2.2), `stop_reason: tool_use`
- `assistant` + `stop_reason: end_turn` → **sırasını bitirdi** (ardından `sessions/*.json` `status: idle`)
- `AskUserQuestion` sonrası araç sonucu gelene kadar → **seni bekliyor**
- `system` `api_error` → kısa süreli **hata** simgesi
- `system` `compact_boundary` → "hafızasını topluyor" (özetleme)
- 10 dk yeni satır yok ve süreç yok → **kapalı**

## 3. Alt ajanlar: `~/.claude/projects/<klasör>/<sessionId>/subagents/**/agent-<agentId>.jsonl`

- Görülen alt klasör: `subagents/workflows/wf_<id>/` (Workflow aracıyla başlatılanlar). `Agent` aracıyla başlatılanlar
  `subagents/` altında doğrudan da olabilir; **iki durum da desteklenmeli** (`**` ile tara).
- Satırlar aynı biçimde; `isSidechain: true`, `agentId` dolu, `sessionId` = ana oturum.
- `agent-<agentId>.meta.json`: `agentType`, `description` (kısa iş tanımı), `spawnDepth` (kuşak), `isBuiltIn`,
  `workflowPhase`, `requestNonInteractive`. Karakterin adı için `description` (kısaltılmış) kullanılabilir.

## 4. Oturumlar arası mesajlar (19.11.2026'da doğrulandı)

İki canlı oturum arasında (`ajanofisi-26` → `atlas-45`) bir test mesajı gönderildi; satırlar yalnızca alan
adlarına bakılarak, içerik maskelenerek incelendi.

### 4.1 Gönderen tarafı (kendi `.jsonl` dosyası)

- `assistant` satırı, `message.content[]` içinde `tool_use` bloğu:
  - `name: "SendMessage"`
  - `input`: `to` (alıcının oturum adı), `message` (metin), `summary` (metin) **ve** aynı bilginin yeni kopyaları:
    `type: "message"`, `recipient` (= `to`), `recipient_kind`, `content` (metin).
  - Blokta ayrıca `caller.type: "direct"`.
- Satırın kökünde `wireToolInputs.<tool_use_id>` altında girdinin bir kopyası daha var (`to`, `message`,
  `summary`). **Kullanılmaz.**
- Araç sonucu: `user` satırı, `toolUseResult`: `success`, `message`, `display`, `msg_id`. Kullanılmaz.
- **Ayrıştırıcı:** yalnızca `input.to` (yoksa `input.recipient`) alınır.

### 4.2 Alıcı tarafı (alıcının `.jsonl` dosyası)

Mesaj iki satır halinde görünür:

1. `type: "queue-operation"`, `operation: "enqueue"` sonra `"dequeue"`, `content` = mesajın
   `<cross-session-message from="…" from-name="…" from-mode="…">…</cross-session-message>` sarmalı.
   **Metin taşır → okunmadan atlanır** (`SKIPPED_TYPES`).
2. `type: "user"` satırı, `isMeta: true`, `message.content` = aynı sarmal (metin) ve:

   ```jsonc
   "origin": {
     "kind": "peer",            // human yerine: başka oturumdan geldi
     "name": "ajanofisi-26",    // gönderenin oturum adı  ← kullanılan tek alan
     "from": "…",               // gönderenin adresi
     "msg_id": "…", "verifiedPeerPid": 0, "verifiedLocal": true, "fromMode": "…",
     "body": "…"                // MESAJ METNİ: asla okunmaz
   }
   ```

   Ek alanlar: `promptSource`, `turnOrigin`, `turnPosition`, `queueSkip*`. Kullanılmaz.

- **Ayrıştırıcı:** `origin.kind == "peer"` → `{ kind: 'peer', from: origin.name }` olayı; alıcı **düşünüyor**
  durumuna geçer (yeni sıra başlar). Mektup animasyonu gönderen tarafındaki `SendMessage` olayından üretilir.

## 5. Roller ve ekip listesi (Sürüm 2, 20.11.2026)

### 5.1 Alt ajan türü

- `agent-<id>.meta.json` → `agentType` (en fazla 40 karakter) alınır ve tarayıcıya `Agent.agentType` olarak gider.
  Yerleşik türler: `Explore`, `Plan`, `general-purpose`, `workflow`…; projede tanımlı özel ajanlarda ajanın adı
  (ör. `tasarimci`).

### 5.2 Ekip listesi: `<proje klasörü>/.claude/agents/*.md`

- Proje klasörü canlı oturumun `cwd` alanından gelir. Klasöre **yazılmaz**.
- Her dosyadan **yalnızca** baştaki `---` ön bilgi bloğu okunur: 512 baytlık parçalarla, en fazla 4 KB; blok
  kapanınca okuma durur, ajanın talimatlarını taşıyan gövdeye hiç inilmez (`server/src/roster.ts`).
- Alınan alanlar: `name` (yoksa dosya adı) ve `description`. `description` yalnızca rol tahmininde kullanılır,
  tarayıcıya gönderilmez. Tarayıcıya giden: `{ project, members: [{ name, role }] }`.
- 30 saniyede bir ve yeni bir proje görüldüğünde yeniden okunur.

### 5.3 Test işareti

- `Bash` aracının `command` alanı yalnızca bir desenle (vitest, jest, pytest, `npm test`, `flutter test`…) sınanır;
  sonuç `test: true` işaretidir. Komut metni saklanmaz ve gönderilmez.
- `Edit`/`Write` ile düzenlenen dosyanın **adı** test dosyasıysa (`.test.`, `.spec.`, `_test.`, `test_`) yine işaret
  konur. Okumak test sayılmaz.

### 5.4 Rol çıkarımı (`server/src/roles.ts`)

1. Ana oturum → takım lideri.
2. Tür ekip listesindeyse oradaki rol (önce adından, sonra açıklamasından).
3. Türün adı (TR/EN): tasarimci/designer/ui → tasarımcı, gelistirici/developer → geliştirici, testci/tester/qa →
   test uzmanı, inceleyici/reviewer → inceleyici, arastirmaci/researcher, mimar/architect; `Explore` → araştırmacı,
   `Plan` → mimar.
4. Tür genelse (`general-purpose`) ya da hiç yazılmamışsa iş tanımı (meta.json `description`, en fazla 40
   karakter, zaten ajanın adı olarak gösterilen metin) aynı sözcük listesiyle denenir; ör. "Tasarımcı: tema kontrolü"
   → tasarımcı.
5. Davranış (en az 3 işlem): işlemlerin en az yarısı test → test uzmanı; hiç yazmayıp çoğunlukla okuyan → inceleyici.
6. `general-purpose` ya da türü yazılmamış → geliştirici; tanınmayan tür → "ekip üyesi".

### 5.5 Alt ajanın işi bitirmesi (20.11.2026)

Alt ajanlar sırayı her zaman `end_turn` ile bitirmez; bazıları lidere son raporunu bir araç çağrısıyla (`tool_use`,
ad: `SubagentHandback`) teslim eder ve dosyaya başka satır yazılmaz. Bu yüzden:

- `SubagentHandback` çağrısı görülen alt ajan **işini bitirdi** sayılır (raporun içeriği okunmaz, gösterilmez).
- 5 dakika (`SUBAGENT_STALE_MS`) hiç yeni satır gelmeyen alt ajan da bitmiş sayılır; ofisten ayrılma süresi
  (`SUBAGENT_LINGER_MS`, 90 sn) o andan itibaren işler.
