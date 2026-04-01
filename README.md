# 🏛️ Harran Üniversitesi – Kampüs Sanal Turu

> Three.js ile geliştirilmiş, tarayıcı tabanlı 3D kampüs keşif oyunu.

![Three.js](https://img.shields.io/badge/Three.js-r128-black?style=flat-square&logo=three.js)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

##  Oyun Hakkında

Harran Üniversitesi Kampüs Sanal Turu, üniversitenin web sitesi için geliştirilmiş interaktif bir 3D deneyimdir. Oyuncular kampüs içinde serbestçe dolaşabilir ve tüm fakülte binalarını keşfedebilir. Harici kütüphane bağımlılığı olmadan yalnızca **vanilla JavaScript + Three.js** ile yazılmıştır.

---

##  Özellikler

###  Karakter & Kontroller
- **W / S** tuşlarıyla ileri-geri yürüme
- **Fare** ile 360° kamera ve yön kontrolü (Pointer Lock API)
- Üçüncü şahıs kamera, karakteri yukarıdan takip eder
- Kollar ve bacaklar için gerçekçi yürüyüş animasyonu

###  Kampüs Ortamı
- Prosedürel olarak oluşturulmuş **11 bina**:
  - Rektörlük, Kütüphane, Mühendislik Fakültesi
  - Fen-Edebiyat Fakültesi, İktisadi Bilimler Fakültesi
  - Yemekhane, Yurt A & B, Besyo
  - Harran Tıp, Güvenlik
- Her binada pencereler, kapı ve renkli çatı detayları
- Ağaçlar, lamba direkleri, yollar ve merkezi plaza
- Dinamik gölgeler ve sis efekti ile derinlik hissi

###  Hoş Geldiniz Kapısı
- Kampüs girişinde "Harran Üniversitesi'ne Hoş Geldiniz!" yazılı dekoratif kemer

###  NPC Öğrenciler
- **18 adet** renkli öğrenci karakteri kampüste dolaşır
- Her NPC kendi hedefine yürür, zaman zaman durur ve konuşur
- Oyuncu yaklaşınca NPC konuşma balonları gösterir:
  - *"Merhaba!"*, *"Bugün dersin var mı?"*, *"Sınavlar yaklaşıyor..."* vb.
- Balonlar 3D dünya konumuna projeksiyon ile kilitlenir

###  Ses Sistemi
- Harici ambiyans ses dosyası desteği (`Sound_Effects_Outdoor.mp3`)
- Prosedürel **rüzgar sesi** (Web Audio API, band-pass filtreli gürültü + LFO)
- Periyodik **kuş cıvıltısı** efektleri


###  Bina Rehberi Paneli
- Sağ üst köşede tüm binaları listeleyen panel
- Paneldeki bina ismine tıklayınca minimapte ilgili bina **altın rengiyle yanıp söner**
- ESC ile fare serbest bırakıldığında panel tıklanabilir kalır

###  Minimap
- Sağ alt köşede gerçek zamanlı kampüs haritası
- Kırmızı nokta + yön oku ile oyuncu konumu
- Teal noktalar ile NPC konumları
- Seçilen bina animasyonlu altın rengi vurgulaması
- Kuzey (N) göstergesi

###  Çarpışma Sistemi
- Tüm binalar için AABB tabanlı çarpışma algılama
- Duvara dik açıda çarparken **yanal kayma** (wall sliding) desteği
- Oyuncu kampüs sınırları dışına çıkamaz

###  Görsel & Arayüz
- Açılış ekranı ile kontrol bilgileri
- Bir binaya yaklaşınca binanın önünde **altın rengi yakınlık etiketi** belirir
- Crosshair (nişan izi) HUD
- Kamera açısını ayarlayarak farklı perspektiflerden kampüsü izleme

---

##  Kurulum & Çalıştırma

### Gereksinimler
- Node.js (v16+) — yerel geliştirme sunucusu için

### Adımlar

```bash
# Depoyu klonla
git clone https://github.com/kullanici-adin/harran-kampus-turu.git
cd harran-kampus-turu

# Bağımlılıkları yükle (varsa)
npm install

# Geliştirme sunucusunu başlat
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç.

### Ses Dosyası
Ambiyans müziği için `Sound_Effects_Outdoor.mp3` dosyasını projenin `src/` klasörüne yerleştir. Dosya bulunamazsa oyun prosedürel ses efektleriyle çalışmaya devam eder.

---

##  Kontroller

| Tuş / Hareket | Eylem |
|---|---|
| `W` / `↑` | İleri yürü |
| `S` / `↓` | Geri yürü |
| `Fare` | Kamera & karakter yönü |
| `ESC` | Fare kilidini aç / bina panelini kullan |
| Bina paneline tıkla | Minimapte binayı vurgula |

---

##  Teknolojiler

| Teknoloji | Kullanım |
|---|---|
| [Three.js r128](https://threejs.org/) | 3D render motoru |
| Web Audio API | Prosedürel ses efektleri |
| Pointer Lock API | Fare ile FPS tarzı kamera kontrolü |
| Canvas 2D API | Minimap çizimi & bina etiketleri |
| HTML5 / CSS3 | Arayüz & animasyonlar |
| Vanilla JavaScript (ES6+) | Oyun mantığı |

---



## 🗺️ Kampüs Haritası

```
         [Yurt A]        [Ana Bina]       [Yurt B]
         [Spor S.]  [Kütüphane] [Müh.Fak.] [Sağlık]
                   [Fen-Ed.]  [Güvenlik] [İktisadi]
                          [Yemekhane]
                         
                    ↑ Giriş Kapısı ↑
                   [Hoş Geldiniz 🎓]
```

---

##  Katkı

Pull request ve öneriler memnuniyetle karşılanır. Büyük değişiklikler için önce bir issue açmanız önerilir.

---

##  Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.

---

<p align="center">
  Harran Üniversitesi için ❤️ ile yapıldı
</p>
