# Padok Mimari Notlari

Bu dokuman uygulamanin nasil buyuyecegini anlatir. Amac, Gazi Kosusu icin karar destek sistemi kurarken veriyi, API'yi ve analiz katmanini birbirine karistirmamak.

## 1. Urun Hedefi

Padok ilk asamada "tek dogru tahmin" veren bir model degil. Daha saglam hedef:

- Aday atlari tek ekranda toplamak.
- Gazi'ye benzer kosulardaki performanslari karsilastirmak.
- Jokey, pist, mesafe, form ve sinif sinyallerini acik sekilde gostermek.
- Modelin veya skorun neden bir ati yukari/asagi koydugunu anlatmak.

Bu bizi daha guvenilir bir yere getirir: once okunabilir analiz, sonra otomatik tahmin.

## 2. Veri Yapisi

Ilk ciddi veri deposu icin SQLite yeterli. Sebep:

- Kurulumu basit.
- Versiyonlanabilir ve tasinabilir.
- Python analiz scriptleriyle rahat calisir.
- API eklenince dosya tabanli JSON'dan daha guvenilir olur.

Onerilen tablolar:

### races

Her kosu icin tek satir.

- `id`
- `source`
- `source_race_id`
- `date`
- `venue`
- `race_no`
- `name`
- `class`
- `age_condition`
- `breed`
- `sex_condition`
- `distance_m`
- `surface`
- `direction`
- `weather`
- `track_condition`

### race_entries

Bir kosuya katilan her at icin tek satir.

- `race_id`
- `horse_id`
- `gate`
- `jockey_id`
- `trainer_id`
- `owner`
- `weight`
- `handicap_point`
- `starting_price`
- `finish_position`
- `finish_time`
- `margin`
- `last_800`
- `last_600`
- `scratched`

### horses

At kimligi ve sabit profil.

- `id`
- `name`
- `birth_year`
- `breed`
- `sex`
- `sire`
- `dam`
- `owner`
- `trainer_id`

### jockeys

Jokey kimligi ve zamanla hesaplanacak performans metrikleri.

- `id`
- `name`
- `active`

### derived_features

Model veya skor icin uretilmis ozellikler.

- `horse_id`
- `as_of_date`
- `gazi_fit_score`
- `class_score`
- `stamina_score`
- `course_score`
- `form_score`
- `jockey_score`
- `data_confidence`

## 3. API Yazalim mi?

Evet, ama hemen degil. Once ingestion ve veri modeli netlesmeli.

Dogru siralama:

1. Statik MVP ve JSON ile hipotezi tartis.
2. TJK parser ile veriyi otomatik normalize et.
3. SQLite'a yaz.
4. FastAPI ile read-only API ac.
5. Frontend'i API'den besle.

Neden FastAPI? Bu proje veri analizi ve ML tarafina kayacak. Python ekosistemi; pandas, scikit-learn, lightgbm, statsmodels ve PDF/HTML parse araclari icin daha dogal.

Ilk API endpointleri:

- `GET /api/races?year=2025&similar_to=gazi`
- `GET /api/horses/{horse_id}/form`
- `GET /api/gazi/{year}/candidates`
- `GET /api/gazi/{year}/scores`
- `GET /api/jockeys/{jockey_id}/profile`
- `POST /api/ingest/tjk?year=2026`

`POST /api/ingest` daha sonra admin/yerel is olabilir; public uygulamada acik bir endpoint olmak zorunda degil.

## 4. Gazi Benzeri Kosular Sadece Bunlar mi?

Hayir. Ilk liste bilincli olarak dar tutuldu. Gazi icin kosulari uc katmanda dusunmek daha iyi.

### Cekirdek Prep Kosular

Gazi'ye en yakin ve en dogrudan sinyal verenler:

- Mehmet Akif Ersoy Kosusu
- Sait Akson Kosusu
- Kisrak Kosusu
- Erkek Tay Deneme
- Disi Tay Deneme

### Destekleyici Sinyal Kosulari

Gazi'ye birebir benzemese de kalite, hiz, mesafe veya pist uyumu gosterebilir:

- Anafartalar Kosusu
- Fevzi Cakmak Kosusu
- Tendurek Kosusu
- Preveze Kosusu
- Sakarya Kosusu
- Caldiran Kosusu
- Karayel Kosusu

Bu liste veriyle dogrulanmali. Isim ezberiyle degil, kosu profili ve gecmis korelasyonla karar vermek lazim.

### Atin Tum Gecmisi

