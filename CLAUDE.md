# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Ajan Ofisi · Claude için çalışma kuralları

## Kullanıcı

- Kullanıcı Türkçe yazar; **cevaplar ve arayüz metinleri Türkçe** olmalı.
- Kullanıcı yazılımcı değil, işi uçtan uca sana bırakır. Teknik terimleri kısaca açıkla, kararları önerinle birlikte
  sun. Gerçekten kullanıcıya ait bir karar yoksa soru sorma, ilerle.

## Her oturumun başında

1. `PLAN.md`'yi oku. Sıradaki işaretlenmemiş maddeden devam et.
2. Bitirdiğin maddeleri `[x]` yap, en alttaki **İlerleme günlüğü**ne tarihli kısa bir not ekle.
3. Plandan sapman gerekirse önce PLAN.md'yi güncelle, nedenini günlüğe yaz.

## Kesin kurallar (PLAN.md bölüm 2'nin özeti)

- `~/.claude/` altındaki dosyalar **yalnızca okunur**; asla yazılmaz, silinmez, taşınmaz.
- `~/.claude/sessions/*.key` dosyaları **asla okunmaz**.
- Sunucu yalnızca `127.0.0.1`'de dinler; hiçbir veri bilgisayardan dışarı gönderilmez.
- Hesap kimlikleri (`accountUuid`, `organizationUuid`), e-posta, `api-request*` satırları atlanır ve gösterilmez.
- Mesaj ve kod içerikleri, komut metinleri ve tam dosya yolları gösterilmez. Gösterilen: işlem türü ve (varsa)
  yalnızca dosya adı, ör. "Edit · pressable.dart". Ayarlarda "dosya adlarını gizle" anahtarı olur.
- Gerçek kayıt dosyaları projeye kopyalanmaz; testler `fixtures/` içindeki uydurma verilerle yapılır.

## Kod

- TypeScript, katı mod (`strict: true`). Biçimlendirme Prettier, test Vitest.
- Her aşama sonunda testler ve tip kontrolü geçmeli; sonucu kullanıcıya açıkça bildir.
- Yeni bir paket eklemeden önce neden gerektiğini tek cümleyle söyle. Bilgisayara global kurulum gerekiyorsa
  (ör. Node.js yoksa) önce kullanıcıya sor.
- Git yalnızca yerel; GitHub'a gönderme ya da commit için kullanıcı istemedikçe işlem yapma.
- Mekân, oturum ve ekip için uydurma adlar kullan (Atlas, Nova, Pusula; yollar `/Users/kullanici`). Depo herkese
  açık: kullanıcının gerçek proje adları, kullanıcı adı ya da e-postası koda, fixture'a, ekran görüntüsüne girmez.
- 3B sahnede internetten bir şey indiren özellikler kullanılmaz: drei `Text` (yazı tipi indirir) yerine `Html`,
  drei `Environment` ön ayarları yok. Doku, ses ve simgeler kodla üretilir ya da `web/public/` altındaki yerel
  dosyalardan gelir.

## Komutlar

Node 22+ gerekir; npm çalışma alanları (`server`, `web`). Kök klasörden:

