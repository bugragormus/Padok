# Padok

Gazi Kosusu odakli at yarisi analiz uygulamasi.

Bu repo su anda bilincli olarak bagimliliksiz bir statik MVP olarak kuruldu. Amac once veri modelini, temel korelasyon mantigini ve arayuz ihtiyacini netlestirmek; TJK ingestion ve SQLite katmani uzerinden giderek daha sonra API ve ML katmanina gecmek.

Yeni chat veya yeni geliştirme oturumu için önce `docs/project-status.md` dosyasını oku. Bu dosya mevcut durum, canlı yayın, veri kapsamı, kritik varsayımlar ve sıradaki işleri özetler.

## Ilk Hipotez

Gazi Kosusu icin tek bir "tahmin" uretmek yerine once Gazi'ye benzeyen kosulardan gelen sinyalleri yan yana koymak daha saglikli:

- Kosu uyumu: pist, mesafe, yas, irk, cinsiyet kosullari.
- Performans: derece, bitiris sirasi, fark, son 800/600 varsa tempo.
- Istikrar: son startlarda sira ve handikap puani degisimi.
- Baglam: jokey, antrenor, pist/hava, kilo, yaris sertligi.

Onemli not: Her Gazi ati her sinyal kosusuna katilmaz; her sinyal kosusu ati da Gazi'ye gitmez. Bu nedenle katilmama bilgisi de analizde gorunur bir sinyal olarak ele alinmalidir.

## Mevcut Durum

Uygulama su anda:

- TJK'den turetilmis 2025 Gazi rota verisini UI'da gosterir.
- 2020-2025 Gazi rota raporlarini ve backtest sonucunu repo icinde tutar.
- Gazi ilk 3 ile rota kosulari arasindaki iliskiyi aciklanabilir metriklerle gosterir.
- Gazi koşucularının hangi rota koşularına katıldığını veya katılmadığını at bazlı matriste gösterir.
- GitHub Pages uzerinde ucretsiz ve statik olarak calisir.
- GitHub Actions ile testleri calistirir ve canli JSON artefactlarini deploy eder.

Canli uygulama:

```text
https://bugragormus.github.io/Padok/
```

## Kaynak Notlari

- TJK `KosuSorgulama` endpoint'i tablo satirlari halinde tarih, sehir, kosu sirasi, grup, kosu cinsi, mesafe, pist, kazanan, derece ve handikap puani gibi alanlar donduruyor.
- TJK gunluk program/sonuc PDF'leri daha detayli yaris dokumleri icin kullanilabilir.
- Yenibeygir gecmis kosu sayfalari ikinci kaynak/dogrulama katmani olarak dusunulebilir.

## Veri Modeli

`data/gazi-knowledge-base.json` icinde uc ana katman var:

- `targetRace`: Gazi Kosusu'nun hedef profilini tutar.
- `prepRaces`: Gazi oncesi izlenecek onemli kosulari ve neden onemli olduklarini anlatir.
- `horses`: Aday atlar icin ornek performans sinyalleri ve notlar.

Bu ayrim onemli: UI, analiz ve veri cekici ayni dosyaya gomulmez. Veri buyudukce sadece JSON yerine SQLite veya Postgres'e gecilebilir.

## Calistirma

```bash
npm run dev
```

Sonra tarayicida `http://localhost:5173` ac.

Alternatif olarak `index.html` dosyasini dogrudan tarayicida acmak da yeterli.

## Veri Yenileme

2025 Gazi rota raporunu lokal DB'deki eksik gunluk sonuclarla yenilemek icin:

```bash
npm run refresh:gazi-route -- --year 2025 --out data/gazi-route-report.json
npm run build:gazi-participation -- --input data/gazi-route-report.json --out data/gazi-participation-report.json
```

Bu komut sonucu eksik ama tarihi gecmis Gazi rota kosularini bulur, TJK gunluk sonuc sayfalarini ceker, at bazli entry verilerini import eder ve frontend'in okudugu JSON raporunu yeniden uretir.

Canli ve ucretsiz yayin plani icin bkz. `docs/live-data-plan.md`.
Gelecekteki MCP server plani icin bkz. `docs/mcp-plan.md`.
Genisletilmis feature ve agirlik stratejisi icin bkz. `docs/feature-strategy.md`.
Ilk aciklanabilir rota backtest metodolojisi icin bkz. `docs/backtest-method.md`.
Guncel proje devri ve roadmap icin bkz. `docs/project-status.md`.

## Mimari Karar

Kisa vadede veri akisi su sekilde ilerleyecek:

1. Ingestion scriptleri TJK/Yenibeygir kaynaklarini okur.
2. Ham veri `raw` klasor mantigiyla saklanir.
3. Normalize edilmis veri SQLite tablolarina yazilir.
4. Static export katmani frontend'in okuyacagi JSON raporlarini uretir.
5. Sonraki asamada API bu tablolardan aday, kosu, jokey ve skor verisini servis eder.

Detayli kararlar icin bkz. `docs/architecture.md`.

## Sonraki Gelistirme Adimlari

1. At merkezli detay/karşılaştırma ekranı ekle.
2. 2026 Gazi field/deklare listesini resmi veriden iceri al.
3. At performansi, jokey, pedigree, sahip ve trainer sinyallerini ayri skor gruplari olarak hesapla.
4. Skorları gecmis yillarda backtest et; tek bir nihai puana gommeden UI'da ayri ayri goster.
5. Route entry listelerini collapse/expand hale getir.
6. Veri seti yeterince buyuyunce baseline ranking modeli dene.
