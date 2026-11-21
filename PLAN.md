# Ajan Ofisi · Proje Planı

Claude Code oturumlarını ve alt ajanlarını, bilgisayardaki kayıt dosyalarından canlı okuyup bir **sanal ofiste
karakterler** olarak gösteren, tamamen yerel çalışan bir uygulama. Pixel Agents'ın bize özel, daha gelişmiş hali.

> Bu dosya projenin yol haritasıdır. Her çalışma oturumunda önce buraya bakılır, biten maddeler `[x]` yapılır ve
> en alttaki **İlerleme günlüğü**ne kısa bir not düşülür.

---

## 1. Hedef

- Bilgisayarda çalışan **her Claude Code oturumu** (terminal, VS Code) ofiste bir karakter olsun.
- Karakter, oturumun **o anda ne yaptığını** göstersin: düşünüyor, dosya okuyor, kod yazıyor, terminalde komut
  çalıştırıyor, boşta, kapalı.
- Bir oturum **alt ajan** başlattığında, yanında yeni bir karakter doğsun ve ana karaktere bağlı görünsün; işi
  bitince rapor verip gitsin.
- Oturumlar birbirine **mesaj** gönderdiğinde, bir karakterden diğerine **uçan mektup** animasyonu oynasın.
- Her **proje** (ör. Atlas, Nova, Pusula) ofiste ayrı bir **oda** ya da masa grubu olsun.
- Karaktere tıklayınca bir **detay paneli** açılsın: oturum adı, proje, durum, son kullanılan araçlar, başlık.
- Görünüm tamamen **özelleştirilebilir** olsun: tema, renkler, karakterler, oda düzeni.

## 2. Kesin kurallar (gizlilik ve güvenlik)

1. **Sadece okuma.** `~/.claude/` altındaki hiçbir dosyaya yazılmaz, silinmez, taşınmaz.
2. **Veriler bilgisayardan çıkmaz.** Sunucu yalnızca `127.0.0.1` adresinde dinler. Dış servis, analitik ya da bulut
   kullanılmaz.
3. **`.key` dosyaları asla okunmaz** (`~/.claude/sessions/*.key`).
4. **Kimlik alanları gösterilmez:** `accountUuid`, `organizationUuid`, e-posta, API anahtarları, `api-request*`
   satırları. Bu satırlar okunurken atlanır.
5. **Mesaj ve kod içerikleri gösterilmez.** Ekranda işlem türü ve (araç bir dosyayla çalışıyorsa) **yalnızca dosya
   adı** görünür, ör. "Edit · pressable.dart". Tam yol, komut metni, mesaj ve kod içeriği gösterilmez. Ayarlarda
   "dosya adlarını gizle" anahtarı bulunur.
6. Testlerde kullanılacak örnek kayıtlar **elle anonimleştirilmiş, uydurma** verilerden oluşur; gerçek kayıt
   dosyaları projeye kopyalanmaz.

## 3. Veri kaynakları (19.11.2026'da bu bilgisayarda doğrulandı)

> Bu biçim Anthropic tarafından belgelenmiş resmi bir arayüz değildir; Claude Code sürümleriyle değişebilir.
> Okuyucu **savunmacı** yazılmalı: tanımadığı satırı atlamalı, asla çökmemeli. Her satırdaki `version` alanı
> kaydedilip ayrıştırıcıda dikkate alınmalı.

### 3.1 Canlı oturum listesi: `~/.claude/sessions/<pid>.json`

Çalışan her Claude Code süreci için bir dosya. Görülen alanlar:

| Alan                                        | Örnek / anlamı                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `pid`                                       | Süreç numarası. Süreç yaşıyor mu diye kontrol edilmeli (dosya kalmış olabilir) |
| `sessionId`                                 | Oturum kimliği, kayıt dosyasının adıyla aynı                                   |
| `name`                                      | Oturumun kısa adı, ör. `atlas-45`. Ajanlar birbirine bu adla mesaj atar        |
| `cwd`                                       | Proje klasörü, ör. `/Users/kullanici/Desktop/Atlas`                            |
| `kind`                                      | `interactive`                                                                  |
| `entrypoint`                                | `cli` (terminal) veya `claude-vscode` (VS Code)                                |
| `status`                                    | `busy` (çalışıyor) / `idle` (boşta)                                            |
| `startedAt`, `updatedAt`, `statusUpdatedAt` | Zaman damgaları (ms)                                                           |

### 3.2 Oturum kayıtları: `~/.claude/projects/<klasör>/<sessionId>.jsonl`

- `<klasör>`: proje yolundaki `/` karakterlerinin `-` yapılmış hali, ör. `-Users-kullanici-Desktop-Atlas`.
- Her satır bir JSON olay. **Dosyalar çok büyük olabilir (40 MB+ görüldü):** baştan okunmamalı, dosyanın sonundan
  takip edilmeli (okunan son konum saklanır, yalnızca yeni eklenen satırlar işlenir).
- Görülen olay türleri (`type` alanı):
  - `user`: kullanıcı mesajı ya da araç sonucu (`message.content[].type == "tool_result"`)
  - `assistant`: modelin cevabı. `message.content[]` blokları: `text`, `thinking`, `tool_use`. `tool_use.name`
    aracın adı: `Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Skill`, `Agent`, `SendMessage` vb.
  - `ai-title`: oturumun otomatik başlığı (`aiTitle`). Detay panelinde kullanılabilir
  - `last-prompt`, `permission-mode`, `mode`, `system`, `attachment`: ek bilgiler
  - `session-owner`, `api-request`, `api-request-blob`, `api-request-shape`: **atlanacak** (kural 4)
- Ortak alanlar: `timestamp`, `uuid`, `parentUuid`, `sessionId`, `cwd`, `isSidechain`, `version`.

### 3.3 Alt ajanlar: `~/.claude/projects/<klasör>/<sessionId>/subagents/**/agent-<agentId>.jsonl`

- Aynı satır biçimi. `isSidechain: true` ve `agentId` alanı var.
- Yanında `agent-<agentId>.meta.json`: `agentType`, `description`, `spawnDepth` (kaçıncı kuşak), `isBuiltIn` vb.
- Ana oturumda alt ajanı başlatan olay, `Agent` adlı `tool_use` bloğudur; karakterin "doğduğu" an budur.

### 3.4 Oturumlar arası mesajlaşma

