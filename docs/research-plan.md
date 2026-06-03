# Arastirma ve Urun Plani

## 1. Problem Tanimi

Ilk hedef "Gazi Kosusu'nu kesin tahmin etmek" degil. Daha gercekci hedef:

Gazi Kosusu'na giden yolda aday atlarin benzer kosullardaki performanslarini tek ekranda gormek, sinyalleri normalize etmek ve insanin karar surecini guclendirmek.

Bu ayrim onemli cunku at yarisi deterministik degil. Saglik, tempo, start pozisyonu, jokey karari, pistin o gunku hali ve yaris ici trafik gibi faktorler modele tam girmez. Bu nedenle MVP bir "decision support" urunu olmali.

## 2. Veri Kaynaklari

### TJK

Ana ve resmi kaynak. `KosuSorgulama` tablosu yaris indeksini kurmak icin uygun. Gunluk program/sonuc sayfalari ve PDF/CSV ciktisi at bazli detaylar icin kullanilacak.

### Yenibeygir

Ikincil dogrulama ve kullanici dostu gecmis kosu sayfalari icin degerli olabilir. Resmi kaynak olmadigi icin kritik alanlarda TJK ile capraz kontrol gerekir.

## 3. Ilk Feature Seti

- Mesafe uyumu: Gazi 2400m; 2100-2200m kosular pozitif sinyal.
- Pist uyumu: Cim ve ozellikle Veliefendi cim performansi.
- Yas/irk uyumu: 3 yasli Ingiliz.
- Sinif uyumu: G1/G2/G3 ve acik kosu performansi.
- Form: son 3 starttaki siralama ve derece trendi.
- Jokey/antrenor istikrari: ayni ekip ile tekrar eden basari.
- Zaman: Gazi'ye yakin tarihte form zirvesi.

## 4. MVP Ekranlari

- Genel bakis: Gazi profili, takip edilecek prep kosulari, aday skoru.
- Aday karsilastirma: at bazli sinyaller ve son startlar.
- Kosu haritasi: Gazi'ye yakinlik puaniyla prep kosulari.
- Veri sagligi: hangi alanlar resmi, hangileri manuel, hangileri eksik.
- Gecmis dogrulama: route backtest metrikleri.
- Katilim matrisi: Gazi atlarinin hangi sinyal kosularina katildigi veya katilmadigi.

## 5. Teknik Yol

1. Statik MVP: JSON + vanilla JS.
2. Parser: TJK HTML/PDF/CSV verisini normalize eden script.
3. Depolama: SQLite.
4. API: FastAPI veya Next.js route handler.
5. Modelleme: once backtest ve basit skor; sonra ranking modeli.

## 6. Riskler

- Veri sayfalari format degistirebilir.
- PDF parse kalitesi her zaman stabil olmayabilir.
- Yarisa katilim listesi ve son dakika degisiklikleri tahmini etkiler.
- Az veri nedeniyle ML kolayca overfit olur.

## 7. Dogru Baslangic Metrigi

Ilk ML hedefi "birinciyi bilmek" olmamali. Daha iyi baslangic:

- Ilk 3'e girme olasiligi.
- Adayi ilk 5 sinyal grubuna sokabilme.
- Prep kosusu sinyalinin Gazi sonucuyla korelasyonu.
- Gazi field icindeki her atin hangi route kosularini pas gecmis oldugu.
- Bir atin route disindan gelmesine ragmen Gazi ilk 3 yapabildigi durumlar.

## 8. Veri Ufku

Hedef "bulabildigimiz her yili ayni agirlikla modele koymak" degil. Daha saglikli hedef:

```text
2020-2026 -> yuksek guvenli modern pencere
2015-2019 -> ikinci genisletme penceresi
1927-2014 -> arsiv ve dusuk guvenli tarihsel baglam
```

Sebep: Eski Gazi verisi degerli olabilir, ama veri formati, yaris programi, pist kosullari, tempo, at popülasyonu ve kampanya pratikleri bugune gore degismis olabilir. Bu nedenle eski yillari toplamak mantikli; fakat model agirligi, feature kapsami ve guven etiketi ayri tutulmali.

## 9. Guncel Arastirma Sirasi

Mevcut route backtest bize kosu seviyesinde sinyal verdi. Siradaki soru at seviyesinde:

```text
Gazi field -> her at -> route kosusu katilimlari -> Gazi sonucu
```

Bu analiz sunu gostermeli:

- Gazi ilk 3 atlari hangi sinyal kosularina katildi?
- Hangi Gazi ilk 3 atlari takip ettigimiz sinyal kosularindan gecmedi?
- Mehmet Akif veya Sait Akson gibi kosulara katilmayan ama Gazi'de basarili olan atlar var mi?
- Katilmama bilgisi kampanya stratejisi mi, veri eksigi mi, yoksa alternatif form hattinin sinyali mi?