Evet, atin diger kosulari da onemli. Ama hepsinin agirligi ayni olmamali.

Ornek agirlik mantigi:

- 2400m cim G1/G2: cok yuksek agirlik.
- 2100-2200m cim: yuksek agirlik.
- 1600m cim klasik kosular: sinif ve hiz icin orta-yuksek agirlik.
- Kum/sentetik kosular: baglamsal, daha dusuk agirlik.
- Maiden veya sartli kosular: erken kalite sinyali olabilir, ama son karar icin zayif kalir.

## 5. Jokey Nasil Dahil Edilir?

Jokeyi tek basina "iyi jokey" diye puanlamak fazla kaba olur. Daha anlamli ozellikler:

- Jokeyin atla gecmisi: daha once bu atla kazanmis mi, tabelaya girmis mi?
- Jokeyin Veliefendi cim performansi.
- Jokeyin 2000m+ cim kosulardaki performansi.
- Jokeyin G1/G2 tecrubesi.
- Jokey degisikligi: son starta gore ayni jokey mi, yeni jokey mi?
- At-jokey uyumu: ayni atla ortalama bitiris sirasi veya beklenen performansin ustune cikma.

Baslangic skoru:

`jockey_score = course_experience + distance_experience + horse_pairing + class_experience`

Bu skor her zaman at skorunun yaninda gorunmeli, at skorunun icine sessizce gomulmemeli. Boylece kullanici "bu at iyi ama jokey degisikligi riskli" diyebilir.

## 6. Gazi Atlari Henuz Belli Degilse Akis Ne Olacak?

Iki mod kurmaliyiz.

### Aday Havuzu Modu

Gazi oncesi donem:

- 3 yasli Ingiliz taylar toplanir.
- Klasik/prep kosularda kosanlar isaretlenir.
- Gazi profil uyumu hesaplanir.
- "Kesin aday degil" etiketiyle gosterilir.

### Deklare / Kesin Field Modu

Gazi kosacak atlar belli olunca:

- TJK deklare veya program sayfasi okunur.
- Aday havuzu kesin listeye filtrelenir.
- Start no, jokey, kilo, son durum eklenir.
- Skorlar yeniden hesaplanir.
- Eksik veri alanlari kullaniciya acikca gosterilir.

Bu akis otomatik olabilir. Ama ilk versiyonda manuel tetiklenen ingestion daha guvenli:

```text
TJK sayfasi cek -> raw olarak sakla -> parse et -> normalize et -> skorlari hesapla -> UI guncelle
```

## 7. Analiz ve ML Siralamasi

Makine ogrenmesine hemen atlamamak lazim. Veri az ve gurultulu olacak.

Dogru sira:

1. Kural tabanli skor.
2. Gecmis yillar uzerinden backtest.
3. Feature onemi analizi.
4. Basit ranking modeli.
5. Model aciklamalari.

Ilk metrikler:

- Gazi ilk 3'u yakalama.
- Kazanan at ilk 5 skor icinde mi?
- Prep kosusu galipleri Gazi'de nasil kosmus?
- Skor yuksek ama basarisiz atlarda hangi riskler kacirilmis?

## 8. Mevcut Durum

Bu repo artik ilk statik MVP'nin otesine gecti:

- TJK AJAX HTML fragmentleri parse ediliyor.
- SQLite semasi ve importer scriptleri var.
- Gunluk sonuc sayfalarindan at bazli `race_entries` verisi alinabiliyor.
- 2020-2025 Gazi rota raporlari JSON olarak export edildi.
- `scripts/backtest-gazi-route.mjs` ile aciklanabilir tarihsel route backtest uretiliyor.
- `scripts/build-gazi-participation.mjs` ile Gazi atlari icin horse x route race matrisi uretiliyor.
- UI'da data status ve backtest bolumleri var.
- UI'da hangi Gazi atinin hangi prep kosusuna katildigi veya katilmadigi gorunuyor.
- GitHub Pages workflow'u testleri calistirip static site'i deploy ediyor.

## 9. Onumuzdeki Sprint

Bir sonraki teknik sprint su olmali:

1. At merkezli detay ekranina jokey, sahip ve pedigree bilgisini bagla.
2. Route entry listelerini collapse/expand hale getir.
3. 2026 aday/deklare modunu resmi veriyle besle.
4. Pedigree, sahip, jokey ve form sinyallerini ayri feature gruplari olarak hesapla.
5. Daha sonra FastAPI veya MCP icin ortak read-only query module tasarla.
