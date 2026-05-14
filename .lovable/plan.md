فهمت طلبك: نريد إبقاء روابط CSS تشير إلى `dz.1xbet.com` كما هي ولا نستبدلها بنسخ محلية. المشكلة الحقيقية ليست في أسماء الروابط بل في أن متصفح المستخدم يرفض ملفات CSS من `dz.1xbet.com` لأن السيرفر لا يرسل ترويسة `Access-Control-Allow-Origin`، فيظهر خطأ CORS وتُحمّل الصفحة بدون تصميم.

لإبقاء الروابط الأصلية تعمل، نحتاج طبقة وسيطة بنفس الأصل (same-origin) تعيد توجيه الطلبات إلى `dz.1xbet.com` وتضيف ترويسة CORS. خياران:

## الخطة

### 1) إضافة Proxy في Vite (للمعاينة)
- في `vite.config.ts` نضيف `server.proxy` يحوّل `/proxy-1xbet/*` إلى `https://dz.1xbet.com/*` مع إعادة كتابة المسار وإزالة قيود CORS.

### 2) Service Worker لاعتراض طلبات `dz.1xbet.com`
- نضيف `public/crash-sw.js` يُسجَّل من داخل `crash-game.html`.
- الـ Service Worker يلتقط أي `fetch` لـ `https://dz.1xbet.com/...` ويعيد توجيهه داخلياً إلى مسار proxy على نفس الأصل.
- النتيجة: روابط `<link href="https://dz.1xbet.com/...">` تبقى كما هي حرفياً في الـ HTML، والمتصفح يحمّلها فعلياً عبر نفس الأصل ويتجاوز حظر CORS.

### 3) إزالة سطر واحد فاسد فقط (غير الروابط الخارجية)
- يوجد في `<head>` رابط:
  `<link href="cid:css-…@mhtml.blink" rel="stylesheet">`
  هذا ليس من روابط `dz.1xbet.com`، بل بقايا حفظ MHTML، وهو يعطي `ERR_UNKNOWN_URL_SCHEME` دائماً. سنحذفه فقط.

### 4) الإنتاج (Published)
- Service Worker يعمل أيضاً في الإنتاج، إذن لا حاجة لتعديل الروابط لاحقاً. فقط نتأكد من تسجيله مب