| Komut                                                   | Ne yapar                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm start`                                             | Sunucu (`tsx watch`, 127.0.0.1:5175) + Vite arayüzü (127.0.0.1:5174)                   |
| `npm run demo`                                          | `AJAN_OFISI_DEMO=dolu`: uydurma, canlı değişen ofis; hiçbir dosya okunmaz              |
| `AJAN_OFISI_CLAUDE_HOME=fixtures/claude-home npm start` | Sabit örnek kayıtlarla çalıştırır                                                      |
| `npm run check`                                         | Tip kontrolü + tüm testler (CI'da çalışan budur, ardından `npm run build -w web`)      |
| `npm test` / `npm run typecheck`                        | Ayrı ayrı                                                                              |
| `npx vitest run server/src/parser.test.ts`              | Tek test dosyası; `-t "ad"` ile tek test                                               |
| `npm run build:demo`                                    | GitHub Pages için statik demo derlemesi (`VITE_STATIC_DEMO=1`, taban `/agent-office/`) |
| `npm run screenshots`                                   | README ekran görüntüleri (demo açıkken; görünmez Chrome, ayrıntı betiğin başında)      |
| `npm run format`                                        | Prettier                                                                               |

Kullanıcının açık ofisini bozmadan ikinci örnek:
`AJAN_OFISI_DEMO=dolu AJAN_OFISI_PORT=5185 AJAN_OFISI_WEB_PORT=5184 AJAN_OFISI_NO_OPEN=1 npm start`

## Mimari

Akış: `~/.claude` (salt okunur) → **server** (Node) → WebSocket anlık görüntü → **web** (React + three.js).
Veri biçimi ayrıntısı: `docs/veri-bicimi.md`; tasarım kararları: `PLAN.md` bölüm 3–4 ve 7.

- **`shared/types.ts`**: sunucu ile arayüz arasındaki tek sözleşme (`OfficeSnapshot`, `Agent`, `Letter`, `Team`,
  `AgentRole`). Biri değişince iki taraf da güncellenir.
- **server/src**: `sessions.ts` canlı oturumları (`sessions/<pid>.json`, `.key` adından elenir) bulur;
  `collector.ts` chokidar ile `projects/**/*.jsonl` ve alt ajan kayıtlarını izler, her dosya için `tail.ts`
  (ilk açılışta son ~256 KB, sonra eklenen satırlar) çalıştırır; `parser.ts` satırları savunmacı ayrıştırır ve
  **gizlilik filtresi burada** (içerik, yol, kimlik buradan geçmez); `store.ts` (`OfficeStore`) ajan durumlarını,
  mektupları, budamayı tutar; `roles.ts` rol çıkarır; `roster.ts` projenin `.claude/agents/*.md` ön bilgisini
  (en fazla 4 KB) okur. `main.ts` yayınları saniyede ~6 ile sınırlar ve yabancı kökenli WebSocket'i reddeder.
- **`server/src/demo.ts`** iki yerde kullanılır: sunucunun demo kipi ve tarayıcıdaki statik demo
  (`web/src/staticDemo.ts`, `OfficeStore` + `startDemo`'yu doğrudan içe aktarır). Bu yüzden `store.ts` ve
  `demo.ts` tarayıcıda da çalışabilmeli (Node'a özgü modül kullanmamalı).
- **web/src/store.ts** (zustand): WebSocket bağlantısı (ya da statik demo) → `applySnapshot`; arayüz durumu.
  Kalıcı tercihler `settings.ts` ve `layouts.ts` (localStorage).
- **web/src/office/sim/**: saf, React'sız ve testli mantık (A* yol bulma, kat planı, davranış senaryoları,
  maskot). Anlık görüntüden aktörlerin ne yaptığını burası hesaplar; React bileşenleri yalnızca çizer. Davranış
  değişikliği önce burada ve testinde yapılır.
- **web/src/office/**: `project/` proje ofisi sahnesi (oda, mobilya, ekranlar, dış mekân, düzen düzenleyicisi;
  tekrar eden mobilya `batch.tsx` ile `InstancedMesh`), `AllProjectsScene.tsx` tüm projeler görünümü,
  `themes.ts` / `brand.ts` tema ve marka (varsayılan `sade`, isteğe bağlı `devtechnic`), `power.ts` düşük güç /
  kare hızı. Saf yardımcıların (`layout.ts`, `framing.ts`, `screens.ts`…) yanında `.test.ts` dosyası vardır.
- Testler Vitest, `node` ortamında; yalnızca `*.test.ts` (bileşen testi yok). Gerçek dosya gereken sunucu
  testleri `fixtures/claude-home`'u kullanır.
- İçe aktarmalar `.ts` uzantısıyla yazılır (`allowImportingTsExtensions`, `verbatimModuleSyntax`: tipler
  `import type` ile); `noUncheckedIndexedAccess` açık.

## Proje ekibi

`.claude/agents/` altında gelistirici, testci, inceleyici, tasarimci, arastirmaci tanımlı; ofiste bu adlarla
görünürler. Genel ajan kullanılırsa iş tanımını rol adıyla başlat ("Geliştirici: …").

## Başka projeler

- `~/Desktop` altındaki diğer proje klasörlerine **dokunma**. Bu proje yalnızca kendi klasöründe çalışır.
