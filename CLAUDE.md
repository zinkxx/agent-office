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

## Başka projeler

- `~/Desktop` altındaki diğer proje klasörlerine **dokunma**. Bu proje yalnızca kendi klasöründe çalışır.
