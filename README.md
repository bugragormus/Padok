# Padok

Gazi Kosusu odakli at yarisi analiz uygulamasi.

Bu repo su anda bilincli olarak bagimliliksiz bir statik MVP olarak kuruldu. Amac once veri modelini, temel korelasyon mantigini ve arayuz ihtiyacini netlestirmek; daha sonra TJK/Yenibeygir ingestion, SQLite/Postgres ve ML katmanina gecmek.

## Ilk Hipotez

Gazi Kosusu icin tek bir "tahmin" uretmek yerine once Gazi'ye benzeyen kosulardan gelen sinyalleri yan yana koymak daha saglikli:

- Kosu uyumu: pist, mesafe, yas, irk, cinsiyet kosullari.
- Performans: derece, bitiris sirasi, fark, son 800/600 varsa tempo.
- Istikrar: son startlarda sira ve handikap puani degisimi.
- Baglam: jokey, antrenor, pist/hava, kilo, yaris sertligi.

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

## Mimari Karar

Kisa vadede veri akisi su sekilde ilerleyecek:

1. Ingestion scriptleri TJK/Yenibeygir kaynaklarini okur.
2. Ham veri `raw` klasor mantigiyla saklanir.
3. Normalize edilmis veri SQLite tablolarina yazilir.
4. API bu tablolardan aday, kosu, jokey ve skor verisini servis eder.
5. Arayuz API'den okur ve analiz panosunu gunceller.

Detayli kararlar icin bkz. `docs/architecture.md`.

## Sonraki Gelistirme Adimlari

1. TJK `KosuSorgulama` HTML satirlarini parser ile normalize et.
2. Gazi, Mehmet Akif Ersoy, Sait Akson, Kisrak, Erkek Tay Deneme, Disi Tay Deneme ve diger sinyal kosularini yillara gore indeksle.
3. Gunluk sonuc sayfalarindan at bazli siralama/derece/fark/jokey/antrenor detaylarini cek.
4. Aday listesi henuz kesin degilken "aday havuzu", kesinlestikten sonra "Gazi field" moduna gec.
5. Her at icin "Gazi uyum skoru", "form trendi", "jokey uyumu" ve "veri guveni" hesapla.
6. Veri seti yeterli olunca baseline ML denemesi yap: once backtest ve ranking modeli, sonra daha karmasik yontemler.
