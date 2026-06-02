# Ingestion Strategy

Bu dokuman TJK ve benzeri kaynaklardan veriyi nasil alacagimizi anlatir. Kod, commit ve teknik isimlendirme Ingilizce kalacak; urun icerigi Turkce olabilir.

## 1. HTML Parse Tek Secenek mi?

Hayir, ama su an en guvenilir resmi gorunen yol HTML tabanli endpointleri kullanmak.

TJK tarafinda klasik anlamda acik bir JSON API bulmus degiliz. Ancak site tamamen statik HTML de degil. `KosuSorgulama` sayfasi AJAX ile calisiyor:

- `/TR/YarisSever/Query/Page/KosuSorgulama`: form, filtreler ve ilk tabloyu verir.
- `/TR/YarisSever/Query/Data/KosuSorgulama`: tablo iskeleti ve ilk veri bolumunu verir.
- `/TR/YarisSever/Query/DataRows/KosuSorgulama`: sayfa sayfa tablo satiri fragmentleri verir.

Bu nedenle stratejimiz "butun sayfayi scrape etmek" degil. Daha dogru ifade:

`TJK AJAX HTML fragmentlerini cek -> normalize et -> kendi stabil veri modelimize yaz`

Bu, tam sayfa parse etmekten daha hizli ve daha az kirilgan.

## 2. Kendi TJK API'mizi Olusturabilir miyiz?

Evet. Buradaki fikir TJK'nin yerine gecmek degil; TJK uzerindeki oynak HTML katmanini bizim uygulamamiz icin stabil hale getirmek.

Onerilen internal akis:

```text
TJK endpoint -> raw snapshot -> parser -> normalized SQLite -> Padok API -> frontend
```

Padok API bu noktada bizim "TJK API" katmanimiz olur. Frontend asla dogrudan TJK HTML'i okumaz.

Avantajlari:

- TJK HTML degisirse sadece parser etkilenir.
- UI ve analiz kodu stabil kalir.
- Ham veri saklandigi icin parser hatalari sonradan tekrar islenebilir.
- Cache ve hiz kontrolu bize gecer.
- TJK'yi gereksiz siklikta yormayiz.

## 3. Veri Alma Katmanlari

### Layer 1: Race Index

Kosu sorgulama endpointlerinden gelir. Amac hangi tarihte, hangi sehirde, hangi kosunun kosuldugunu bulmaktir.

Alabilecegimiz alanlar:

- Tarih
- Sehir
- Kosu sirasi
- Grup
- Kosu cinsi
- Mesafe
- Pist
- Kazanan
- Kazanan derece
- Handikap puani
- Gunluk sonuc sayfasina link

Bu katman Gazi benzeri kosulari tespit etmek icin yeterli olabilir.

### Layer 2: Race Detail

Gunluk yaris sonuclari, program PDF/CSV veya detay sayfalarindan gelir. Amac kosudaki tum atlari ve performanslarini almaktir.

Ihtiyac duydugumuz alanlar:

- At
- Jokey
- Antrenor
- Kilo
- Start no
- Sira
- Derece
- Fark
- Ganyan/oran
- Son 800/600 varsa
- Kosmaz bilgisi

Bu katman olmadan ciddi analiz yapamayiz. Sadece kazanan uzerinden analiz eksik kalir.

### Layer 3: Entity Profiles

At, jokey ve antrenor gecmisini birlestiren katmandir.

Ornek sorular:

- Bu at son 5 startta nasil kosmus?
- Bu jokey bu atla daha once ne yapmis?
- Jokeyin 2000m+ cim performansi nasil?
- Antrenorun Gazi yolundaki basari gecmisi var mi?

## 4. Hiz Icin Ne Yapacagiz?

Hiz icin canli TJK sorgusunu UI'in kritik yoluna koymayacagiz.

Dogru model:

1. Ingestion belirli araliklarla veya manuel tetiklenir.
2. Veriler raw olarak saklanir.
3. Parser normalized tablolari gunceller.
4. UI sadece bizim local/API verimizi okur.

Bu sayede kullanici ekrani hizli olur. TJK yavas cevap verse bile sadece ingestion etkilenir.

## 5. Parse Etmek Sagliksiz mi?

Parse etmek tek basina kotu degil. Kotusu, parse edilmis HTML'i uygulamanin her yerine yaymaktir.

Saglikli yaklasim:

- Parser tek yerde olur.
- Gelen ham veri saklanir.
- Parser testleri yazilir.
- Normalize edilen alanlar typed/structured olur.
- UI hicbir zaman `td:nth-child(4)` gibi seyleri bilmez.

Bu mimariyle HTML parse edebiliriz ve yine de sistem temiz kalir.

## 6. Alternatif Kaynaklar

### PDF/CSV

TJK gunluk program ve sonuc dokumanlari bazi alanlar icin daha zengin olabilir. Dezavantaji parse etmenin daha zahmetli olmasi.

### Yenibeygir

Kullanici dostu gecmis kosu sayfalari olabilir. Resmi kaynak degil; resmi olmayan alanlar TJK ile capraz kontrol edilmeli.

### Browser Automation

Son care olmali. Endpointler dogrudan cagirilabiliyorsa browser automation daha yavas ve daha kirilgan kalir.

## 7. Ilk Uygulama Karari

Bir sonraki teknik adim:

1. `scripts/fetch-tjk-race-index.mjs` yaz.
2. `DataRows/KosuSorgulama` endpointini filtrelerle cagir.
3. Gelen HTML fragmentini raw dosya olarak sakla.
4. Mevcut parser ile JSON'a cevir.
5. Sonraki adimda JSON'u SQLite `races` tablosuna yaz.

Bu bize hem hizli hem ogretici bir yol verir: once TJK'nin veri yapisini gozlemle, sonra normalize et, sonra API'ye bagla.

## 8. Current Fetch Command

Race index snapshots can now be fetched with:

```bash
npm run fetch:tjk-race-index -- --start 01.06.2025 --end 30.06.2025 --page 1
```

Useful filters:

- `--city-id <id>`
- `--breed-id <id>`
- `--surface-id <id>`
- `--distance <meters>`
- `--race-type-id <id>`
- `--group-id <id>`
- `--param QueryParameter_Name=value`

The script writes ignored runtime artifacts under:

- `data/raw/tjk/kosu-sorgulama`
- `data/processed/tjk/kosu-sorgulama`
