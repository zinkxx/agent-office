# Sürüm 3 · DevTechnic ofisi tasarım planı (V3.2)

20.11.2026. Dayanak: [gorsel-arastirma.md](gorsel-arastirma.md). Kat planı (`sim/plan.ts`) ana hatlarıyla aynı kalır:
toplantı odası ve mutfak solda, adalar ortada, lider köşesi ve kanepe sağda; karakterlerin yolları ve masa
atamaları değişmez.

```
x=0                                                              x=W
┌──────────────┬─── pencere ───┬ MARKA DUVARI ┬─── pencere ───┬────────────┐ z=0
│ toplantı     │               │  [logo]      │               │ lider      │
│ (akustik     │   [ada]       │  DevTechnic  │      [ada]    │ köşesi     │
│  paneller)   │               │              │               │ (plaket)   │
│ mutfak       │   [ada]                              [ada]    │ tahta      │
│ (karo, bar)  │                                               │ kitaplık   │
│ totem ▢      │                                               │ kanepe +   │
│ kapı ⇥ paspas│                                               │ koltuklar  │
└──────────────┴───────────────────────────────────────────────┴────────────┘ z=D
════════════════ kat bandı: DevTechnic (lacivert, altın şerit) ════════════════
                 alt katların cephesi (ışıklı pencereler)
```

## Alan alan

| Alan                | Bugün                                             | Sürüm 3                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Marka duvarı**    | Arka duvarın tamamı pencere                       | Arka duvarın ortasında 5 m'lik dolu duvar: lacivert panel, dikey ahşap çıtalar, altın çerçeve, ışıklı altın logo, altında "DevTechnic" yazısı, tavandan aşağı vuran ışık şeridi; iki yanında bitki |
| **Çalışma adaları** | Masa, monitör, kişisel eşya                       | Her masanın altında çekmeceli dolap, masa kenarında kablo kanalı; ada halılarında ince marka şeridi                                                                                                |
| **Lider köşesi**    | Köşe masa, büyük ekran, dolap                     | Sağ duvarda lacivert zeminde camgöbeği simgeli marka plaketi, ödül rafı                                                                                                                            |
| **Toplantı odası**  | Cam duvar, masa, ekran                            | Sol duvarda lacivert/camgöbeği akustik panel dizisi, masanın üstünde uzun sarkıt ışık, masada konferans telefonu ve su bardakları                                                                  |
| **Dinlenme alanı**  | Kanepe, sehpa, lambader                           | Karşısında iki koltuk ve yan sehpa, armut koltuk, duvarda camgöbeği neon simge tabelası                                                                                                            |
| **Mutfak**          | Tezgah, kahve makinesi, buzdolabı, bar            | Tezgah arkasında karo kaplama, mikrodalga, bar masasında meyve kâsesi, barın üstünde iki sarkıt lamba, su sebili                                                                                   |
| **Giriş**           | Kayar cam kapı, çıkış ışığı                       | Kapı önünde logolu karşılama paspası, camgöbeği simgeli karşılama totemi, portmanto                                                                                                                |
| **Dış görünüm**     | Odanın önünde boş koyu zemin, şehir aynı seviyede | Ofis bir kulenin katı: önde lacivert kat bandı ve altın şeritli "DevTechnic" yazısı, altında alt katların ışıklı cephesi; şehir aşağıda kalır (yüksek kat hissi)                                   |
| **Sayfa düzeni**    | Sabit açı, altta boşluk                           | Ekran oranına göre kadraj (en çok dolduran açı ve hedef); dar ekranda çalışma alanı kadrajda                                                                                                       |
| **Arayüz**          | "Ajan Ofisi" başlığı                              | Başlıkta küçük DevTechnic simgesi, sekme simgesi (favicon) DevTechnic simgesi                                                                                                                      |

## Kurallar

- Marka renkleri: altın `#eab308`, lacivert `#0f172a`, camgöbeği `#64ffda`; her temada aynı.
- Yeni eşyalar `StaticBatch` parçası olarak eklenir; dokulu yüzeyler (logo, yazı, karo, cephe, paspas) ayrı mesh.
- Yürüme ızgarası yeni eşyaları engel olarak bilir; kapıdan her masaya, kahveye ve kanepeye yol kalır (testli).
- Gölge düşüren yeni parça yalnızca büyük eşyalarda (koltuklar).
- Hiçbir doku internetten gelmez; yazılar sistem yazı tipiyle kanvasa çizilir.

## Kabul

- Üç temada (Gece, Gün ışığı, Kuzey) marka duvarı okunur, renkler uyumlu.
- 1920, 1440 (panel açık/kapalı) ve 390 px genişlikte ofis ekranı doldurur; altta boş siyah alan kalmaz.
- `npm run check` geçer; çizim çağrısı artışı %10'un altında; ağ isteği yalnızca `127.0.0.1`.
