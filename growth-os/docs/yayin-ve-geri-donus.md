# Satış mesajı 2.0 — yayın ve geri dönüş planı

## Bu yayın neyi değiştirir, neyi değiştirmez

- **Veritabanı şeması değişmez.** Migration yok. Yeni sütun ya da tablo eklenmez.
- **Hiçbir kayıt silinmez.** Müşteriler, şablonlar ve bekleyen kuyruk olduğu gibi kalır.
- **Yeni yazılan veriler:**
  - Müşteriler ekranında "WhatsApp’ta aç" denince `OutreachJob` tablosuna `status = "opened"` ve `channel = "wa-link"` satırı eklenir.
  - Aynı anda müşterinin notuna tek satırlık bir kayıt eklenir.
  - Eski sürüm bu satırları yok sayar.
- **Varsayılan yazılım şablonları güncellenir.** "Yazılım — web / otomasyon / bakım / satış / takip" şablonları, gövdesi hiç düzenlenmemişse yeni metne geçer. Düzenlenmiş şablonlara dokunulmaz. Eski metinler `src/lib/copy-ai.ts` içindeki `LEGACY_SOFTWARE_TEMPLATE_BODIES` listesinde durur.

## Otomatik gönderim kilidi

- **Kilit:** Kuyruktan otomatik WhatsApp gönderimi, yalnızca Vercel ortamında `WA_SENDING_ENABLED=1` tanımlıysa çalışır. Bu değişken tanımlı değilken taslak üretmek ve onaylamak mümkündür, ama hiçbir mesaj gönderilmez. Her gece 00:00'da çalışan zamanlanmış görev de buna dahildir.
- **Kilidi açarsanız bile:**
  - Yalnızca **onaylanmış** taslaklar gönderilir.
  - Yalnızca **iletişim onayı kaydı olan** müşterilere gönderilir.
  - WhatsApp Cloud API ile, müşteri son 24 saatte yazmadıysa serbest metin gönderilmez (Meta kuralı).

## Yayından önce yedek (önerilir)

Canlı veritabanı şifresi Vercel'de "gizli" olarak saklandığı için yedeği yerelden alamadım. Yedek betiği yalnızca okuma yapar:

```bash
DATABASE_URL="<Supabase → Project Settings → Database → Connection string (URI)>" npx tsx scripts/db-yedek.mts
```

Çıktı `yedekler/` klasörüne yazılır (git'e girmez). Dosyada şifre özetleri ve API anahtarları bulunduğu için güvenli bir yerde saklayın.

## Geri dönüş

1. **Kod:** Vercel → Deployments → önceki sürüm (`4fc7dc2`) → **Instant Rollback**. Şema değişmediği için veritabanında ek bir işlem gerekmez.
2. **Şablonlar:** Varsayılan şablonların eski hali istenirse, yedek dosyasındaki `template` kayıtları ya da `LEGACY_SOFTWARE_TEMPLATE_BODIES` listesi kullanılır.
3. **Kilit:** `WA_SENDING_ENABLED` hiç tanımlanmadıysa yapılacak bir şey yoktur.

## Yayın sonrası kontrol

- `https://wexon-growth-os.vercel.app/api/surum` yeni commit kimliğini göstermeli.
- Müşteriler → bir müşteri → "WhatsApp’tan yaz" penceresi açılmalı; 3 taslak, kalite puanı ve iletişim kuralı uyarıları görünmeli.
- **Gerçek Gemini testi:** Ayarlar → Gemini → "Kontrol et" düğmesine basın. Ardından pencerede "AI ile 3 alternatif üret" deneyin. Yerelden test için:

  ```bash
  GEMINI_API_KEY=AIza... npx tsx scripts/gemini-smoke.mts
  ```

  Bu betik mesaj göndermez ve veritabanına dokunmaz.
