# Sürüm 3 · Görsel araştırma (V3.1)

20.11.2026. Amaç: ofisi DevTechnic'in ofisi yapmak ve görsel kaliteyi artırmak; uygulama çalışırken internetten hiçbir
şey indirmemek, yeni paket eklememek.

## 1. Marka

Kaynak: kullanıcının sitesi (devtechnic.com.tr). Dosyalar bir kez indirildi, `web/public/brand/` altında duruyor;
uygulama bunları Vite'ın yerel sunucusundan okur.

| Dosya                      | İçerik                                                  | Kullanım                               |
| -------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `devtechnic-logo.svg`      | Altın logo (sitenin ana logosu, "DEV NetData"), 300×150 | Marka duvarı, kat tabelası             |
| `devtechnic-logo-navy.svg` | Aynı logo, lacivert (açık zemin için)                   | Gün ışığı temasında açık yüzeyler      |
| `devtechnic-logo.png`      | Altın logonun PNG hali                                  | Yedek                                  |
| `devtechnic-icon.svg`      | Camgöbeği çizgisel sunucu dolabı simgesi                | Karşılama totemi, neon tabela, favicon |

**Marka renkleri** (SVG dosyalarından):

| Ad        | Renk      | Nerede                                           |
| --------- | --------- | ------------------------------------------------ |
| Altın     | `#eab308` | Logo, ışıklı tabela, ince şeritler               |
| Lacivert  | `#0f172a` | Marka duvarı paneli, kat bandı, akustik paneller |
| Camgöbeği | `#64ffda` | Simge, neon tabela, küçük vurgu ışıkları         |

Marka renkleri temadan bağımsızdır (her temada aynı kalır); çevrelerindeki duvar ve ışıklar temaya uyar.

## 2. Kurulu sürümler ve kullanılabilecek teknikler

Kurulu: three 0.170, @react-three/fiber 9, @react-three/drei 10.7, @react-three/postprocessing 3.2 / postprocessing
6.39. Hepsi çevrimdışı çalışır.

| Teknik                                   | Karar      | Neden                                                                                  |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| Kanvasla üretilen dokular                | **Kullan** | Logo, karo, kat cephesi, karşılama paspası. Mevcut `textures.ts` yaklaşımıyla aynı     |
| SVG → kanvas → doku                      | **Kullan** | Logo keskin kalır, dosya yerel (`/brand/...`)                                          |
| Parlama (Bloom) eşiği                    | **Kullan** | Logo ve neon tabela renk çarpanıyla eşiği aşar, gece temalarında ışıldar               |
| Vignette (köşe karartma)                 | **Kullan** | Ucuz, odağı ofise toplar; düşük güç modunda zaten efektler kapalı                      |
| InstancedMesh (`StaticBatch`)            | **Kullan** | Yeni eşyalar parça olarak eklenir, çizim çağrısı neredeyse artmaz                      |
| drei `Text` / `Text3D`                   | Kullanma   | Yazı tipini internetten indirir (kural 2). Yazılar kanvasa sistem yazı tipiyle çizilir |
| drei `Environment` ön ayarları           | Kullanma   | HDR dosyasını internetten indirir                                                      |
| `Environment` + `Lightformer`            | Ertele     | Çevrimdışı çalışır ama üç temanın ışık dengesini baştan ayarlamayı gerektirir          |
| SSAO / N8AO                              | Kullanma   | Normal geçişi gerektirir, kare hızını belirgin düşürür; gölgeler yeterli               |
| `MeshReflectorMaterial` (yansıyan zemin) | Kullanma   | Sahneyi ikinci kez çizer; 20 karakterli ofiste maliyetli                               |
| `ContactShadows`                         | Kullanma   | Mevcut gölge haritasıyla çakışır, ek çizim                                             |

## 3. Sayfa düzeni bulguları

- Kamera açısı sabitti (dikeyden ~35°) ve yalnızca odanın sığmasına bakıyordu. Geniş ekranda oda yatay sınıra
  dayanıyor, altta ve üstte boş, simsiyah bir alan kalıyordu. Telefonda oda çok küçük kalıyor ya da (ilk kadraj
  yanlış alınınca) yarısı görünüyordu.
- Odanın önündeki "kesit" zemini tek renk koyu bir düzlemdi; kadrajda kalan alt bölge boş görünüyordu.
- Çözüm yönü: kadraj açısını ve hedefini ekranın en-boy oranına göre seçmek (ekranı en çok dolduran açı), dar
  ekranda çalışma alanını kadraja almak; odanın altını binanın cephesi ve kat bandıyla anlamlı hale getirmek.

## 4. Yerel skill'ler

`.claude/skills/r3f-*` (fundamentals, geometry, materials, lighting, textures, postprocessing, interaction): r3f
kullanım kalıpları. Bu sürümde özellikle `r3f-textures` (CanvasTexture), `r3f-postprocessing` (efekt sırası) ve
`r3f-geometry/instancing` yönergeleri izlendi.

## 5. Performans bütçesi

- Çizim çağrısı: 13 karakterli dolu ofiste ~320. Hedef: +%10'dan az (yeni eşyalar mevcut toplu çizim gruplarına
  girer; yeni dokulu yüzeyler en fazla ~10 ayrı mesh).
- Gölge düşüren yeni parça yok denecek kadar az; dokular tek seferlik üretilip önbelleklenir.
