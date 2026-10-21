# Wexon Growth OS

Wexon Growth OS, Wexon.dev ve bağlı işletmeler için müşteri adayı keşfi, satış mesajı hazırlama, insan onaylı WhatsApp kuyruğu ve CRM takibi sağlayan Next.js yönetim panelidir.

## Temel özellikler

- Sade kullanım: **Müşteri Bul → Müşteriler → WhatsApp'tan yaz**. Masaüstü programı: `masaustu/`

- Google Places ile şehir, ilçe, sektör ve web sitesi durumuna göre işletme keşfi
- Tenant bazlı müşteri, kampanya, şablon ve ayar izolasyonu
- Yapay zeka destekli kişiselleştirilmiş mesaj taslakları
- Mesaj gönderilmeden önce operatör onayı
- WhatsApp Cloud API veya yerel WhatsApp Web bağlantısı
- Instagram webhook ve konuşma takibi
- Platform yöneticisi ve işletme kullanıcısı rolleri
- Vercel cron ile kontrollü kuyruk işleme

## Güvenli kullanım ilkesi

Bu proje toplu ve izinsiz soğuk mesaj aracı olarak kullanılmamalıdır. Sistem adayları bulur ve mesaj taslağı hazırlar; her mesaj operatör tarafından kontrol edilip onaylanmalıdır. Günlük limitler düşük tutulmalı, ilgilenmeyen işletmelere tekrar yazılmamalı ve WhatsApp platform kurallarına uyulmalıdır.

## Teknoloji

- Next.js 16 App Router
- React 19 ve TypeScript
- Prisma 6
- PostgreSQL ve Supabase
- Google Places API
- Gemini uyumlu LLM API
- WhatsApp Cloud API veya Baileys

## Yerel kurulum

Gereksinimler: Node.js 20 veya üzeri ve erişilebilir bir PostgreSQL veritabanı.

```bash
npm ci
copy .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

Uygulama varsayılan olarak `http://127.0.0.1:3000` adresinde açılır.

## Ortam değişkenleri

Zorunlu üretim değişkenleri:

- `DATABASE_URL` PostgreSQL transaction pooler bağlantısı
- `DIRECT_URL` migration için doğrudan PostgreSQL bağlantısı
- `AUTH_SECRET` en az 32 rastgele byte değer
- `ADMIN_EMAIL` ilk platform yöneticisinin e-postası
- `ADMIN_PASSWORD` ilk platform yöneticisinin güçlü parolası
- `CRON_SECRET` Vercel cron endpoint doğrulama anahtarı

İsteğe bağlı entegrasyonlar:

- `GOOGLE_PLACES_API_KEY`
- `WHATSAPP_CLOUD_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `IG_ACCESS_TOKEN`
- `IG_USER_ID`
- `IG_WEBHOOK_VERIFY_TOKEN`

Gerçek anahtarları repoya commit etmeyin. Google anahtarını yalnızca gereken API'lerle sınırlandırın ve erişim anahtarlarını düzenli yenileyin.

## Doğrulama

```bash
npm run lint
npm run typecheck
npm run verify:logic
npm run build
```

Tüm temel kontrolleri sırayla çalıştırmak için:

```bash
npm run check
```

`scripts/verify-tenants.mts` ve `scripts/qa-e2e.mts` çalışan bir uygulama ile test veritabanı gerektirir. Bu betikler gerçek WhatsApp bağlantısı hazırsa mesaj kuyruğunu özellikle tetiklememelidir.

## Deployment

GitHub reposu Vercel projesine bağlıdır. Production dalı `main` olarak ayarlandıysa `main` dalına yapılan push production deployment başlatır; diğer dallar preview deployment oluşturur.

`vercel.json` uygulamayı Frankfurt bölgesinde çalıştırır ve `/api/outreach/tick` cron endpoint'ini günlük tetikler. Vercel ortamında `CRON_SECRET` tanımlı olmalıdır.

Önerilen akış:

1. Ayrı bir dalda değişiklik yapın.
2. `npm run check` çalıştırın.
3. Dalı GitHub'a gönderip preview deployment'ı doğrulayın.
4. Doğrulanan değişikliği `main` dalına birleştirin.

## Güvenlik notları

- Oturum cookie'si HTTP only, SameSite Lax ve production ortamında Secure olarak ayarlanır.
- Cron GET isteği yalnızca doğru Bearer `CRON_SECRET` ile çalışır.
- Panelden manuel kuyruk tetikleme POST ve platform yöneticisi oturumu gerektirir.
- Mesaj kuyruğu işi veritabanında atomik olarak sahiplenir; eşzamanlı worker'ların aynı işi göndermesi engellenir.
- Üretimde dağıtık ve kalıcı bir giriş rate limiter kullanılması önerilir.

## Lisans ve erişim

Bu repo Wexon.dev iş akışları için geliştirilmiştir. Müşteri verilerini, platform oturumlarını ve API anahtarlarını yalnızca yetkili kişilerle paylaşın.