- Ajanlar birbirine `SendMessage` aracıyla mesaj atar (alıcı: oturum adı, ör. `atlas-bf`).
- Gönderende `SendMessage` `tool_use` (`input.to` / `input.recipient`); alıcıda `origin.kind: "peer"` olan bir
  `user` satırı (`origin.name` = gönderen) ve mesaj metnini taşıyan, atlanan bir `queue-operation` satırı.
  Ayrıntı: `docs/veri-bicimi.md` bölüm 4 (19.11.2026'da doğrulandı).

## 4. Mimari

```
~/.claude/ (sadece okunur)
   │  dosya izleme (chokidar) + sondan takip
   ▼
Yerel sunucu  (Node.js + TypeScript, 127.0.0.1)
   ├─ toplayıcı (collector): dosyaları bulur, yeni satırları okur
   ├─ ayrıştırıcı (parser): satırı güvenli şekilde olaya çevirir, gizli alanları atar
   ├─ durum modeli (store): ajanlar, projeler, mesajlar, son olaylar
   └─ WebSocket: değişiklikleri tarayıcıya yollar
   ▼
Tarayıcı arayüzü  (Vite + React + TypeScript)
   └─ 3B sahne: Three.js (react-three-fiber + drei), düşük poligonlu (low-poly) stil
```

**Önerilen teknoloji:** Node.js 22+, TypeScript, Vite, React, Three.js (react-three-fiber), Zustand (durum),
Vitest (test). Hepsi ücretsiz ve yerel.

### 4.1 Durum modeli (taslak)

```ts
type AgentStatus =
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'terminal'
  | 'searching'
  | 'delegating'
  | 'messaging'
  | 'idle'
  | 'offline';

interface Agent {
  id: string; // sessionId ya da agentId
  name: string; // ör. "atlas-45" ya da alt ajan açıklaması
  project: string; // klasör adı, ör. "Atlas"
  kind: 'session' | 'subagent';
  parentId?: string; // alt ajansa ana oturum
  entrypoint?: 'cli' | 'claude-vscode';
  status: AgentStatus;
  currentTool?: string; // ör. "Bash"
  title?: string; // ai-title
  lastActivityAt: number;
  recentTools: { name: string; at: number }[]; // son 20
}
```

### 4.2 Olaydan duruma eşleme

| Olay                               | Durum / animasyon                                  |
| ---------------------------------- | -------------------------------------------------- |
| `thinking` bloğu                   | `thinking`: düşünce balonu                         |
| `tool_use` Read / Grep / Glob      | `reading` / `searching`: kitap karıştırma, büyüteç |
| `tool_use` Edit / Write            | `writing`: masada klavye                           |
| `tool_use` Bash                    | `terminal`: ekranda yeşil yazılar                  |
| `tool_use` Agent                   | `delegating`: yanında yeni karakter doğar          |
| `tool_use` SendMessage             | `messaging`: alıcıya uçan mektup                   |
| `sessions/*.json` → `status: idle` | `idle`: kahve molası / sandalyede yaslanma         |
| Süreç yok ya da 10 dk sessiz       | `offline`: masada ışık söner, karakter gider       |

## 5. Aşamalar

### Aşama 0 · Keşif ve kararlar

- [x] Bu planı kullanıcıyla birlikte gözden geçir, **Kararlar** (bölüm 7) için seçim yaptır
- [x] Bölüm 3'teki biçimi bir kez daha doğrula (Claude Code sürümü değişmiş olabilir); farkları
      `docs/veri-bicimi.md`'ye yaz
- [x] İki oturum arasında test mesajı gönder, `SendMessage` olayının kayıttaki biçimini belgele (3.4)
      _(19.11: `ajanofisi-26` → `atlas-45` ile doğrulandı; ayrıntı `docs/veri-bicimi.md` bölüm 4)_
- [x] Anonimleştirilmiş, uydurma örnek kayıtlar hazırla: `fixtures/` (bir ana oturum, bir alt ajan, bir mesajlaşma)

### Aşama 1 · Proje iskeleti

- [x] `git init` (yalnızca yerel; GitHub'a gönderme kullanıcı isterse)
- [x] Monorepo: `server/` (Node + TS) ve `web/` (Vite + React + TS); kökte `npm start` ikisini birlikte başlatsın
- [x] Biçimlendirme ve lint (Prettier + ESLint), Vitest _(ESLint şimdilik eklenmedi; TypeScript katı mod yeterli)_
- [x] `README.md`: nasıl çalıştırılır (Türkçe, adım adım)

### Aşama 2 · Okuyucu (sunucu)

- [x] Oturum bulucu: `~/.claude/sessions/*.json` (`.key` hariç), süreç canlılık kontrolü
- [x] Kayıt bulucu: `projects/**/<sessionId>.jsonl` ve `subagents/**/agent-*.jsonl`
- [x] Sondan takip: büyük dosyada baştan okumadan yeni satırları işleme; ilk açılışta yalnızca son ~200 satır
- [x] Savunmacı ayrıştırıcı: bozuk/yarım satır, bilinmeyen tür, eksik alan → atla, çökme
- [x] Gizlilik filtresi: bölüm 2'deki alanları ve satırları at; mesaj metinlerini sakla**ma**
- [x] Testler: `fixtures/` ile ayrıştırıcı, takip ve filtre testleri

### Aşama 3 · Durum modeli ve canlı yayın

- [x] Bölüm 4.1'deki modeli kur, 4.2'deki eşlemeyi uygula
- [x] WebSocket: bağlanınca tam durum, sonra değişikliklerde yeni durum _(şimdilik her seferinde tam görüntü,
      saniyede en fazla ~6; ajan sayısı az olduğu için yeterli, gerekirse farka geçilir)_
- [x] Sunucu yalnızca `127.0.0.1`'de dinlesin (test ile doğrula) _(elle doğrulandı; başka siteden gelen
      WebSocket bağlantıları da reddediliyor)_

### Aşama 4 · Basit görünüm (doğrulama ekranı)

- [x] 3B'den önce düz bir liste/kart görünümü: her ajan, durumu, aracı, projesi canlı değişsin
      _(3B sahnenin yanında açılır-kapanır kenar paneli olarak; bağlantı koparsa yeniden dener)_
- [x] Gerçek kullanımda dene: iki Claude oturumu aç, bir iş yaptır, listenin doğru güncellendiğini gör
      _(19.11: `ajanofisi-26` terminalde/Bash, `atlas-45` boşta doğru göründü)_

### Aşama 5 · Ofis sahnesi (3B)

- [x] Kamera: üstten eğik (izometrik hissi), fareyle döndürme/yakınlaştırma _(sınırlı açılar; listeden seçince
      kamera masaya uçar)_
- [x] Ofis zemini, duvarlar, ışık; her proje için bir oda ya da masa adası, kapıda proje adı _(cam duvarlı, ışıklı
      kenarlı odalar, neon tabela, gölgeler; "Gece" renkleri)_
- [x] Karakter: basit low-poly figür, adı üstünde etiket, giriş noktası rengi (terminal / VS Code)
- [x] Masa, bilgisayar, sandalye; karakter kendi masasına oturur _(ekran + masa lambası durum renginde; kapalı
      ajanın masası boş ve sönük; yardımcılar masanın yanında küçük karakterler)_

### Aşama 6 · Canlılık ve animasyonlar

> 19.11.2026: Bu aşamanın maddeleri **Sürüm 2**'ye taşındı (bkz. bölüm 5.1): durum animasyonları → V2.4/V2.6,
> alt ajan doğuşu → V2.6 (kapıdan giriş, rapor, çıkış), uçan mektup → V2.6 (yalnızca "Tüm projeler"de; proje
> içinde yürüyüp konuşma), canlı akış → V2.7.

### 5.1 Sürüm 2 · Proje ofisi

**Mimari kararlar (19.11.2026):**

- Sunucu: `shared/types.ts` → `AgentRole` (`lead | designer | developer | tester | reviewer | researcher |
architect | other`), `Agent.role`, `Agent.agentType?`, `OfficeSnapshot.teams` (`{ project, members: {name, role}[] }`).
- Rol çıkarımı ayrı modül: `server/src/roles.ts`. Sıra: ana oturum → `lead`; `agentType` ekip listesinde varsa
  onun rolü; ad eşlemesi (TR/EN, ör. tasarimci/designer, testci/tester/qa, inceleyici/reviewer, Explore →
  researcher, Plan → architect); davranış (çoğunlukla test çalıştıran/test dosyası düzenleyen → tester, en az
  3 işlem ve hiç yazmayan → reviewer); `general-purpose` → developer (zayıf eşleme, davranış ezebilir); yoksa other.
- Test tespiti: ayrıştırıcı Bash komutundan yalnızca `test: true` işareti çıkarır (komut metni saklanmaz,
  gönderilmez); dosya adı `.test.` / `.spec.` / `_test.` / `test_` ise de test sayılır.
- Ekip listesi: `server/src/roster.ts`, `<cwd>/.claude/agents/*.md` dosyalarının yalnızca baştaki `---` ön bilgi
  bloğu sınırlı bayt okumasıyla (en fazla 4 KB) okunur; `name` ve `description` alınır, `description`
  yalnızca rol tahmininde kullanılır, tarayıcıya gönderilmez. 30 sn'de bir yenilenir.
- Demo modu: `AJAN_OFISI_DEMO=1` (`server/src/demo.ts`): uydurma 3 proje, ekip, yardımcı doğuşu, mesajlar,
  20 karaktere kadar. Görsel kontrol ve performans testi için.
- Arayüz: `web/src/office/sim/` altında saf (React'sız, test edilebilir) modüller: `pathfinding.ts` (0,5 m ızgara,
  8 yönlü A*, köşe kesmez, görüş hattıyla yol düzeltme), `plan.ts` (oda boyutu, bölgeler, rol adaları, masa
  atama; önceki atamayı korur, adalar sabit ızgara hücrelerinde, böylece büyüme diğer masaları kaydırmaz),
  `sim.ts` (OfficeSim: aktörler, görev kuyruğu: yürü/otur/bekle/konuş/çık, tohumlu rastgele ile boşta davranışları).
  React yalnızca `useFrame` içinde sim'den okuyup çizer.
- Tekrar eden mobilyalar tek bir `StaticBatch` bileşeniyle (parça türüne göre `InstancedMesh`) çizilir.
- Monitör içeriği: durum başına paylaşılan küçük kanvas dokuları (2 çeşit), ~10 fps güncellenir; gerçek içerik yok.
- Parlama: `@react-three/postprocessing` + `postprocessing` (three 0.170 ile uyumlu: postprocessing 6.39 →
  three ≥0.168 <0.188). Parlaklık eşiğiyle yalnızca ekranlar, lambalar ve şehir ışıkları parlar.
- Kare hızı: `frameloop="demand"` + kendi sürücümüz: odakta 60, pencere odakta değilken ~15, sekme gizliyken 0.

**Aşamalar:**

#### V2.1 · Veri: roller ve ekip

- [x] `shared/types.ts`: `AgentRole`, `role`, `agentType`, `teams`
- [x] `roles.ts` + testler (TR/EN ad eşleme, yerleşik türler, davranış tahmini)
- [x] Ayrıştırıcıda `test` işareti (komut metni saklanmadan) + testler
- [x] Toplayıcı: meta'dan `agentType`; alt ajan `startedAt`; `roster.ts` (yalnızca ön bilgi) + testler
      (`fixtures/` içinde gövdesinde "GİZLİ" geçen örnek ajan dosyası: gövdenin okunmadığı doğrulanır)
- [x] Demo modu (`npm run demo`)

#### V2.2 · Proje seçici

- [x] Üstte "Tüm projeler" / tek proje seçici; varsayılan en son etkin proje; seçim `localStorage`'da
- [x] "Tüm projeler" bugünkü küçük odalar olarak kalır (karakterler yeni rol görünümleriyle)

#### V2.3 · Gerçekçi ofis (proje görünümü)

- [x] `plan.ts` + testler: oda, sol şerit (cam toplantı odası, mutfak/kahve, kapı), orta (rol adaları, sırt sırta
      masalar), sağ şerit (lider köşesi, beyaz tahta, kitaplık, kanepe köşesi)
- [x] Duvarlar, büyük pencereler, dışarıda gece şehir manzarası (ışıklı binalar), sarkıt lambalar, halı ve
      zemin dokusu (kanvasla üretilir)
- [x] Masalar: monitör(ler), klavye, fare, kupa, kişisel eşyalar (tohumlu çeşitlilik); rol eşyaları (tasarımcı:
      iki ekran + çizim tableti; test uzmanı: kontrol listesi panosu; lider: köşe masa + büyük ekran)
- [x] Ekip listesindeki çalışmayan ajanların masası: boş sandalye, kapalı ekran, "masada değil" etiketi
- [x] Gece atmosferi: bordo, pembe-kırmızı ve amber ışıklar, yumuşak gölge (tek gölgeli ışık), parlama

#### V2.4 · Karakterler

- [x] Eklemli karakter (kalça/diz/omuz), oturma–ayakta–yürüme pozları arasında yumuşak geçiş
- [x] Rol görünümleri: tasarımcı renkli kıyafet + bere, geliştirici kapüşonlu + kulaklık, test uzmanı yelek,
      lider ceket, inceleyici gözlük; ten/saç çeşitliliği
- [x] Masada küçük hareketler: yazma, ekrana bakma; düşünce balonu; "seni bekliyor": ayağa kalkıp kameraya döner,
      el sallar, soru işareti

#### V2.5 · Yol bulma ve yürüme

- [x] `pathfinding.ts` + testler (engel, ulaşılamayan hedef, köşe kesmeme, en yakın boş hücre)
- [x] Doğal yürüme: bacak/kol sallanması, hafif baş sallanması, dönüşlerde yumuşak yön değişimi

#### V2.6 · Canlı davranışlar (Aşama 6'nın yerine)

- [x] `sim.ts` + testler
- [x] Aynı projede mesaj: gönderen alıcının masasına yürür, karşılıklı dururlar, simgeli balon (zarf), dönerler
- [x] Alt ajan doğuşu: kapıdan girer, rol masasına yürür, oturur; lider masasına gidip görev verir (görev listesi
      balonu). İş bitince lidere rapor (onay balonu), sonra kapıdan çıkar
- [x] Farklı projeler arası mesaj ("Tüm projeler" görünümünde): uçan mektup
- [x] Boşta: ara sıra kahve köşesi (kupayla dönüş), sandalyede gerinme, uzun boşta kanepe; iş gelince masaya döner
- [x] Monitörler: yazıyor → kayan renkli kod satırları, okuyor → sayfa kaydırma, terminal → siyah zemin yeşil satır,
      arıyor → büyüteç + liste, tasarımcı → renk paletleri ve arayüz kutuları, test uzmanı → yeşil/kırmızı tikler

#### V2.7 · Kamera, etkileşim, akış

- [x] Serbest dolaşım (sınırlı açılar); karaktere tıklayınca kamera takip eder
- [x] Detay paneli: rol, ad, durum, şu anki işlem, son işlemler, çalışma süresi
- [x] "Tüm ofis" düğmesi; rol filtreleri (listeyle sahne tutarlı)
- [x] Köşede canlı işlem akışı: "Tasarımcı · Edit · theme.dart" ("dosya adlarını gizle"ye uyar) + testler

#### V2.8 · Performans ve erişilebilirlik

- [x] 20 karakter + dolu ofiste akıcılık (instancing, sınırlı gölge, paylaşılan malzemeler)
      _(M1'de 13 karakterli dolu proje ofisinde ~119 kare/sn, kare başına ~320 çizim çağrısı. Tek projede 20 karakter
      ayrıca ölçülmedi.)_
- [x] Sekme arka plandayken çizimi yavaşlat _(odakta her kare, pencere odakta değilken ~12 kare/sn, sekme
      gizliyken hiç; kodla yapıldı, ayrıca ölçülmedi)_
- [x] "Hareketi azalt": yürüme yerine solup belirme, boşta gezinme kapalı, sade animasyonlar
- [x] README ve PLAN güncel; `npm run check` geçer; her aşamada ekran görüntüsüyle kontrol

### Aşama 7 · Etkileşim

- [x] Karaktere tıkla → detay paneli: ad, proje, giriş noktası, başlık, durum, son 20 araç, çalışma süresi
- [x] Filtreler: proje seç, kapalıları gizle _(kapalı oturumlar, bitmiş yardımcılar ve masada olmayan ekip üyeleri;
      liste, sahne ve özet birlikte)_
- [x] Ayarlar: tema, içerik özetlerini göster/gizle, ses _(tema seçicide şimdilik yalnızca Gece; "içerik özeti" =
      oturumun otomatik başlığı; ayrıca hareket tercihi ve dosya adlarını gizle buraya taşındı)_

### Aşama 8 · Görünüm ve özelleştirme

- [x] Tema sistemi; ilk tema **Gece** (Atlas'in koyu kızıl, ışıklı tasarım dili)
  - [x] `office/themes.ts`: arayüz renkleri + sahne (gökyüzü, duvar, zemin, halı, kanepe, ışıklar, şehir, parlama,
        "Tüm projeler" zemini) tek yerde; testli
  - [x] Üç tema: **Gece** (bugünkü), **Gün ışığı** (açık duvarlar, güneş, mavi gök, sönük neon), **Kuzey** (soğuk
        mavi gece, camgöbeği neon)
  - [x] Ayarlar'da seçim; seçim anında uygulanır (dokular tema başına önbellekte)
- [x] Oda düzeni düzenleyicisi (masaları sürükle-bırak), düzenin kaydedilmesi
  - [x] Kat planına ada konumu geçersiz kılma (`layout`): geçersizse (oda dışı, çakışma) varsayılana döner; yeni
        adalar boş yere yerleşir; testli (`canPlaceIsland`, kapıdan her masaya yol)
  - [x] "Düzenle" modu: ada zeminini sürükle, 0,5 m ızgaraya oturur, geçerli/geçersiz renkle gösterilir; klavyeyle
        ok tuşu alternatifi; "Varsayılana dön"
  - [x] Düzen proje başına tarayıcıda saklanır
- [x] Karakter özelleştirme (renk, aksesuar), istenirse proje başına maskot
  - [x] Ayarlar'da rol başına kıyafet rengi (otomatik + hazır renkler) ve aksesuar aç/kapa
  - [x] Proje başına maskot (yok / kedi / köpek / robot): ofiste yol bularak dolaşır, ara sıra oturur; hareketi
        azalt'ta yerinde durur; testli dolaşma mantığı

### Aşama 9 · Cila ve paketleme

Bu aşamadan itibaren işler projenin kendi ekibine dağıtılır (`.claude/agents/`: gelistirici, testci, inceleyici,
tasarimci); böylece ofiste lider dışındaki roller de çalışırken görünür. Lider (ana oturum) planlar, dağıtır,
sonuçları birleştirir ve PLAN'ı günceller.

- [x] Ekip tanımı ve rol tahmini: `.claude/agents/*.md` (4 üye); genel türdeki yardımcının rolü iş tanımından da
      anlaşılır ("Tasarımcı: …"); iş tanımı üyenin adıyla başlayan yardımcı üyenin masasına oturur
- [x] Performans: 10+ ajan ve 40 MB+ kayıtla akıcılık; uzun süre açık kalınca bellek sızıntısı olmaması
  - [x] Sunucu: 40 MB+ uydurma kayıtla ilk okuma süresi ve bellek; uzun akışta belleğin sınırlı kalması (testci)
        _(48 MB/79 bin satır: ilk görüntü 43 ms, heap 8 MB, ~300 bin satır/sn. Bulgu: bitmiş alt ajanlar ve dosya
        izleyicileri bellekten hiç silinmiyor; 20 bin alt ajanda +61 MB)_
  - [x] Sunucu bellek temizliği: ekrandan kalkan ajanları ve dosya izleyicilerini bırakma, parça parça okuma
        (gelistirici) _(20 bin alt ajanda +61 MB → ~7 MB; anlık görüntü 3,3 ms → 0,009 ms; okuma 1 MB'lık
        parçalarla; yeniden açılan dosya çift mektup üretmez)_
  - [x] Tarayıcı: demo ile 20 ajan, kare hızı ve 5 dk bellek eğrisi (testci) _(19 ajan, Atlas'de 13: bellek
        5 dk'da artış eğilimi yok (GC sonrası 66 → 71 MB, karakter sayısı 6 → 12); 10 tur proje değiştirmede
        geometri/doku başa dönüyor. Bulgu: kare sürücüsü her 2. kareyi atlıyor (75 Hz ekranda 38 kare/sn, düşük
        güçte 26))_
  - [x] Kare atlama düzeltmesi: `frameloop="never"` + `advance()` (gelistirici) _(75 Hz ekranda artık her kare
        çiziliyor; düşük güçte tam 30 kare/sn; lider tarayıcıda ölçtü)_
  - [x] Ölçüm için portlar ayarlanabilir (`AJAN_OFISI_PORT`, `AJAN_OFISI_WEB_PORT`, `AJAN_OFISI_NO_OPEN`): ikinci
        bir örnek gerçek sunucuyu bozmadan çalışabilsin
- [x] Hareketi azalt desteği _(Aşama 7'de: sistem/azalt/tam)_
- [x] Düşük güç modu (Ayarlar): kare hızı sınırı (30, odak dışında 8), parlama ve gölge kapalı, dpr 1, en fazla 4
      nokta ışık, ekranlar ~2 kare/sn (`office/power.ts`, testli)
- [x] Gözden geçirme: gizlilik ve sızıntı incelemesi (inceleyici); görünüm ve erişilebilirlik kontrolü (tasarimci)
      _(gizlilik temiz. Düzeltilenler: düzenleyicide kamera kilidi, React "synchronously unmount" uyarısı (etiketler
      artık tek portal katmanında), yeşil gösterip reddetme, ekran parlaklığı, port doğrulama, Türkçe harfli üye adı,
      düşük güçte kararan köşeler, soluk akış, tabela/etiket çakışması, dar ekranda düzenleme paneli, Gün ışığı
      kontrastı)_
- [x] Bitmiş yardımcılar ofisten ayrılır: `SubagentHandback` ile ya da 5 dk sessizlikle "işini bitirdi"; iş
      tanımında ilk rol sözcüğü öncelikli
- [x] Tek komutla başlatma _(`npm start` sunucuyu ve arayüzü başlatıp tarayıcıyı açar; `npm run demo` uydurma ofis)_
- [x] ~~Masaüstü uygulaması (Tauri/Electron) ya da VS Code paneli olarak paketleme~~ _(20.11.2026: kullanıcı
      istemedi; tarayıcı yeterli)_

### Sürüm 3 · DevTechnic ofisi (20.11.2026'da kullanıcı istedi)

İstek: ofisin tüm alanları (masalar, toplantı odası, dinlenme alanı vb.) görsel olarak geliştirilsin; ofis
DevTechnic firmasının ofisi olsun, sitedeki (devtechnic.com.tr) logoyla özel bir tabela duvarı tasarlansın; tarayıcıda
ofis sayfanın yarısında kalmasın. İş ekiple yürür: araştırmacı → tasarımcı → geliştiriciler → test uzmanı ve
inceleyici → tasarımcının son kontrolü.

Kurallar: logo ve marka renkleri yalnızca bir kez, kullanıcının kendi sitesinden alınıp projeye eklenir; uygulama
çalışırken internetten hiçbir şey indirmez. Yeni paket gerekirse eklemeden önce kullanıcıya tek cümleyle nedeni
söylenir.

- [x] V3.1 Araştırma: logo dosyası ve marka renkleri (projeye eklenir), görsel kaliteyi artıracak teknikler ve
      kütüphaneler (kurulu sürümlerle uyumlu, çevrimdışı), yerel skill'ler → `docs/gorsel-arastirma.md`
- [x] V3.2 Tasarım planı: alan alan (çalışma adaları, lider köşesi, toplantı odası, dinlenme alanı, mutfak, giriş ve
      marka duvarı, dış görünüm) → `docs/tasarim-v3.md`
- [x] V3.3 Sayfa düzeni: ofis tarayıcı alanını doldurur (kadraj, boş dış zemin, panel açık/kapalı, dar ekran)
      _(`office/framing.ts`, testli: açı ve hedef ekran oranına göre seçilir; 1920×1080'de ekranın ~%98'i (eskiden ~%80),
      panel açıkken ~%70 (eskiden ~%57). Dar ekranda çalışma alanı kadrajda; odanın altı kulenin kat bandı ve alt kat cephesi)_
- [x] V3.4 DevTechnic marka duvarı ve tabela (logo dokusu, ışıklı tabela, marka renkleri)
- [x] V3.5 Alanların geliştirilmesi (tasarım planına göre)
- [x] V3.6 Test (kare hızı, çizim çağrısı, bellek; testler) ve inceleme (gizlilik, çevrimdışılık, sızıntı)
      _(örnek verili aynı sahnede kare başına çizim çağrısı 140 → 167 (+27: yeni dokulu yüzeyler, kule, köşe
      karartma); 12 ajanlı demoda bu ~%5. Ağ: yalnızca 127.0.0.1; konsolda hata yok)_
- [x] V3.7 Tasarımcının son kontrolü (üç tema, masaüstü ve dar ekran); README ve PLAN güncel

### Sürüm 4 · Yaşayan ofis (20.11.2026'da kullanıcı istedi)

İstek: çalışanlar boştayken de ofiste görünsün ve "yaşasın": dinlenme alanında otursun, bilgisayarda video izlesin,
oyun konsolunda oyun oynasın.

Kararlar: projenin ekip üyeleri (`.claude/agents/` altındakiler) çalışmıyorken ofisten çıkmaz, "masada değil" yerine
ofiste boşta dolaşır (yalnızca arayüzde, uydurma bir boşta karakter olarak; sunucuya ve listeye bir şey eklenmez).
Üyeye iş gelince aynı karakter masasına döner ve çalışır; iş bitince lidere rapor verir ve ofiste kalır. Genel
yardımcılar eskisi gibi kapıdan çıkar. Hareketi azalt açıkken boşta gezinme yine kapalıdır.

- [x] V4.1 Dinlenme alanına oyun köşesi: TV, konsol, iki armut koltuk (yürüme ızgarası ve testler)
- [x] V4.2 Simülasyon: boşta etkinlikler (masada video, bilgisayarda oyun, konsolda oyun, koltukta dinlenme,
      kanepe, kahve, gerinme); kanepe artık süreli; ekip üyelerinin ofiste kalması + testler
- [x] V4.3 Görünüm: video ve oyun ekranları (masa monitörü ve TV), elinde oyun kolu, arkaya yaslanma;
      ekip üyesinin görünümü her işte aynı kişi
- [x] V4.4 Kontrol: testler + tip kontrolü, demo ve gerçek veriyle ekran görüntüsü; README ve PLAN güncel

### Sürüm 5 · Teknoloji şirketi ofisi (20.11.2026'da kullanıcı istedi)

İstek: bir teknoloji şirketinde olması gereken görseller. Kullanıcının seçtikleri: canlı veriye bağlı eşyaların
hepsi, donanım/deney masası, kahve barı ve küçük ayrıntıların hepsi.

Kurallar: yeni eşyalar ada alanının dışına (sol ve sağ şeritler) konur, adaların taşınmasını engellemez; yürüme
ızgarasında engel olur, yollar testli. Canlı veriye bağlı yüzeyler yalnızca sayı, renk ve rol gösterir (içerik, dosya
adı, komut yok). Ek paket yok; kanvas çizimleri ScreenBank gibi düşük kare hızında yenilenir, düşük güç ve hareketi
azalt modlarına uyar.

- [x] V5.1 Yerleşim (`plan.ts`): sunucu odası, duvar panosu + derleme lambası, kanban panosu, deney masası,
      atıştırmalık rafı, yosun duvarı, giriş ekranı; ızgara ve yol testleri
- [x] V5.2 Canlı veri mantığı (`office/ops.ts` + testler): derleme durumu (hata/bekliyor/çalışıyor/sakin),
      pano sayıları ve son 10 dk işlem grafiği, kanban sütunları, sunucu ışığı hızı, "bugün ofiste" listesi
- [x] V5.3 Görünüm: sunucu dolapları (yanıp sönen ışıklar), duvar panosu, derleme lambası, kat bandında durum
      renkli LED şerit, kanban (notlar sütunlar arasında kayar), giriş ekranı, deney masası (3B yazıcı, robot kol,
      lehim, drone), kahve barı (espresso makinesi, atıştırmalık rafı), yosun duvarı, tavanda kablo kanalları,
      masalarda mekanik klavye, kulaklık standı, lastik ördek, çıkartmalı dizüstü, sandalyede kapüşonlu
- [x] V5.4 Boşta yeni etkinlik: deney masasında kurcalama; testler
- [x] V5.5 Kontrol: testler + tip kontrolü, çizim çağrısı ölçümü, üç temada ekran görüntüsü; README ve PLAN güncel

### Sürüm 6 · Dış mekân (20.11.2026'da kullanıcı istedi)

İstek: ofisin çevresi (dışarısı) kötü görünüyor; görsel olarak geliştirilsin. Tespit: dışarısı tek renk düz zemin ve
tek yol şeridi; şehir binalarının çatısında da pencere dokusu var ve kamera tepeden baktığı için binalar çoğu
açıdan görünmüyor; gece temasında çevre simsiyah.

Karar: kamera çoğunlukla tepeden baktığı için çevrede asıl görünen yer zemin ve komşu çatılar. Ofis kulesinin
etrafına ızgara düzeninde bir şehir kurulur: yakın halkada ofisten alçak binalar (çatılarında klima, su deposu,
güneş paneli, çatı bahçesi, helikopter pisti), park, otopark; uzak halkada yüksek binalar (sis içinde silüet).

- [x] V6.1 `project/exterior.ts` (saf): yol ızgarası, kaldırımlı bloklar, şerit çizgileri, yaya geçitleri, blok
      içerikleri (alçak binalar + çatı eşyaları, park, otopark, kule meydanı), ağaçlar, sokak lambaları, araba yolları;
      testler (binalar ofis katından alçak, kuleyle ve yollarla çakışmaz)
- [x] V6.2 Çizim: binaların çatısı düz renk (pencere dokusu yalnızca yanlarda), toplu çizim, hareket eden arabalar
      (gece farlar ve stop lambaları; hareketi azaltta duran), gece sokak lambası ışık havuzları
- [x] V6.3 Temalar: üç temaya dış mekân renkleri (kaldırım, çim, su, çatı, ağaç)
- [x] V6.4 Kontrol: testler + tip kontrolü, çizim çağrısı ölçümü, üç temada ve birkaç açıdan ekran görüntüsü;
      README ve PLAN güncel

## 6. Bitti sayılma ölçütleri (ilk sürüm: Aşama 0–6)

- İki ayrı Claude Code oturumu açıkken ikisi de ofiste, kendi proje odasında görünüyor.
- Bir oturum dosya düzenlerken karakteri 1–2 saniye içinde "yazıyor" durumuna geçiyor.
- Alt ajan başlatılınca yeni karakter beliriyor, iş bitince ayrılıyor.
- Oturumlar arası mesajda mektup uçuyor.
- `~/.claude` altında hiçbir dosya değişmiyor; ağ trafiği yalnızca `127.0.0.1`.
- Tüm testler geçiyor.

## 7. Kararlar (19.11.2026'da kullanıcıyla alındı)

1. **Görünüm stili:** 3B low-poly ofis
2. **Nerede çalışacak:** tarayıcı sekmesi (sonradan masaüstü uygulamasına paketlenebilir)
3. **Hangi oturumlar:** bu bilgisayardaki tüm projeler, her proje kendi odasında
4. **İçerik gösterimi:** araç türleri **ve dosya adları** (ör. "Edit · pressable.dart"). Mesaj ve kod metinleri
   gösterilmez. Ayarlarda ekran paylaşımı için **"dosya adlarını gizle"** anahtarı olacak (bölüm 2 kural 5 buna göre
   güncellendi)
5. **Ses:** kapalı (ileride ayarlardan açılabilir)

## 8. İlerleme günlüğü

- **19.11.2026:** Plan hazırlandı. Veri biçimi bu bilgisayarda incelendi (bölüm 3). Henüz kod yazılmadı.
- **19.11.2026:** Kararlar alındı (bölüm 7). Aşama 0, 1, 2 ve 3 bitti: iskelet, okuyucu (oturum bulucu, sondan
  takip, savunmacı ayrıştırıcı, gizlilik filtresi), durum modeli, toplayıcı ve WebSocket sunucusu. 27 test geçiyor.
  Gerçek `~/.claude` ile denendi: açık oturum doğru bulundu, giden veride gizli içerik yok. Bekleyen: oturumlar arası
  mesaj biçiminin doğrulanması (ikinci oturum açıkken). Sıradaki: Aşama 4 (basit liste görünümü).
- **19.11.2026:** Aşama 0'ın kalan maddesi bitti: `ajanofisi-26` → `atlas-45` test mesajıyla oturumlar arası mesaj
  biçimi (yalnızca alan adlarına bakılarak) doğrulandı ve belgelendi. Ayrıştırıcı `origin.kind: "peer"`
  satırlarını tanıyor, mesaj metni taşıyan `queue-operation` satırlarını atlıyor. Aşama 4 ve 5 bitti: Vite + React
  arayüzü, zustand ile WebSocket (koparsa 1→5 sn aralıklarla yeniden dener), projelere göre gruplanmış ajan paneli,
  ilk 3B ofis (react-three-fiber). Kararlar: yazı etiketleri drei `Text` yerine `Html` ile çizildi (`Text` yazı
  tipini internetten indiriyor; veri dışarı çıkmasın diye); `Environment` ön ayarları da aynı nedenle
  kullanılmadı. `@types/three` iki sürüm çakışması kök `package.json`'da `overrides` ile 0.170'e sabitlendi. Örnek
  veri modunda (`AJAN_OFISI_CLAUDE_HOME`) süreçler "açık" sayılıyor ve göreli yol komutun çalıştığı klasöre göre
  çözülüyor. 39 test geçiyor, tip kontrolü temiz. Ekran görüntüleri görünmez Chrome (DevTools protokolü, ek paket
  yok) ile alınıp kontrol edildi. Sıradaki: Aşama 6 (durum animasyonları, alt ajan doğuşu, uçan mektup, canlı akış).
- **19.11.2026:** Sürüm 2 (proje ofisi) planlandı: bölüm 5.1 eklendi, Aşama 6'nın maddeleri V2.4–V2.7'ye taşındı.
  Mimari kararlar (rol çıkarımı, ekip listesi okuma sınırı, saf sim/yol bulma modülleri, instancing, parlama
  paketi uyumluluğu) bölüm 5.1'in başında. Henüz kod yazılmadı; kullanım sınırı nedeniyle oturum burada durdu.
  Sıradaki: V2.1 (roller ve ekip verisi).
- **20.11.2026:** Sürüm 2 (proje ofisi) uygulandı, V2.1–V2.8 bitti. Sunucu: roller (`roles.ts`: TR/EN ad eşleme,
  yerleşik türler, davranış tahmini), ekip listesi (`roster.ts`: yalnızca ön bilgi bloğu, en fazla 4 KB, gövde
  okunmaz), ayrıştırıcıda yalnızca `test` işareti (komut metni saklanmaz), demo modu (`npm run demo`: uydurma, canlı
  değişen 3 proje). Arayüz: proje seçici (varsayılan en son etkin proje, seçim hatırlanır), saf ve testli
  `sim/pathfinding.ts` (A*), `sim/plan.ts` (kat planı, kararlı masa atama), `sim/sim.ts` (yürüme, buluşma, görev
  verme, rapor, kahve, gerinme, kanepe, hareketi azalt); `feed.ts` (canlı akış); büyük ofis (toplantı odası, mutfak,
  lider köşesi, beyaz tahta, kitaplık, kanepe, gece şehri, sarkıt lambalar; mobilyalar instancing ile), eklemli rol
  karakterleri, duruma göre sahte monitör ekranları (kanvas), parlama (`@react-three/postprocessing` eklendi),
  detay paneli, rol filtreleri, kamera takibi. "Tüm projeler" görünümünde uçan mektup. Kararlar: (1) monitör içerikleri
  durum başına paylaşılan dokular; (2) bir masaya aynı anda gelen ziyaretçiler ayrı noktalarda durur; (3) açılışta
  boşta kalma süresi sunucunun son etkinlik saatinden hesaplanır (3 saattir boştaki oturum hemen kanepeye geçer);
  (4) geliştirme modunda `window.__ajanOfisi` ve `window.__ajanOfisiStore` hata ayıklama için açık (üretimde yok).
  Ekran görüntüleriyle denendi (demo ve gerçek `~/.claude`); dışarıya hiçbir ağ isteği gitmiyor. 125 test geçiyor,
  tip kontrolü temiz. Açık kalan küçük işler: "Tüm projeler" görünümündeki eski etiketler hâlâ emoji simgeli;
  yalnızca ön bilgi okunan ekip listesinde kullanıcı düzeyi `~/.claude/agents` okunmuyor (yalnızca proje klasörü).
- **20.11.2026:** Aşama 7 (Etkileşim) bitti. Ayarlar penceresi eklendi: tema (şimdilik yalnızca Gece), hareket
  tercihi (sistem / azalt / tam; işletim sistemi ayarını ezebilir), dosya adlarını gizle, oturum başlıklarını göster,
  kapalıları gizle, sesli uyarılar ve ses düzeyi. Ayarlar tek anahtarda (`ajan-ofisi:ayarlar`) saklanıyor; eski
  "dosya adlarını gizle" kaydı otomatik taşınıyor. "Kapalıları gizle" listede, sahnede ve özette birlikte uygulanıyor
  (proje ofisinde bitmiş yardımcılar kapıdan çıkış yürüyüşü kesilmesin diye sahneye verilmeye devam ediyor). Sesler
  Web Audio ile kodla üretiliyor, dosya indirilmiyor; varsayılan kapalı, aynı ses 2,5 sn'den sık çalmıyor, sayfa
  açılışında eski durumlar ses çıkarmıyor. Detay panelinde son 20 işlem. Sürüm 2'den kalan küçük işler de kapandı:
  "Tüm projeler" etiketlerindeki emojiler SVG simgelerle değişti; eklenti araçlarının uzun adları kısaltılıyor
  ("browser_click"); telefon genişliğinde üst çubuk taşıyordu, düğmeler simgeye indirildi. Kararlar: (1) "içerik
  özetleri" oturumun otomatik başlığı olarak yorumlandı (varsayılan açık, önceki davranış); (2) tema seçimi Aşama 8'in
  tema sistemine kadar tek seçenekli. Yeni testler: ayarlar, ses uyarıları, araç adı kısaltma. 142 test geçiyor, tip
  kontrolü temiz. Ekran görüntüleriyle (masaüstü ve 390 px telefon genişliği) kontrol edildi. Sıradaki: Aşama 8 (tema
  sistemi).
- **20.11.2026:** Aşama 8 (Görünüm ve özelleştirme) bitti. (1) Tema sistemi: `office/themes.ts`'te arayüz renkleri
  (CSS değişkenleri) ve sahnenin tüm tema renkleri (gökyüzü, duvar, parke, halı, kilim, kanepe, dış zemin, şehir
  pencereleri, ışıklar, parlama, "Tüm projeler" zemini) tek yerde; üç tema: **Gece**, **Gün ışığı**, **Kuzey**.
  Dokular tema başına önbellekte, eşyalar tema değişince yeniden kuruluyor; CSS'teki sabit pembe tonlar temanın vurgu
  rengine bağlandı. (2) Düzen düzenleyicisi: üstte "Düzenle" düğmesi; ada zemini sürüklenir, 0,5 m ızgaraya oturur,
  geçerli yer yeşil, geçersiz kırmızı; bırakınca kapıdan her masaya yol kalıyor mu denetlenir. Klavye için ada
  seçimi, ok düğmeleri ve ok tuşları; "Varsayılana dön". Düzen proje başına `ajan-ofisi:duzen` anahtarında. Kat
  planı önce taşınan adaları (geçerliyse) yerleştirir, sonra diğerlerini kendi yuvasına ya da ilk boş yuvaya. (3)
  Karakter özelleştirme: Ayarlar → Karakterler'de rol başına kıyafet rengi (otomatik + 10 hazır renk) ve rol
  aksesuarı aç/kapa. Maskot: proje başına yok/kedi/köpek/robot; yol bularak dolaşır, varınca oturur ya da durur,
  hareketi azalt'ta yerinde oturur (`sim/mascot.ts`, testli). Ayrıca: proje görünümünde ilk açılışta kamera fazla
  yakın kalıyordu (çizim alanı boyu netleşmeden kadraj alınıyordu); kullanıcı kamerayı oynatmadıysa boyut değişince
  yeniden kadraj alınıyor. Geliştirme hata ayıklama kancasına kamera ve kontroller eklendi (üretimde yok). Yeni
  testler: temalar, düzen (kat planı + saklama), maskot, karakter/maskot ayarları. 162 test geçiyor, tip kontrolü
  temiz. Ekran görüntüleriyle denendi: üç tema, sürükle-bırak (geçerli/geçersiz), ok tuşu, kedi ve robot. Sıradaki:
  Aşama 9 (cila ve paketleme).
- **20.11.2026:** Aşama 9 (Cila) ekiple yürütüldü; paketleme dışında bitti. Projeye kendi ekibi tanımlandı
  (`.claude/agents/`: gelistirici, testci, inceleyici, tasarimci); işler bu üyelere dağıtıldı, ofiste kendi
  masalarında çalışırken görünüyorlar. Rol tahmini: genel türdeki yardımcının rolü iş tanımının (önce ilk sözcüğün)
  rol sözcüğünden; iş tanımı üye adıyla başlayan yardımcı üyenin masasına oturur. Bitmiş yardımcılar artık ofisten
  ayrılıyor (`SubagentHandback` ya da 5 dk sessizlik). Ekip çıktıları: portlar ayarlanabilir (`AJAN_OFISI_PORT`,
  `AJAN_OFISI_WEB_PORT`, `AJAN_OFISI_NO_OPEN`); düşük güç modu; sunucu belleği budanıyor (20 bin alt ajanda +61 MB →
  ~7 MB), dosyalar 1 MB'lık parçalarla okunuyor; inceleme ve tasarım bulgularından 10 düzeltme (etiketler tek portal
  katmanına taşındı, React uyarısı kalktı, düzenleyicide kamera kilidi giderildi); kare sürücüsü her 2. kareyi
  atlıyordu, `advance()` ile düzeltildi. Ölçümler: 48 MB kayıtla ilk görüntü 43 ms; 19 ajanlı demoda 5 dk'da bellek
  artış eğilimi yok, proje değiştirmede sızıntı yok; 75 Hz'de her kare çiziliyor, düşük güçte 30 kare/sn. Hata:
  lider bir kez biçimlendiriciyi tüm `web/src`'e çalıştırıp geliştiricinin üzerinde çalıştığı test dosyasının
  biçimini değiştirdi (içerik bozulmadı); sonrasında yalnızca kendi dosyaları biçimlendirildi. Açık: masaüstü
  paketleme kullanıcının kararına bağlı.
- **20.11.2026:** Proje GitHub'daki depoya gönderildi (`zinkxx/agent-office`, `main`; kullanıcı istedi). README
  baştan yazıldı (Türkçe ana belge + `README.en.md`): ekran görüntüleri, özellikler, gizlilik tablosu, kurulum,
  komutlar/ortam değişkenleri, mimari şeması, yapı. Demo verileriyle 9 ekran görüntüsü `docs/ekran-goruntuleri/`
  altında; yeniden almak için `npm run screenshots` (`scripts/ekran-goruntuleri.mjs`: görünmez Chrome + DevTools
  protokolü, ek paket yok). GitHub Actions: her gönderimde `npm run check` + arayüz derlemesi. Not: telefon
  genişliğinde ilk kadraj ofisin bir kısmını gösteriyor (V3.3'te ele alınacak). Sürüm 3 hâlâ V3.1'de: logolar
  `web/public/brand/` altında, henüz kodda kullanılmıyor.
- **20.11.2026:** Sürüm 3 (DevTechnic ofisi) bitti. Bu oturumda iş Antigravity tarafından tek elden yürütüldü
  (Claude Code ekibi kullanılmadı; bu yüzden ofiste lider dışındaki roller bu işte görünmedi). Araştırma ve tasarım
  planı `docs/gorsel-arastirma.md` ve `docs/tasarim-v3.md`. Yapılanlar: (1) **Kadraj** (`office/framing.ts`): birkaç
  açı ve hedef denenip ekranı en çok dolduran seçiliyor; dar ekranda yalnızca çalışma alanı; eski sabit açılı
  kadraj kaldırıldı. (2) **Marka duvarı**: arka duvarın ortasında 5 m dolu duvar, lacivert panel, ahşap çıtalar,
  altın çizgiler, ışıklı altın logo ve "DEVTECHNIC" yazısı, üst ışık şeridi, ödül rafı; pencere bandı iki yana
  bölündü, ortadaki bitki iki yana alındı. (3) **Alanlar**: masa altı çekmeceli dolaplar; toplantı odasında akustik
  paneller, konferans telefonu, bardaklar; mutfakta karo, mikrodalga, meyve kâsesi, küre lambalar; dinlenme
  alanında iki koltuk, yan sehpa, armut koltuk ve camgöbeği neon simge; lider köşesinde marka plaketi ve ödül
  rafı; girişte "Hoş geldiniz" paspası, karşılama totemi, portmanto. Yeni eşyalar yürüme ızgarasında engel; yollar
  testli. (4) **Dış görünüm**: ofis bir kulenin katı; odanın altında lacivert kat bandı ve altın şerit, alt katların
  cephesi (aşağı doğru kararır); şehir 12 m aşağıda. Kat bandına yazı denendi, genel görünümde basık göründüğü için
  kaldırıldı. (5) **Arayüz**: başlıkta DevTechnic simgesi ve adı, sekme simgesi DevTechnic. (6) Parlamaya hafif köşe
  karartma eklendi. Temalara kule renkleri (`tower`) eklendi, kullanılmayan `outside.front` kaldırıldı. Logo ve
  simge `web/public/brand/` altındaki yerel SVG'lerden kanvasa çiziliyor; yazılar sistem yazı tipiyle; yeni paket
  yok. Yeni testler: kadraj (7), DevTechnic kat planı (4). Üç temada, 1920/1440 (panel açık)/390 px'te ekran
  görüntüleriyle kontrol edildi. Bilinen sınır: telefonda dikey alan hâlâ tam dolmuyor (oda yatay; üstte şehir,
  altta kule cephesi görünüyor); kenar alanlar kaydırarak görülüyor.
- **20.11.2026:** Sürüm 4 (Yaşayan ofis) bitti. (1) **Oyun köşesi**: dinlenme alanının kuzeyinde alçak TV sehpası,
  konsol, TV ve önünde iki armut koltuk (eski tek armut koltuk kalktı); TV biri konsolda oynarken iki kişilik bölünmüş
  ekran yarış oyunu gösterir. Koltuklar da artık oturulabilir yer. (2) **Boşta etkinlikler** (`sim.ts`): masada video
  (ekranda gün batımı ya da gece şehri + oynatma çubuğu; liderde büyük ekranda), bilgisayarda oyun (platform oyunu),
  konsolda oyun (elinde oyun kolu; biri oynuyorsa yanına oturmak daha olası), kanepe, koltuk, kahve (dönüşte çoğu
  zaman video), gerinme. Ağırlıklı rastgele seçilir; uzun boşta (2,5 dk) dinlenme alanı ağır basar. Kanepe artık
  süreli (eskiden iş gelene kadar kalınıyordu): ofis donmasın diye. Dinlenme yerleri tek kişilik (`perch`); yoldayken
  iş gelirse ayrılan yer hemen boşalır (eskiden kanepe yeri sızabiliyordu). (3) **Ekip üyeleri ofiste kalır**:
  `.claude/agents` üyesinin masasında çalışan yoksa yalnızca sahnede bir boşta karakter (`uye:<ad>`) dolaşır; üyeye
  iş gelince aynı karakter kimlik değiştirip masasına döner (kapıdan girmez), iş bitince lidere rapor verip ofiste
  kalır; listeden düşse de çıkmaz; ekipten çıkarılan üye kapıdan çıkar. Genel yardımcılar eskisi gibi çıkar. Üye
  her işte aynı görünür (görünüm üye adından). Bu karakterler seçilemez; listede "masada değil" yerine "boşta".
  (4) Hareketi azalt açıkken boşta gezinme yine kapalı. Yeni testler: sim 9 (etkinlikler, yer çakışmaması, üye
  devri/raporu/çıkışı), ekran 1, plan (yeni yerlere yol). `npm run check` temiz (230 test). Demo ve gerçek ofiste
  ekran görüntüleriyle denendi; konsolda hata yok. README (TR/EN) güncel; README ekran görüntüleri yenilenmedi.
- **20.11.2026:** Sürüm 5 (Teknoloji şirketi ofisi) bitti. Yerleşim (`plan.ts` `zones.tech`): sol şeritte cam sunucu
  odası (3 dolap), girişe yakın tekerlekli kanban, toplantı odasının önünde atıştırmalık rafı, sol duvarda yosun
  duvarı (yerine iki saksı kaldırıldı), kapının üstünde giriş ekranı; sağ şeritte ayaklı duvar panosu + derleme lambası
  ve deney masası. Hepsi ada alanının dışında, ızgarada engel; yollar testli. Canlı mantık `office/ops.ts` (saf,
  6 test): derleme durumu (hata > bekliyor > çalışıyor > sakin), pano sayıları ve son 10 dk işlem grafiği (ajanların
  son işlemlerinden; ajan başına en fazla 20, kabaca), kanban sütunları (not kimliği ajan kimliği, iş bitince kayar),
  sunucu ışığı hızı, "Bugün ofiste" listesi. Çizim: `project/techFurniture.ts` (sabit parçalar, toplu çizim) ve
  `project/TechOps.tsx` (canlı parçalar: örnekli sunucu ışıkları ve lambalar, 3 kanvas ekran, LED şerit, 3B yazıcı,
  robot kol, drone, lehim kıvılcımı). Kahve köşesi espresso makinesi ve değirmenle büyüdü; masalara mekanik klavye,
  lastik ördek, kulaklık standı, çıkartmalı dizüstü, sandalyelere kapüşonlu eklendi (masa çeşidine göre). Yeni boşta
  etkinlik: deney masasında ayakta kurcalama (`lab`, tek kişilik; drone havalanır, kıvılcım çıkar). Ölçüm: canlı
  parçalar 13 nesne, açıp kapatarak ölçüldü: kare başına ~10 çizim çağrısı (demo ofisinde toplam ~600); ilk hâlinde
  27 nesneydi, parçalar birleştirilerek indirildi. Sabit eşyalar 6 yeni toplu çizim grubu ekledi. Üç temada ve yakın
  çekimlerle görünmez Chrome'da kontrol edildi (ekranda pencere açılmadı). Hata: sunucu odasının üstüne yanlışlıkla
  düz tavan konmuştu (oda siyah kutu görünüyordu), açık çerçeveyle değiştirildi. `npm run check` temiz (237 test).
  README (TR/EN) güncel; README ekran görüntüleri yenilenmedi. Geliştirme kancasına (`__ajanOfisi`) sahne eklendi
  (yalnızca geliştirme modunda).
- **20.11.2026:** Sürüm 6 (Dış mekân) bitti. Eski dış mekân (düz zemin, tek yol, sokak lambası çubukları, çatısı da
  pencereli binalar) kaldırıldı; yerine `project/exterior.ts` (saf, 5 test) ve `project/Exterior.tsx`. Kule 5×5 blok
  ızgarasının ortasında: yollar (şerit çizgileri, kulenin dört köşesindeki kavşaklarda yaya geçitleri), kaldırımlı
  bloklar; yakın halkada ofis katından alçak binalar (parapet, merdiven kulesi, klima, su deposu, güneş paneli, çatı
  bahçesi, ışıklık ya da helikopter pisti), park ve gölet, otopark, fıskiyeli meydan; kule bloğunda giriş saçağı, lobi
  camı, saksılı ağaçlar, banklar, bisiklet parkı; uzak halkada yüksek binalar. Kaldırımda ağaçlar ve sokak lambaları;
  gece lamba başlıkları yanar ve yerde ışığa eklenen, kenara doğru solan ışık havuzları çizilir (ilk denemedeki opak
  diskler çamur birikintisi gibi görünüyordu). Yollarda sağdan akan ~60 araba (örnekli; gece farlar/stop lambaları;
  hareketi azaltta durur). Bina gövdeleri: yanlarda pencere dokusu, üstte temanın çatı rengi; kutunun altı yüz grubu
  iki gruba indirildi (sınıf başına 6 yerine 2 çizim). Temalara dış mekân renkleri eklendi (kaldırım, çim, su, yol
  çizgisi, çatılar, parapet, yaprak, gövde). Ölçüm (gerçek ofis, gece, açıp kapatarak): şehir kare başına +36 çizim
  çağrısı (372 → 408) ve ~+38 bin üçgen; ağaç gövdeleri ve direkler 6 kenarlı silindire çevrildi. Gündüz saçak camı
  yukarıdan yüzme havuzu gibi göründüğü için düz çatıya çevrildi. `npm run check` temiz (242 test). Üç temada ve
  birkaç açıdan görünmez Chrome'da kontrol edildi. README (TR/EN) güncel; README ekran görüntüleri yenilenmedi.
- **20.11.2026:** Kararlılık ve gece teması (kullanıcı istedi; ekiple: geliştirici + tasarımcı, ikisi de sonnet). (1) Gece
  teması pembe/kırmızı yerine gerçek gece: lacivert duvarlar (#1c2a42), koyu doğal parke, amber vurgu (#ffb547), soluk
  sıcak beyaz neon (#ffe2b0), sıcak ada lambaları, soğuk ay ışığı; `styles.css` varsayılanları da buna eşlendi (tema
  yüklenmeden pembe görünmesin). Parke tasarımcının önerisiyle biraz açıldı (light 17 → 21). (2) Dış mekân üç temada
  aynı: `themes.ts` başında ortak şehir/kule paleti; temalar arasında yalnızca gece/gündüz farkı (pencerelerin yanması,
  ışık); Gece ve Kuzey aynı gece gökyüzünü ve sisini paylaşıyor. (3) Titreme: kamera `near` 0.1 → 0.3; dış mekânda
  aynı düzlemde çakışan katmanlar ayrıldı (kaldırımın ikinci ince kutusu kaldırıldı; çizgiler, geçitler, patikalar ve
  otopark çizgileri en az 0.015–0.03 yukarıda). Tasarımcı kontrolü: dört görüntü, titreme gözlenmedi, okunurluk iyi.
  Kalan: CLI rozeti rengi (`--cli`) anlamsal olduğu için pembe bırakıldı. `npm run check` temiz (242 test).
- **20.11.2026:** Kapanış işleri (kullanıcı onayladı): Kuzey temasının açıklaması düzeltildi (şehir artık ortak),
  README ekran görüntüleri demo verisiyle yeniden alındı (11 görüntü), Sürüm 3–6 ve gece teması tek commit olarak
  kaydedilip GitHub'a gönderildi (`zinkxx/agent-office`, `main`, b1d63f0). Açık kalan: masaüstü paketleme (kullanıcının
  kararı).
- **20.11.2026:** Lider köşesi masası yenilendi (`furniture.ts`): geniş ana ekran + web kamerası, kollu iki yan ekran
  (`side`, gerçek ekran noktası; eski L kolu monitörü kaldırıldı), RGB klavye, büyük mat, mouse, bom kollu mikrofon,
  kulaklık standı, plaket, kupa, ödül, bitki, lamba, telefon standı, defter-kalem; masanın sağında cam panelli, renkli
  fanlı oyuncu kasası; lidere özel yüksek sırtlı baş yastıklı koltuk (`leadChair`). `plan.ts`'e kasa için ızgara engeli.
- **20.11.2026:** Depo herkese açık olduğu için temizlik (kullanıcı istedi). Kullanıcının diğer projelerinin adları
  ve bilgisayar kullanıcı adı depodan çıkarıldı: demo/fixture projeleri Atlas, Nova, Pusula oldu, yollar
  `/Users/kullanici`; README ekran görüntüleri yeniden alındı. `.claude/skills` (dışarıdan gelen yardım belgeleri)
  depodan çıkarıldı, yerelde duruyor (`.gitignore`). Git e-postası GitHub'ın gizli adresine çevrildi (yalnızca bu
  depo); kişisel e-posta içeren eski geçmiş tek bir yeni kayda indirilip GitHub'a zorla gönderildi. Lider köşesi
  yenilemesi de bu kayıtta.

- 20.11.2026: Ayarlara "Marka" eklendi (`settings.brand`: 'sade' varsayılan | 'devtechnic', localStorage). Marka dokuları/yazıları/başlık markaya bağlı (`office/brand.ts`, textures.ts, Room.tsx, App.tsx); sade markada simge kanvasla çizilir, `/brand/` dosyaları yalnızca DevTechnic'te yüklenir. Mobilya anahtarına marka eklendi; sekme başlığı "Ajan Ofisi", simge `web/public/favicon.svg`.

- 20.11.2026: Statik demo kipi (VITE_STATIC_DEMO=1): arayüz WebSocket yerine tarayıcıda OfficeStore + startDemo (kalabalık) çalıştırır; anlık görüntüler `applySnapshot` ile aynı yoldan geçer (web/src/staticDemo.ts). Başlıkta "Canlı demo · uydurma veriler" rozeti. web tsconfig `types`a "node" eklendi (yalnızca tip kontrolü için).
- `.github/workflows/pages.yml` + `npm run build:demo` (taban /agent-office/): main gönderiminde GitHub Pages yayını. Yerelde doğrulandı. Kullanıcı: Settings → Pages → Source: GitHub Actions.
- **20.11.2026:** GitHub vitrini (kullanıcı istedi, tarayıcıda kullanıcı girişiyle): Pages kaynağı GitHub Actions,
  canlı demo yayında (https://zinkxx.github.io/agent-office/); depo açıklaması, web sitesi ve konu etiketleri;
  sosyal önizleme görseli; proje profilde sabitlendi, profil README'sine "New: Agent Office" bölümü ve tablo satırı
  eklendi (zinkxx/zinkxx). İlk sürüm v1.0.0 yayınlandı (etiket + sürüm notu, demo GIF'iyle).
- **21.11.2026:** GitHub vitrini 2 (kullanıcı istedi): `.github/ISSUE_TEMPLATE/` (hata bildirimi, özellik fikri, canlı
  demo bağlantısı; gizlilik uyarılı, İngilizce, Türkçe yazılabilir). README'lerde sabit test rozeti yerine canlı CI
  rozeti, sürüm ve issue rozetleri (TR/EN test sayıları birbirini tutmuyordu). Başlangıç issue'ları, ek etiketler ve
  herkese açık "Agent Office Roadmap" proje panosu GitHub'da açıldı.
- **21.11.2026:** Topluluk dosyaları ve v1.0.1 (kullanıcı istedi): CONTRIBUTING.md, SECURITY.md (GitHub özel güvenlik
  bildirimi açıldı), CODE_OF_CONDUCT.md, PR şablonu (gizlilik kontrol listesi), dependabot.yml (aylık, gruplu),
  CHANGELOG.md; README'lere "Katkı" bölümü. Depoda Discussions açıldı, boş wiki kapatıldı, Dependabot güvenlik
  güncellemeleri etkin. Issue #1 düzeltildi: sade markada marka duvarı logosu yalnızca simge çiziyor (yazı tek,
  altındaki şeritte). Paket sürümleri 0.1.0 → 1.0.1 (GitHub sürümüyle hizalandı).
