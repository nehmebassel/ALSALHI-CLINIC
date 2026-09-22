# Physician Journey Timeline Contract — v1.3.3

## 1. المجال

يخص هذا العقد `Physician Hair Journey` بعد أول Physician baseline معتمد. لا يدمج `Approved Hair History` ولا يحوّل أحداث الزيارة إلى قياسات.

## 2. منطقتا العرض

### A. Measures Chart

- المحور Y من 0 إلى 5 للمقاييس: Shedding Severity، Density Loss، Itch، Burning، Scalp Pain فقط.
- تظهر النقطة عند وجود قيمة رقمية + تاريخ/وقت + مصدر قياس.
- الخط يصل قيمتين معروفتين للمقياس نفسه فقط، ولا يمتد قبل أول قيمة.
- `0` قيمة مقاسة صحيحة.
- `UNKNOWN` و`NO DATA` والقيمة الفارغة لا تظهر كنقطة صفر.
- Visit marker لا يدخل الرسم الرقمي ما لم توجد قيمة قياس مستقلة مرتبطة بالزيارة.

### B. Event Timeline Lanes

المسارات الثمانية، وبالترتيب:

1. Visits.
2. Treatments.
3. Treatment Plan.
4. Procedures.
5. Trichoscopy.
6. Tests / Labs.
7. Photos.
8. Diagnoses / Clinical Events عند وجود تاريخ حاكم.

لكل مسار معنى رأسي مستقل؛ لا يحمل أي حدث قيمة 0–5.

## 3. محور الوقت المشترك

- تستخدم المنطقتان دالة X واحدة مبنية على التاريخ الحقيقي ضمن النطاق المعروض.
- أحداث اليوم نفسه تشترك في X وتختلف في Y حسب المسار.
- لا يُنقص أو يُزاد يوم لتفادي التداخل.
- تغيير 3/6/12 شهر أو All أو Custom يغير نافذة العرض فقط ولا يغير البيانات.
- التباعد داخل النطاق يعكس الفرق الزمني الحقيقي.

## 4. أشكال الأحداث

| النوع | التمثيل | قاعدة التاريخ |
|---|---|---|
| Visit | Diamond marker | timestamp الزيارة |
| Treatment | Interval bar | start معروف؛ modification/stop عند توفرهما |
| Treatment Plan | Milestone | تاريخ العنصر/المراجعة المعروف |
| Procedure | Dated marker | تاريخ الإجراء الحاكم |
| Trichoscopy | Triangle marker | وقت حفظ نتيجة الزيارة |
| Test/Lab | Square marker | التاريخ الحاكم للمصدر |
| Photo | Circle marker | capture timestamp |
| Diagnosis/Clinical Event | Annotation marker | يظهر فقط إذا كان مؤرخًا بالمصدر |

العنصر غير المؤرخ يبقى داخل Visit Detail ولا يحصل على موضع زمني مصطنع.

## 5. تفاصيل الحدث

- `Trichoscopy Event A`: النتائج المحفوظة، الملاحظات، Visit ID، الطبيب، وقت الحفظ، الوسائط، الإصدار والحالة.
- Treatment: Start/Modification/Stop، Status، Source visit، Physician، Notes.
- Treatment Plan: Start، Review date، Follow-up goal، Modification date، Status، Created by visit.
- Visit: Exam، Map، Trichoscopy، Diagnosis structures، Measures، Treatment/Plan، Procedures، Tests/Photos.

فتح اللوحة لا يغير موضع المسار ولا ينشئ تشخيصًا أو تفسيرًا أو علاجًا.

## 6. بيانات العرض

الأسماء `Treatment Item A` و`Plan Milestone A` و`Trichoscopy Event A` و`Photo Event A` بيانات UX اصطناعية محايدة. يظهر الوسم `SYNTHETIC UX DATA — NOT A CLINICAL RECOMMENDATION` على الحالات ذات الصلة.

