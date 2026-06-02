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
