# Örnek kayıtlar (uydurma)

`claude-home/` gerçek `~/.claude` klasörünün **uydurma** bir taklididir; testler bunu kullanır.
Gerçek kayıt dosyaları buraya asla kopyalanmaz.

- "GİZLİ" geçen her metin, ekrana ya da tarayıcıya **asla ulaşmaması** gereken içeriği temsil eder. Testler,
  sunucunun gönderdiği hiçbir veride "GİZLİ" / "GIZLI" geçmediğini doğrular.
- `sessions/*.key` dosyası okunmamalıdır.
- Kasıtlı olarak bir bozuk satır ve bir bilinmeyen satır türü içerir (okuyucu çökmemeli).
- Bir alt ajan (`Agent` aracıyla) ve bir iş akışı alt ajanı (`subagents/workflows/`) vardır.
- `atlas-demo` → `nova-demo` bir `SendMessage` içerir.
