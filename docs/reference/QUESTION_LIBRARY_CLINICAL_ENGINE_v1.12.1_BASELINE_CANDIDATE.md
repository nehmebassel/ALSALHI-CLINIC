# AlSalhi Clinical Platform — Question Library, Clinical Engine, Clinical Story, and Physician Review — Baseline Candidate

**Document ID:** `QUESTION_LIBRARY_CLINICAL_ENGINE_v1.12.1`  
**Status:** Baseline Candidate for Owner Approval — NOT Approved Baseline — NOT Implementation Handoff  
**Version:** `1.12.1-baseline-candidate`  
**Date:** 2026-08-10  
**Purpose:** إعداد محتوى Question Library / Clinical Engine / Clinical Story / Physician Review كـ`Baseline Candidate` لبوابة اعتماد المالك، مع مزامنة دفعات القرارات المعتمدة حتى 2026-08-10. هذا الملف ليس `Approved Baseline` ولا `Implementation Handoff`، ولا يمنح إذنًا بالتنفيذ قبل الاعتماد الصريح وفق قاعدة المشروع الحاكمة.

---

## 1. Executive Decision

هذا الملف هو **Baseline Candidate for Owner Approval** مبني على Clinical Review Source المجمّع للمرحلة 02. وظيفته الحالية هي تقديم محتوى Sections 2–21 كمرشح موحد للاعتماد، مع إبقاء كل عنصر موسوم صراحة بأنه `Open Decision` خارج أي ترقية للحجية.

المحتوى البنيوي في Sections 2–12 يدخل في هذه النسخة كـ**candidate content for approval** فقط. لا يصبح حاكمًا للتنفيذ إلا إذا شمله اعتماد `Approved Baseline` الصريح، ولا يجوز استخدام وجوده هنا كبديل عن بوابة الاعتماد.

داخل هذا المصدر:

- المكتبات الرئيسية التي تمت مراجعتها في Phase 02 والمذكورة صراحة في Section 21.11 تدخل المرشح بوصفها **candidate locked clinical content**، ولا تصبح implementation-governing حتى اعتماد الملف كـ`Approved Baseline`.
- العناصر التي يصفها الملف نفسه صراحة بأنها `Open Decision` أو خارج الـlock تبقى مفتوحة ولا تُحسم بالاجتهاد.
- لا يُضاف سؤال طبي جديد، ولا يُستنتج قرار طبي أو تنفيذي جديد من هذه النسخة.
- هذه النسخة تنفذ خطوة `Baseline Candidate` فقط؛ الترقية إلى `Approved Baseline` ثم أي `Implementation Handoff` تحتاج بوابات مستقلة وصريحة وفق قاعدة المشروع الحاكمة.

---

## 2. Authority and Boundary

### 2.1 Candidate Inputs and Authority Boundary

المراجع التالية تسجل provenance وسياق هذا المرشح. إدراجها لا يمنح أي ملف غير `Approved Baseline` حجية تنفيذية مستقلة، ولا يجعل هذا المرشح حاكمًا قبل الاعتماد:

| Source | Use |
|---|---|
| `MASTER_CONTEXT_v1.7.2_CORRECTED_BASELINE_CANDIDATE.md` | المرجع السياقي الحالي داخل الحزمة |
| `SOL_BLOCKERS_CLOSURE_MAP_v1.7.2_CORRECTED_CANDIDATE.md` | خريطة الإغلاق الحالية داخل الحزمة |
| `REQUIREMENTS_TRACEABILITY_MATRIX_v1.7.2_CORRECTED_CANDIDATE.md` | التتبع الحالي داخل الحزمة |
| `CLINICAL_REVIEW_CONTENT_v1.8_INCLUDED.md` | مصدر المراجعة السريرية المضمّن في الحزمة؛ يحفظ provenance والمحتوى الذي راجعه المالك في Phase 02 |
| `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md` | النشر المحلي الكامل لنصوص الأسئلة والخيارات والتعريفات والتواريخ التقريبية؛ يخضع لتصحيحات ونطاق هذا الملف |

لا تعتمد هذه الوثيقة للتنفيذ على ملفات `00–14` أو Product Bible أو أي مصدر غير موجود في حزمة v1.7.2. تلك المواد تاريخية/أرشيفية فقط، وقد نُقلت القواعد اللازمة إلى الملفات الحالية.

### 2.2 Architecture Scope Proposed for Baseline Approval

تتضمن هذه النسخة البنود البنيوية التالية كجزء من **المحتوى المرشح للاعتماد**. وجودها هنا لا يعني أنها `Approved Baseline` قبل موافقة المالك الصريحة، ولا يمنح إذنًا بالتنفيذ:

- تعريف الحد الأدنى لكل `QuestionDefinition`.
- قواعد `Response Scope`.
- منع تكرار الأسئلة المشتركة.
- سياسة `Requiredness` عند تعدد مصادر التفعيل.
- سلوك `UNKNOWN`, `PENDING`, و`CONFIGURATION_ERROR`.
- ما يدخل في `Official State` عند `Final Submit`.
- الفرق بين `Clinical Story` و`Full Interview`.
- قواعد مراجعة الطبيب وتعديل القيمة.

### 2.3 Open Decisions Excluded from Candidate Lock

العناصر التالية تبقى خارج الـcandidate lock ولا تتحول إلى قرار حاكم حتى لو تم اعتماد بقية هذا الملف، ما لم يشملها اعتماد صريح لاحق:

- أي exact activation trigger داخل Men’s Health لم يعتمد صراحة، كما هو مذكور في Section 17.1؛ أما Women’s Health فتتفعّل فقط مع Hair Loss للمراجِعات المؤهلات؛
- أي contraindication أو treatment-suitability rule أو pregnancy-related medical trigger إضافي غير منشور داخل الحزمة؛ أما إتاحة `Pregnancy Context` للمراجِعات المؤهلات عبر جميع مسارات Pilot 0 فتدخل في الـcandidate lock؛
- الصياغة النصية التفصيلية داخل كل قسم من `Clinical Story`؛ أما ترتيب الأقسام العام فقد اعتمد في Section 7.3؛
- سياسات `Dual Perspective` لأي حقل جديد غير التصنيف البصري المعتمد مبدئيًا؛
- أي عنصر آخر يوسمه هذا الملف نفسه صراحة بأنه `Open Decision` أو خارج الـlock.

لا يجوز إغلاق أي بند في هذه القائمة بالاجتهاد، ولا يجوز استخدامه كأساس لتنفيذ سلوك نهائي. كما لا يجوز اعتبار مكتبات Phase 02 المغلقة في Sections 13–21 مفتوحة لمجرد وجود Open Decisions منفصلة عنها.

---

## 3. Question Library — Baseline Candidate Content

### 3.1 Definition

`Question Library` هي المرجع المركزي لتعريف الأسئلة. السؤال يكتب مرة واحدة، ثم تستدعيه المسارات السريرية بالمعرف.

المكتبة ليست:

- استبيانًا ثابتًا طويلًا.
- مكان تخزين إجابات المرضى.
- محرك تشخيص.
- نسخة من الورقي أو من مشروع آخر.

### 3.2 Minimum QuestionDefinition Contract

كل سؤال قابل للتنفيذ يجب أن يملك على الأقل:

| Field | Requirement |
|---|---|
| `questionId` | معرف ثابت لا يعاد استخدامه لمعنى آخر |
| `version` | إصدار تعريف السؤال |
| `libraryKey` | المكتبة المالكة مثل `PATIENT_PROFILE`, `HAIR_LOSS`, `SCALP` |
| `label_ar` | نص عربي معتمد للعرض RTL |
| `label_en` | نص إنجليزي معتمد للعرض LTR عند الحاجة |
| `responseType` | نوع الإجابة من الأنواع المعتمدة |
| `optionSet` | مطلوب عند `SINGLE_SELECT` أو `MULTI_SELECT` |
| `visibilityRule` | شروط الظهور |
| `requirednessRule` | شروط الإلزام |
| `validationRule` | تحقق النوع والحدود والخيارات |
| `responseScopePolicy` | هل السؤال global أم scoped |
| `dependencies` | الأسئلة أو المدخلات التي يعتمد عليها |
| `orderingKey` | ترتيب deterministic داخل الإصدار |
| `contentVersionMembership` | الإصدارات التي تنتمي لها |
| `status` | `APPROVED`, `DRAFT`, `RETIRED`, أو `ARCHIVE_ONLY` |

يجب أن يحدد العقد `visibilityRule`, `requirednessRule`, و`orderingKey` صراحة. لا يفترض النظام أن السؤال Required أو Optional، ولا يخترع ترتيبًا أو ظهورًا افتراضيًا. غياب أي منها أو تعذر حسمه هو `CONFIGURATION_ERROR` يمنع نشر إصدار المحتوى أو يمنع `Final Submit` إذا اكتشف في إصدار منشور. أي سؤال لا يملك هذا العقد لا يدخل في مقابلة Pilot 0 التنفيذية.

### 3.3 Response Types Proposed in the Candidate

الأنواع المعتمدة كبنية:

```text
BOOLEAN
SINGLE_SELECT
MULTI_SELECT
TEXT
LONG_TEXT
NUMBER
INTEGER
DATE
MONTH_YEAR
YEAR
SCALE
```

إضافة نوع جديد تحتاج قرارًا تقنيًا/منتجيًا، وإذا كان له أثر طبي تحتاج موافقة سريرية.

### 3.4 Localized Content Rule

يوجد `QuestionDefinition` واحد لكل معنى سريري، وله محتوى محلي:

```text
QuestionDefinition
├── label_ar
├── label_en
├── help_ar?
├── help_en?
└── stable response codes
```

القيم المخزنة تكون أكوادًا ثابتة مثل `YES`, `NO`, `UNSURE`، وليست نصوصًا مترجمة.

### 3.5 Library Groups

الأقسام التنظيمية المعتمدة كبنية:

```text
PATIENT_PROFILE
VISIT_CONTEXT
MEDICAL_HISTORY
MEDICATIONS
ALLERGIES
HAIR_LOSS
SCALP
HAIR_QUALITY
DERMATOLOGY
LASER
AESTHETIC_PROCEDURES
WOMENS_HEALTH
MENS_HEALTH
LIFESTYLE
NUTRITION
MEASUREMENTS_EVENTS
IMAGES_ATTACHMENTS
```

حالة كل مكتبة في هذه النسخة تحددها أقسام Phase 02 اللاحقة وعلامات `Open Decision` الصريحة. وجود اسم المكتبة وحده لا يفتح محتواها ولا يغلقه، ولا يحول أي lock سريري إلى `Approved Baseline`.

---

## 4. Response Scope and Deduplication

### 4.1 Governing Rule

```text
Same QuestionDefinition + Same Response Scope
→ one QuestionInstance + one Response

Same QuestionDefinition + Different Response Scope
→ separate QuestionInstances + separate Responses
```

لا يوجد deduplication بالنص الظاهر. التشابه اللغوي لا يكفي.

### 4.2 Scope Types

| Scope Type | Meaning | Example |
|---|---|---|
| `VISIT` | إجابة واحدة للزيارة | الاسم، تاريخ الميلاد، Health Snapshot |
| `PATHWAY` | إجابة مرتبطة بمسار محدد | سؤال خاص بمسار Hair Loss |
| `MODULE` | إجابة ضمن وحدة مفعلة | Hair Loss Module أو Scalp Module |
| `PROCEDURE_SELECTION` | إجابة لكل إجراء مختار | Botox, Filler |
| `LASER_SERVICE_SELECTION` | إجابة لكل خدمة ليزر مختارة | Laser Hair Removal, Vascular Laser |
| `MEDICATION_ITEM` | إجابة لكل دواء متكرر | اسم/جرعة/تكرار |
| `CONDITION_ITEM` | إجابة لكل مرض مختار | تاريخ التشخيص لكل مرض |
| `EVENT_ITEM` | إجابة لكل حدث زمني | جراحة، حمى، ولادة |
| `BODY_AREA` | إجابة لكل منطقة جسم/فروة | منطقة حكة أو تساقط |
| `VISUAL_CLASSIFICATION` | اختيار بصري له سياسة خاصة | تصنيف مرئي يحتفظ بقيمة المريض والطبيب عند الاعتماد |

### 4.3 Activation Sources

كل `QuestionInstance` يحتفظ بمصادر التفعيل:

```text
VISIT_REASON
ROUTING_RULE
PROCEDURE_SELECTION
LASER_SERVICE_SELECTION
SYSTEM_REQUIRED
PHYSICIAN_REVIEW_REQUIREMENT
```

إذا استدعى أكثر من مصدر السؤال نفسه بنفس الـScope، تعرض نسخة واحدة فقط مع حفظ كل مصادر التفعيل.

---

## 5. Clinical Engine — Baseline Candidate Content

### 5.1 Engine Responsibilities

المحرك مسؤول عن:

- تحديد المسارات والمكتبات النشطة.
- تقييم visibility.
- تقييم requiredness.
- ترتيب الأسئلة.
- التحقق من الإجابات.
- حفظ حالة draft.
- إعادة التقييم عند تغير إجابة.
- بناء official active question set عند Final Submit.

### 5.2 Engine Prohibitions

المحرك لا يقوم بـ:

- تشخيص.
- اقتراح علاج.
- استنتاج قاعدة طبية غير معتمدة.
- إضافة `VisitReason` بناءً على إجابة.
- قبول ادعاء العميل أن سؤالًا معينًا نشط دون إعادة تقييم server-side.
- استخدام أحدث `ContentVersion` عند الإرسال إذا كانت الـDraft مثبتة على إصدار سابق.

### 5.3 Rule Domains

يجب فصل القواعد إلى:

```text
Visibility
Requiredness
Validation
Ordering
Completion
Activation
Output Eligibility
```

لا تستخدم قاعدة واحدة غامضة لكل هذه الوظائف.

### 5.4 Rule Result States

نتيجة تقييم القاعدة:

```text
TRUE
FALSE
UNKNOWN
PENDING
CONFIGURATION_ERROR
```

`UNKNOWN` و`PENDING` يمكن أن يوجدا مؤقتًا أثناء Draft.

عند `Final Submit`:

```text
UNKNOWN / PENDING affects official state
→ block Final Submit

CONFIGURATION_ERROR
→ block Final Submit + log error + rollback
```

لا يجوز تحويل `UNKNOWN` إلى `FALSE` بصمت.

### 5.4.1 Visibility and Ordering Conflict Policy

- شروط الاستبعاد الصريحة تتغلب على شروط التفعيل.
- إذا بقي تعارض Visibility غير قابل للحسم، تكون النتيجة `CONFIGURATION_ERROR`؛ ولا يجوز إخفاء السؤال بصمت.
- لكل سؤال `orderingKey` ثابت داخل قسمه.
- السؤال المشترك المحتفظ بنفس `QuestionDefinition` و`Response Scope` يحتفظ بموضعه الأصلي ولا يكرر في مواضع متعددة.
- أي تعارض Ordering يجب أن يكتشف قبل نشر `ContentVersion`; وإذا وصل إلى إصدار منشور يعامل `CONFIGURATION_ERROR`.

### 5.5 Requiredness

قاعدة حاكمة:

```text
Inactive question
→ not required
→ no official Response

Active + Required
→ valid Response required
```

إذا كان السؤال مشتركًا بين أكثر من مصدر:

```text
Any active valid source marks it Required
→ final QuestionInstance is Required
```

غياب `requirednessRule` الصريحة ليس Optional؛ بل `CONFIGURATION_ERROR`.

### 5.6 Hidden Draft Values

يمكن الاحتفاظ بقيمة مخفية مؤقتًا داخل نفس Draft لتحسين تجربة المستخدم.

لكن طالما السؤال inactive:

```text
no clinical effect
not required
not eligible for official Response
not eligible for Clinical Story
```

عند Final Submit تدخل فقط الحالة النشطة النهائية.

### 5.7 Content Version Pinning

كل Draft تثبت على `ContentVersion` واحد من وقت الإنشاء حتى الإرسال.

```text
Draft.contentVersionId
→ governs questions, options, rules, catalogues, selections, validation
```

نشر إصدار جديد لا يغير Draft مفتوحة.

---

## 6. Final Submit — Baseline Candidate Content

> **Boundary:** هذا القسم جزء من محتوى الـBaseline Candidate المقترح للاعتماد، لكنه لا يحول المرشح إلى `Implementation Handoff` ولا يصرح بالتنفيذ قبل اعتماد `Approved Baseline` صريح.

قبل أي commit رسمي، يعيد السيرفر حساب:

- Session and Draft state.
- pinned `ContentVersion`.
- approved VisitReason combination.
- active pathways.
- active libraries.
- active QuestionInstances with scopes.
- required responses.
- validation.
- absence of blocking `UNKNOWN`, `PENDING`, and `CONFIGURATION_ERROR`.

داخل transaction واحدة فقط ينشأ official state:

```text
Patient / MRN linkage as needed
Visit
VisitReason[]
Laser/Aesthetic selections
ClinicalInterview
ActivePathway[]
ActiveLibrary[]
QuestionInstance[]
Response[]
RoutingEvaluation[]
OutputEligibilityEvaluation[]
Audit events
Draft = SUBMITTED
PatientSession = CLOSED / SUBMITTED
```

أي فشل يعني rollback كامل.

Identity and submission concurrency follow the package-local Master Context contract: Clinic MRN is normalized and uniquely constrained within clinic scope; permanent identity resolution/creation occurs inside the official-state transaction; `Draft.id` is the idempotency scope; and concurrent or repeated submission must not create duplicate Patient, MRN linkage, Visit, or ClinicalInterview records.

---

## 7. Clinical Story — Baseline Candidate Content

### 7.1 Definition

`Clinical Story` عرض سريري منظم ومشتق من official state.

هي:

- deterministic.
- rebuildable.
- traceable to source fields.
- not AI-generated.
- not an independent source of truth.

### 7.2 Sources

مصادر القصة:

```text
VisitReason
ActivePathway
QuestionInstance
Response
Physician correction
Measurement
Event
Photo metadata
Hair History / Hair Journey data when eligible
```

لا تستخدم Draft inactive values ولا قيم غير مرسلة رسميًا.

### 7.3 Minimum Sections

الترتيب العام الحاكم للقصة السريرية هو:

| Section | Purpose |
|---|---|
| `Visit Context` | سبب الزيارة الأساسي والطلبات الإضافية |
| `Needs Physician Attention` | ما يحتاج انتباه الطبيب أولًا |
| `Current Concern` | الشكوى الحالية والمعلومات المؤهلة |
| `Timeline / Onset` | البداية، المسار الزمني، الأحداث ذات التاريخ |
| `Symptoms / Measures` | الأعراض النشطة ومقاييسها |
| `Prior Diagnoses / Tests` | التشخيصات السابقة والخزعات والفحوصات عند وجود تاريخ صالح |
| `Treatments / Procedures` | الأدوية والإجراءات السابقة والحالية |
| `General Health` | Health Snapshot والفروع المختارة |
| `Sex-Specific Context` | Women's/Men's Health عند التفعيل |
| `Images / Attachments` | الصور والملفات المرتبطة |

هذا الترتيب مقفل. تبقى الصياغة النصية الدقيقة داخل كل قسم والتسميات الخاصة بكل خدمة قابلة للتفصيل في عقد التنفيذ دون تغيير هذا الترتيب أو اختراع معلومة سريرية.

### 7.4 Source Traceability

كل عنصر في القصة يجب أن يستطيع الرجوع إلى:

```text
source QuestionInstance / Response / Event / Measurement
source actor
source timestamp
contentVersionId
current official value source
```

### 7.5 Output Eligibility

أي قسم أو جملة تظهر للطبيب تحتاج `Output Eligibility` واضحة.

مثال:

```text
Undated prior diagnosis
→ appears in Clinical Story
→ does not appear as invented timeline point
```

---

## 8. Full Interview — Baseline Candidate Content

`Full Interview` هو عرض كامل للإجابات الرسمية النشطة ومصادرها.

الطبيب لا يبدأ منه، لكنه متاح للرجوع.

يجب أن يعرض:

- السؤال كما ظهر في إصدار المحتوى.
- إجابة المريض الأصلية عند الإرسال.
- القيمة الرسمية الحالية.
- مصدر القيمة الحالية.
- تعديلات الطبيب.
- الأسئلة التي كانت نشطة عند الإرسال.

لا يعرض كإجابات رسمية:

- أسئلة inactive عند Final Submit.
- إجابات branch مخفية لم تدخل official state.
- قيم draft غير مرسلة.

---

## 9. Physician Review — Baseline Candidate Content

### 9.1 Review State

بعد Final Submit:

```text
ClinicalInterview = UNDER_REVIEW
```

بعد إجراء الطبيب:

```text
Complete Review
→ ClinicalInterview = COMPLETED
```

`COMPLETED` يعني اكتمال مراجعة هذه المقابلة، وليس انتهاء علاج المريض.

### 9.2 Physician Visibility

يفتح الطبيب الحالة ويرى فورًا:

- Clinical Story.
- structured summary.
- review flags.
- source answers.
- Hair History/Journey outputs when applicable.
- images and attachments when applicable.

المراجعة ليست approve-item-by-item workflow.

### 9.3 Physician Correction

للسؤال العادي:

```text
Physician edits official value
→ current official value = physician value
→ source = PHYSICIAN
→ modifiedBy + modifiedAt
→ prior patient value preserved in Audit
```

لا تعرض المنصة `patient_value`, `doctor_value`, `effective_value` لكل سؤال عادي.

### 9.4 Dual Perspective

تستخدم فقط عند وجود `Field Policy` معتمد يقول إن منظور المريض ومنظور الطبيب يجب أن يبقيا منفصلين.

مثال مفهومي:

```text
patientValue
physicianValue
effectiveValue
```

لا تطبق على كل الأسئلة تلقائيًا.

في Pilot 0 تطبق مبدئيًا على التصنيفات البصرية التي يقيمها المراجع والطبيب، مثل `BASP`: تحفظ قيمة المراجع وقيمة الطبيب، وتصبح قيمة الطبيب هي المعتمدة سريريًا بعد إدخالها. قبل إدخال الطبيب، يبقى اختيار المراجع ظاهرًا بوصفه اختيارًا غير مؤكد. أي توسيع إلى حقل آخر يحتاج `Field Policy` معتمدًا.

### 9.5 Review Flags

`Review Flags` هي مؤشرات انتباه.

قد تكون:

```text
INFO
NEEDS_CONFIRMATION
BLOCKING_BEFORE_COMPLETE
```

وجود flag لا يمنع الطبيب من مراجعة بقية الحالة. يمنع `Complete Review` فقط عند وجود واحد أو أكثر من الآتي:

- `BLOCKING_BEFORE_COMPLETE` غير معالج؛
- تأكيد طبي إلزامي غير مكتمل؛
- خطأ بيانات أو `CONFIGURATION_ERROR`؛
- تعديلات طبيب غير محفوظة.

أما `INFO` و`NEEDS_CONFIRMATION` فلا يمنعان الإكمال تلقائيًا.

### 9.6 Staff Boundary

`STAFF` قد يرى الحالة read-only ويستطيع نسخ المعلومات حسب القرار المعتمد.

`STAFF` لا يستطيع:

- تعديل إجابة.
- تعديل قياس.
- تعديل الرسم.
- اعتماد Hair History.
- إكمال Review.
- إدخال تقييم طبي.

---

## 10. Baseline Candidate Acceptance Criteria — For Approval

> **Boundary:** المعايير التالية مدرجة ضمن الـBaseline Candidate لأغراض الاعتماد والتتبع. وجودها هنا لا يجعل المرشح `Approved Baseline` قبل الموافقة الصريحة.

في سياق المسودة المعمارية السابقة، كانت معايير الإغلاق المدرجة كالتالي:

| ID | Acceptance Criterion |
|---|---|
| `B2-AC-001` | كل سؤال تنفيذي يملك `QuestionDefinition` بالعقد الأدنى في هذا الملف |
| `B2-AC-002` | السؤال المشترك يدمج فقط عند نفس `QuestionDefinition + Response Scope` |
| `B2-AC-003` | السؤال نفسه scoped لكل procedure/service/item عند الحاجة |
| `B2-AC-004` | requiredness لا تنطبق على inactive questions |
| `B2-AC-005` | أي active required source يجعل shared instance required |
| `B2-AC-006` | Final Submit يمنع `UNKNOWN`, `PENDING`, و`CONFIGURATION_ERROR` المؤثرة |
| `B2-AC-007` | Final Submit لا يحول hidden draft values إلى official Responses |
| `B2-AC-008` | Clinical Story مشتقة وقابلة لإعادة البناء وليست source of truth |
| `B2-AC-009` | Full Interview يعرض official active questions فقط |
| `B2-AC-010` | Physician correction تغير current official value وتحفظ السابق في Audit |
| `B2-AC-011` | Dual Perspective لا يستخدم إلا بسياسة حقل معتمدة |
| `B2-AC-012` | Staff read-only boundary enforced server-side |

---

## 11. Implementation Test Targets — Post-Approval Reference Only

> **Boundary:** هذه القائمة مرجع اختبار post-approval وليست أمر تنفيذ من هذا الـBaseline Candidate. أي تنفيذ لاحق يجب أن يعتمد على `Approved Baseline` ثم handoff معتمد وفق قاعدة المشروع الحاكمة.

قائمة أهداف الاختبار الموروثة من المسودة السابقة:

- visibility evaluation.
- requiredness evaluation.
- validation by response type.
- scope-aware deduplication.
- per-procedure mini pathway scope.
- hidden inactive value exclusion at submit.
- blocking `UNKNOWN` and `PENDING`.
- blocking `CONFIGURATION_ERROR`.
- content version pinning.
- server-side recomputation at Final Submit.
- Clinical Story rebuild after physician edit.
- ordinary physician correction and Audit.
- Dual Perspective field policy.
- STAFF read-only enforcement.

---

## 12. Baseline Candidate Closure Boundary

المحتوى في Sections 2–11 مدرج هنا كجزء من **Baseline Candidate** المقترح للاعتماد، وليس كمرجع تنفيذي قائم بذاته.

في هذا المرشح:

- لا يستخدم وصف `Closed as Baseline Architecture` كدليل على اعتماد الملف قبل بوابة المالك.
- مكتبات Phase 02 التي تمت مراجعتها وإغلاقها موثقة في Sections 13–21، ويجمع Section 21.11 حالتها كـcandidate locked clinical content.
- `Detailed medical question library lock` لم يعد وصفًا صحيحًا كعنصر مفتوح شامل؛ المفتوح يقتصر على العناصر التي يحددها هذا الملف صراحة كما في Section 2.3.
- هذا الملف هو `Baseline Candidate for Owner Approval`، لكنه ليس `Approved Baseline` ولا `Implementation Handoff`.
- أي انتقال إلى التنفيذ يحتاج اعتمادًا صريحًا ثم handoff مستقلًا؛ ولا يجوز لـCodex استنتاج readiness للتنفيذ من وجود أقسام architecture/tests في هذا المرشح.


---


### 12.1 Candidate Promotion Rule

If this file is approved, only content stated as candidate content or candidate locked content becomes part of the approved baseline. Anything explicitly marked `Open Decision`, outside the lock, not yet reviewed, or requiring separate approval remains open after approval and must not be implemented by inference.

Approval of this candidate does **not** itself create an `Implementation Handoff`. A separate handoff must identify the approved baseline version and translate only approved behavior into implementation tasks without inventing unresolved details.

### 12.2 Candidate Content Classes

| Class | Meaning in this file | Effect before approval | Effect after explicit Baseline approval |
|---|---|---|---|
| `CANDIDATE_ARCHITECTURE` | Sections 2–12 content proposed for baseline approval | Non-governing | Governing only to the extent expressly approved |
| `CANDIDATE_CLINICAL_LOCK` | Phase 02 reviewed content in Sections 13–21 | Non-governing for implementation | Governing clinical content if included in approval |
| `OPEN_DECISION` | Items explicitly left open/outside lock | Must not be inferred | Remains open unless separately approved |
| `POST_APPROVAL_TEST_TARGET` | Test targets derived from candidate behavior | No implementation authorization | May be used only after Approved Baseline and handoff |


## 13. Clinical Content — Phase 02 Candidate Locked Decisions

> **Authority boundary:** This section carries the explicit Owner decisions captured during Phase 02 clinical review into this `Baseline Candidate`. They remain non-governing for implementation until this candidate is explicitly approved as `Approved Baseline` under the project Governing Authority Rule.
>
> **Source policy:** The Phase 02 clinical decisions are preserved in the package-local `CLINICAL_REVIEW_CONTENT_v1.8_INCLUDED.md`; the complete reviewed wording/options/help publication is package-local in `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md`; and the current routing, scope, overrides, and candidate locks are in Sections 13–21 of this document. No external clinical file, Word file, or legacy package is an implementation dependency. No new medical content is introduced by this correction. Paper/Word layout is not a platform UI specification.

### 13.1 Phase 02.1 — Patient Profile & Visit Reasons

#### Patient Profile

- Full name: entered by PATIENT; Required.
- Date of Birth: entered by PATIENT; Required.
- Age: no independent patient question; derive `ageAtVisit` from DOB and visit/reference date; UI may display the calculated age for error detection.
- Sex: `MALE / FEMALE`; entered by PATIENT; Required.
- Marital status: `MARRIED / NOT_MARRIED`; entered by PATIENT; Required.
- Clinic MRN: not a patient clinical question; STAFF-side identity linkage only.

#### Visit Reason labels

Approved patient-facing Hair Loss label:

> **تساقط الشعر أو ترققه / نقص كثافته**

Current PRIMARY reasons:

```text
RV_HAIR_LOSS
RV_SCALP_SYMPTOMS
RV_HAIR_QUALITY
RV_DERMATOLOGY
RV_LASER
RV_AESTHETIC_PROCEDURES
```

#### PRIMARY / ADDITIONAL behavior captured in clinical review

- Exactly one `PRIMARY` remains the visit model.
- Only `RV_LASER` and `RV_AESTHETIC_PROCEDURES` may be `ADDITIONAL`.
- Hair Loss, Scalp Symptoms, Hair Quality, and Dermatology may each carry Laser, Aesthetic, **or both Laser and Aesthetic together** as additional requests in the same visit.
- Hair Quality itself does not become an ADDITIONAL reason.
- Hair Loss and Scalp Symptoms are not stored as two VisitReasons. One is the entry PRIMARY; the other may activate as a secondary module inside `HAIR_SCALP_PATHWAY`.
- Validation uses an explicit allow-list: only combinations recorded in the approved matrix are accepted. Every unlisted combination is rejected and must not be inferred from similarity to an approved combination.

#### Hair Loss ↔ Scalp secondary concern gates

The secondary module gate must **not** appear at the beginning and must **not** reuse the other module's main question as a screening question.

If `PRIMARY = RV_HAIR_LOSS`, after completion of the basic Hair Loss current-concern questions, show:

> **بالإضافة إلى مشكلة الشعر التي ذكرتها، هل لديك حاليًا أعراض أو مشكلة في فروة الرأس ترغب في مناقشتها مع الطبيب؟**
>
> `YES / NO`

- `NO` → Scalp Module remains inactive.
- `YES` → activate Scalp Module; do not create a second VisitReason.

If `PRIMARY = RV_SCALP_SYMPTOMS`, after completion of the basic Scalp questions, show:

> **بالإضافة إلى مشكلة فروة الرأس، هل تلاحظ أيضًا تساقطًا في الشعر أو ترققًا / نقصًا في كثافته ترغب في مناقشته مع الطبيب؟**
>
> `YES / NO`

- `NO` → Hair Loss Module remains inactive.
- `YES` → activate Hair Loss Module; do not create a second VisitReason.

### 13.2 Phase 02.2 — Health Snapshot

Approved patient flow position:

```text
Patient Profile
→ Reason for Visit
→ Health Snapshot
→ Active Clinical Pathway
```

Health Snapshot appears once per visit and uses progressive disclosure.

Prompt:

> **نود معرفة بعض المعلومات عن صحتك العامة. اختر كل ما يتعلق بك:**

Options:

- مرض مزمن
- ورم سابق أو حالي
- أستخدم أدوية بانتظام حاليًا
- أستخدم فيتامينات أو مكملات غذائية حاليًا
- لدي حساسية معروفة
- سبق أن أجريت عملية جراحية أو تم تنويمي بالمستشفى
- لا يوجد شيء مما سبق

Rules:

- At least one option must be selected.
- `NONE_OF_THE_ABOVE` is mutually exclusive with every other option.
- Only selected branches become visible.
- Repeatable medical items are separate repeatable items rather than one combined free-text field.

Selected branches:

| Branch | Captured data |
|---|---|
| Chronic disease | patient-entered free-text name; repeatable; approximate diagnosis date; ongoing/under follow-up `YES / NO / UNSURE` |
| Tumor | patient-entered free-text name; repeatable; approximate diagnosis date; current/under follow-up `YES / NO / UNSURE` |
| Regular medications | patient-entered free-text medication name; repeatable; dose if known / unknown dose, frequency; excludes pathway-specific hair/scalp treatment items |
| Vitamins / supplements | patient-entered free-text supplement name; repeatable; dose if known, frequency |
| Allergies | type, item/substance, reaction, severity if known; no automatic contraindication without an approved rule |
| Surgery / hospitalization | repeatable; `SURGERY` or `HOSPITALIZATION`; procedure/reason; approximate date with month/year, year only, or unknown |

No predefined catalogue is shown for chronic diseases, tumors, regular medications, or vitamins/supplements. The patient writes each item name.

### 13.3 Phase 02.3 — Hair Loss Current Concern — Locked Portion

#### 13.3.1 Main Hair Loss concern

When Hair Loss Module is active, the current-concern choices are:

```text
SHEDDING
THINNING
BOTH
```

The prior `NEITHER` choice is removed from this Hair Loss module. Its role in the older combined hair/scalp questionnaire was to route a patient without shedding/thinning toward scalp symptoms; the platform now handles that through separate Visit Reason entry and the approved Secondary Concern Gate.

#### 13.3.2 Shed-hair characteristics

Visible when concern includes `SHEDDING` or `BOTH`:

> **عندما تلاحظ الشعر المتساقط، هل يكون في طرف الشعرة جذر أو انتفاخ صغير؟**
>
> `YES / NO / UNSURE`

> **هل تلاحظ أيضًا تساقط شعر قصير جدًا أو شعر صغير حديث النمو؟**
>
> `YES / NO / UNSURE`

#### 13.3.3 Shedding onset

Added and approved:

> **متى لاحظت تساقط الشعر لأول مرة؟**

Visible for `SHEDDING` or `BOTH`.

The shedding onset is stored independently from thinning onset.

#### 13.3.4 Thinning onset

> **متى لاحظت ترقق الشعر أو انخفاض كثافته لأول مرة؟**

Visible for `THINNING` or `BOTH`.

If `BOTH`, collect shedding onset and thinning onset independently; do not assume the same start date.

#### 13.3.5 Current shedding severity

Visible for `SHEDDING` or `BOTH`.

Scale `0–5` using the package-local reviewed definitions below:

| Score | Meaning |
|---:|---|
| 0 | لا يوجد تساقط زائد |
| 1 | بسيط جدًا |
| 2 | خفيف |
| 3 | متوسط |
| 4 | شديد |
| 5 | شديد جدًا |

#### 13.3.6 Speed of thinning / density change

Approved question text:

> **ما هي سرعة ترقق الشعر وتغير كثافة فروة الرأس؟**

Visible for `THINNING` or `BOTH`.

Approved options:

- أقل من 3 أشهر
- 3 إلى أقل من 6 أشهر
- 6 إلى أقل من 12 شهرًا
- سنة إلى أقل من سنتين
- سنتان أو أكثر
- لا أتذكر / غير متأكد

#### 13.3.7 Thinning / density-loss areas

`MULTI_SELECT`.

General options:

- كامل فروة الرأس
- مقدمة الرأس / خط الشعر الأمامي
- **الصدغان (الصنادح)**
- منتصف فروة الرأس / مفرق الشعر
- منطقة التاج
- مؤخرة الرأس
- مناطق محددة أو بقعية
- أخرى

Male-only option visibility:

- اللحية
- السوالف
- الشارب

Female patients must not be shown male-only facial-hair options.

A neutral head/face illustration may support area selection; the Word/paper layout itself is not copied to platform UI.

#### 13.3.8 Current thinning / density-loss severity

Visible for `THINNING` or `BOTH`.

Scale `0–5`:

| Score | Meaning |
|---:|---|
| 0 | لا يوجد |
| 1 | بسيط جدًا |
| 2 | خفيف |
| 3 | متوسط |
| 4 | شديد |
| 5 | شديد جدًا |

Shedding Severity and Density Loss remain separate measures.

#### 13.3.9 Patient-observed evidence of hair loss / density reduction

Prompt:

> **ما الذي جعلك تلاحظ أن كمية شعرك أو كثافته قد انخفضت؟**

`MULTI_SELECT` options from the package-local reviewed list below:

- أصبحت ربطة الشعر أرفع
- أصبحت تحتاج إلى لف ربطة الشعر مرات أكثر
- أصبحت فروة الرأس أكثر وضوحًا
- اتسع مفرق الشعر
- تراجع خط الشعر
- ظهرت فراغات أو مناطق أقل كثافة
- ألاحظ كمية أكبر من الشعر أثناء الغسل أو التمشيط
- لاحظ أشخاص آخرون تغيرًا في شعري
- الصور القديمة تظهر فرقًا واضحًا
- أخرى

`Other` opens a short text field.

#### 13.3.10 Course of shedding over time

Visible for `SHEDDING` or `BOTH`:

> **كيف كان تساقط الشعر منذ أن بدأ؟**

Options:

- مستمر
- يأتي ويذهب
- مستمر لكن شدته تتغير
- لا أتذكر / غير متأكد

#### 13.3.11 Course of thinning over time

Visible for `THINNING` or `BOTH`:

> **كيف كان ترقق الشعر أو نقص الكثافة منذ أن بدأ؟**

Options:

- مستمر
- يأتي ويذهب
- مستمر لكن شدته تتغير
- لا أتذكر / غير متأكد

When `BOTH`, ask the shedding-course and thinning-course questions independently.

#### 13.3.12 Secondary Scalp Gate placement

After all basic Hair Loss current-concern questions above are complete, and **before** shared prior-diagnosis / biopsy / hair-scalp-treatment history, show the approved Secondary Scalp Gate from Section 13.1.

This gate determines whether Scalp Module becomes active. It does not create or change a VisitReason.

### 13.4 Previous Hair/Scalp Diagnoses — Locked in Clinical Review

This subsection is included as candidate locked clinical content based on the Phase 02 reviewed source and explicit owner decisions captured there. It is not implementation-governing until the candidate passes the project approval gate.

#### 13.4.1 Prior diagnosis gateway

Prompt:

> **هل سبق أن شخّصك طبيب بمشكلة في الشعر أو فروة الرأس؟**

Response type: `BOOLEAN`

Options:

- نعم
- لا

If `NO`, the prior-diagnosis branch ends.

If `YES`, show the diagnosis list below.

#### 13.4.2 Prior diagnosis list

Prompt:

> **ما التشخيصات التي سبق أن أخبرك بها طبيب بخصوص الشعر أو فروة الرأس؟**

Response type: `MULTI_SELECT` with repeatable per-diagnosis date data where applicable.

Approved clinical-content options for this review:

- تساقط الشعر الوراثي — Pattern hair loss / androgenetic alopecia
- الثعلبة المناعية — Alopecia areata
- نتف الشعر — Trichotillomania
- ثعلبة الشد — Traction alopecia
- التساقط الكربي — Telogen effluvium
- تساقط ما بعد الولادة أو الرضاعة — Postpartum or breastfeeding-related shedding
- فطريات فروة الرأس — Tinea capitis / scalp fungal infection
- الذئبة — Lupus
- تساقط الشعر الندبي — Scarring alopecia
- القشرة أو التهاب الجلد الدهني — Seborrheic dermatitis / dandruff
- صدفية فروة الرأس — Scalp psoriasis
- وردية فروة الرأس — Scalp rosacea
- حساسية فروة الرأس — Scalp allergy
- هشاشة أو تكسر الشعر — Hair fragility or breakage
- لا أتذكر التشخيص — I do not remember the diagnosis
- أخرى — Other

For every remembered diagnosis selection, collect its own approximate diagnosis date using the supported date precision from the platform content model.

`Other` opens a short text field and may be selected together with named diagnoses.

`لا أتذكر التشخيص / I do not remember the diagnosis` is mutually exclusive with all named diagnosis options and with `Other`. Its meaning is that the patient remembers having received a prior diagnosis but does not remember what the diagnosis was.

### 13.5 Scalp Biopsy — Locked in Clinical Review

This subsection is included as candidate locked clinical content based on the Phase 02 reviewed source and owner approval captured there. It is not implementation-governing until the candidate passes the project approval gate.

#### 13.5.1 Biopsy gateway

Prompt:

> **هل سبق أن أُخذت خزعة من فروة الرأس؟**

Response type: `BOOLEAN`

Options:

- نعم
- لا

If `NO`, the biopsy branch ends.

If `YES`, collect the biopsy details below.

#### 13.5.2 Biopsy details

Collect:

- approximate biopsy date: month/year, year only, or `لا أتذكر`;
- scalp biopsy area:
  - مقدمة الرأس
  - الصدغان / الجوانب
  - منتصف فروة الرأس
  - التاج
  - مؤخرة الرأس
  - أخرى
  - لا أتذكر
- whether the patient knows/remembers the biopsy result: `YES / NO`;
- if `YES`, a short free-text statement of the result remembered by the patient.

A biopsy is eligible for a timeline event only when a usable approximate date exists. An undated biopsy remains available in Clinical Story without an invented timeline date.

### 13.6 Hair and Scalp Treatments — Locked Structure in Clinical Review

This subsection locks the treatment-history structure, free-text continuous-treatment policy, and the final Hair/Scalp Procedure Catalogue.

#### 13.6.1 Unified treatment gateway

Prompt:

> **هل تستخدم حاليًا، أو سبق أن استخدمت، علاجًا مخصصًا للشعر أو فروة الرأس؟**

Response type: `BOOLEAN`

Options:

- نعم
- لا

This unified gateway replaces separate current-treatment and previous-treatment gateways. Current versus previous status is captured per treatment item.

If `NO`, the treatment-history branch ends.

If `YES`, each treatment/procedure is recorded as an independent repeatable item.

#### 13.6.2 Continuous medication/treatment item

For each continuous medication or treatment, collect:

- patient-entered free-text treatment identity/name or type; no predefined Treatment Catalogue is shown;
- approximate start date;
- whether the patient is still using it;
- if no longer using it, approximate stop date.

The same treatment should not be entered separately as both a current and a previous treatment. Its temporal status determines whether it is current or stopped.

#### 13.6.3 Procedure/session item

A procedure or session-based treatment is represented according to its event/session temporal model rather than as a continuous medication. For each procedure type, collect:

- procedure type;
- approximate number of sessions;
- date of the most recent session.

The final Hair/Scalp Procedure Catalogue is:

1. البلازما الغنية بالصفائح الدموية — PRP
2. المايكرونيدلينغ — Microneedling
3. ليزر تحفيز الشعر — Hair Stimulation Laser
4. الضوء الأحمر — Red Light Therapy
5. حقن المينوكسيديل — Minoxidil Injections
6. حقن الدوتاستيرايد — Dutasteride Injections
7. الإكسوزوم — Exosome Therapy
8. حقن الكورتيزون — Corticosteroid Injections
9. ريجينيرا — Regenera / Regenera Activa
10. إي سيل — ACell
11. زراعة الشعر — Hair Transplantation
12. إجراء آخر — Other

When `Other` is selected, a required free-text field appears for the procedure name. Implementation identifiers/codes are assigned later in the implementation contract and must preserve these labels and meanings; this does not reopen the clinical catalogue.

### 13.7 Consolidated Phase 02 Status Reference

Subsequent Phase 02 closures are recorded in Sections 14–21. The major libraries reviewed in this phase are included as candidate locked clinical content as summarized in Section 21.11. Items explicitly marked `Open Decision` or outside the lock remain open.


## 14. Trigger Events + Course / Impact / Expectations — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 14.1 Trigger Events

Prompt:

> **هل حدث أي مما يلي في الأشهر التي سبقت بداية مشكلة الشعر أو ازديادها؟**

Response type: `MULTI_SELECT`

Options:

- ضغط نفسي شديد
- حمية قاسية أو نزول وزن ملحوظ
- مرض شديد أو ارتفاع حرارة
- عملية جراحية
- تنويم في المستشفى
- حادث أو إصابة شديدة
- ولادة — visible to `FEMALE` only
- رضاعة — visible to `FEMALE` only
- بدء دواء جديد
- إيقاف دواء
- تغيير مانع الحمل أو الهرمونات — visible to `FEMALE` only
- بدء أو إيقاف هرمونات أو منشطات لبناء العضلات — visible to `MALE` only
- أخرى
- لا شيء مما سبق

Rules:

- `لا شيء مما سبق` is mutually exclusive with every other option.
- Sex-specific options use option-level visibility and are not shown to the other sex.
- Each selected trigger event is an independent `EVENT_ITEM` with its own approximate date.
- Approximate date options: month/year or `لا أتذكر`.
- A trigger event with a usable approximate date is eligible for Hair History timeline placement.
- An undated trigger event remains available in Clinical Story and must not be assigned an invented date.

### 14.2 Overall Course

Prompt:

> **بشكل عام، كيف ترى حالة شعرك الآن مقارنة ببداية المشكلة؟**

Response type: `SINGLE_SELECT`

Options:

- تحسنت
- لم تتغير بشكل ملحوظ
- تدهورت

Output classification: `Patient-reported Course / Impact`. It does not become a Hair Journey measurement line.

### 14.3 Patient Bother

Prompt:

> **إلى أي درجة تزعجك مشكلة شعرك حاليًا؟**

Response type: `SCALE` (`0–5`)

Scale:

- `0` = لا تزعجني
- `1` = بسيطة جدًا
- `2` = بسيطة
- `3` = متوسطة
- `4` = كبيرة
- `5` = تزعجني جدًا

Output classification: `Patient-reported Course / Impact`. It does not become a Hair Journey measurement line.

### 14.4 Confidence in Appearance Impact

Prompt:

> **إلى أي درجة أثرت مشكلة شعرك على ثقتك بمظهرك؟**

Response type: `SCALE` (`0–5`)

Scale:

- `0` = لم تؤثر
- `1` = بسيط جدًا
- `2` = بسيط
- `3` = متوسط
- `4` = كبير
- `5` = كبير جدًا

Output classification: `Patient-reported Course / Impact`. It does not become a Hair Journey measurement line.

### 14.5 Social Noticeability

Prompt:

> **هل تشعر أن حالة شعرك ملحوظة للآخرين في المواقف الاجتماعية؟**

Response type: `SINGLE_SELECT`

Options:

- نعم
- لا
- غير متأكد

Output classification: `Patient-reported Course / Impact`.

### 14.6 Treatment Preference

Prompt:

> **ما مستوى العلاج الذي ترغب في مناقشته لتحسين حالة شعرك؟**

Response type: `SINGLE_SELECT`

Options:

- العلاجات الأساسية فقط
- كل ما يمكن فعله طبيًا لتحسين حالة شعري

Output classification: `Patient Goals / Preferences`.

### 14.7 Result-Speed Expectation

Prompt:

> **كيف تصف توقعك للمدة اللازمة لظهور نتيجة العلاج؟**

Response type: `SINGLE_SELECT`

Options:

- أتفهم أن علاج الشعر يحتاج إلى وقت
- أرغب في نتيجة سريعة
- غير متأكد/ة

Output classification: `Patient Goals / Preferences`.

### 14.8 Locked Output Boundary

The items in Sections 14.2–14.5 are patient-reported course/impact information. Sections 14.6–14.7 are patient goals/preferences. None of these values are converted into Hair Journey numeric lines or invented timeline events.

### 14.9 Consolidated Phase 02 Status Reference

The Scalp Module is locked in Section 15, and the later Phase 02 libraries are closed in Sections 16–21. The consolidated final status is summarized in Section 21.11.

## 15. Scalp Module — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 15.1 Activation and Placement

`SCALP` may be activated in either of two ways:

1. `PRIMARY = RV_SCALP_SYMPTOMS` → the Scalp Module is the entry module and is completed first.
2. `PRIMARY = RV_HAIR_LOSS` → after the patient completes the locked basic Hair Loss questions, the following Secondary Scalp Gate appears:

> **بالإضافة إلى مشكلة الشعر التي ذكرتها، هل لديك حاليًا أعراض أو مشكلة في فروة الرأس ترغب في مناقشتها مع الطبيب؟**

Options: `YES / NO`

- `NO` → Scalp Module remains inactive.
- `YES` → activate Scalp Module.
- Activating Scalp as a secondary module does **not** create or modify a `VisitReason`.

When `PRIMARY = RV_SCALP_SYMPTOMS`, the patient completes the basic Scalp Module before the previously locked Secondary Hair Loss Gate is shown.

### 15.2 Scalp Symptoms

Prompt:

> **ما الأعراض التي تلاحظها في فروة الرأس؟ اختر كل ما ينطبق عليك.**

Response type: `MULTI_SELECT`

Options:

- حكة
- حرقان
- ألم
- ألم عند تحريك الشعر من الجذور
- قشرة
- تعرق مفرط
- رائحة مزعجة
- أخرى
- لا توجد أعراض

Rules:

- `لا توجد أعراض` is mutually exclusive with every other option.
- `أخرى` opens a short text field.
- The current modern Word clinical content is the clinical-content source for this symptom set.

### 15.3 Per-Symptom Detail

For each selected symptom, collect independently:

**Approximate onset**
- month/year
- `لا أتذكر`

**Pattern**
- مستمر
- يأتي ويذهب
- لا أعلم / غير متأكد

The onset and pattern belong to the selected symptom item and are not shared across all symptoms.

### 15.4 Governed Scalp Severity Measures

Current severity uses a `0–5` scale only for:

- الحكة
- الحرقان
- ألم فروة الرأس

Scale:

- `0` = لا يوجد
- `1` = بسيط جدًا
- `2` = خفيف
- `3` = متوسط
- `4` = شديد
- `5` = شديد جدًا

The phrase `0 = لا يوجد تساقط زائد` found in one separate Scalp Word copy is treated as a copy/paste error and is not adopted in the platform clinical source.

The following selected findings do **not** receive a `0–5` severity measure in the current locked content:

- ألم عند تحريك الشعر من الجذور
- قشرة
- تعرق مفرط
- رائحة مزعجة
- أخرى

They still retain their selected status, approximate onset, and pattern where applicable.

### 15.5 Worsening Factors

Prompt:

> **هل لاحظت شيئًا يزيد أعراض فروة الرأس أو يجعلها أسوأ؟**

Options: `YES / NO`

If `YES`, open one short text field describing the worsening factor(s).

This question is asked once for the active scalp-symptom group, not once per symptom.

### 15.6 Relieving Factors

Prompt:

> **هل لاحظت شيئًا يخفف أعراض فروة الرأس؟**

Options: `YES / NO`

If `YES`, open one short text field describing the relieving factor(s).

This question is asked once for the active scalp-symptom group, not once per symptom.

### 15.7 Particular Time or Circumstance

Prompt:

> **هل تلاحظ أن أعراض فروة الرأس تزداد في وقت أو ظرف معين؟**

Options:

- نعم
- لا
- لا أعلم / لا أتذكر

If `YES`, ask:

> **متى أو في أي ظرف؟**

and open one short description field.

### 15.8 Scalp Output Boundary

The governed numeric Scalp measures are:

- Itch
- Burning
- Scalp Pain

Other current Scalp findings remain structured symptoms/events/annotations unless a later physician-approved decision promotes one to a numeric measure.

### 15.9 Shared Hair/Scalp History Boundary

When both Hair Loss and Scalp Modules are active, shared sections such as:

- previous Hair/Scalp diagnoses;
- scalp biopsy;
- Hair/Scalp treatments;

are asked only once according to the previously locked scope/deduplication rules. Activating the secondary module must not duplicate those shared questions.

### 15.10 Consolidated Phase 02 Status Reference

The Hair Loss current-concern portion, shared diagnoses/biopsy/treatments, Trigger Events, Course/Impact/Expectations, and Scalp Module are included as candidate locked clinical content. Hair Quality and the remaining major Phase 02 libraries are likewise carried forward in Sections 16–21.

## 16. Hair Quality — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 16.1 Language and Terminology Rule

- Patient-facing review content is maintained in Arabic.
- Do not mix Arabic and English inside the same patient-facing question or option.
- Drug and treatment names are presented in the Arabic terminology used in `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md`.
- No additional heat-tool help paragraph is required by this candidate. Implement the question, options, frequency, and heat-protectant follow-up published below; any later explanatory help text requires a new versioned amendment.

### 16.2 Hair State

Question:

> **كيف تصف حالة شعرك؟**

Options:
- شعر بكر
- شعر غير بكر / معالج

Information text attached to this question:

- **الشعر البكر:** شعر طبيعي لم يتعرض لأي تغيير كيميائي؛ لم يُصبغ أو يُسحب لونه، ولم يتعرض لفرد أو تجعيد كيميائي، ولم يُعالج ببروتينات أو كيراتين صالونات، ولم يتعرض لحرارة مفرطة مثل الاستشوار أو مكواة الفرد بدون حماية. تركيبته الداخلية (الكيراتين) طبيعية وسليمة، وغالبًا أقوى وأقل عرضة للتقصف والجفاف.
- **الشعر غير البكر:** شعر طرأ عليه تغيير في تركيبه الطبيعي، ويشمل أي تدخل يغير بنية الشعرة الأصلية. من أمثلته: الصبغ، سحب اللون، الفرد الكيميائي، التجعيد الكيميائي، بروتين الشعر في الصالونات، أو التعرض لحرارة متكررة أو قوية مثل الاستشوار بدون حماية أو مكواة الفرد (الليس). قد يصبح أضعف وأكثر عرضة للجفاف والتقصف.

Platform rule:
- This question appears whenever the Hair Quality module is active.
- If the patient selects `شعر بكر` but later selects a chemical/cosmetic treatment incompatible with virgin hair, the platform must request correction rather than infer which answer is correct.

### 16.3 Previous Hair Treatments

Question:

> **ما المعالجات التي سبق أن تعرض لها شعرك؟**

Options:
- صبغات
- سحب اللون / تفتيح الشعر
- كيراتين
- بروتين
- فرد كيميائي
- تجعيد كيميائي (بيرم / بيرما)
- معالجة كيميائية أخرى
- لا شيء مما سبق

Rules:
- `لا شيء مما سبق` is mutually exclusive.
- Detail fields appear only for each selected treatment.
- Each selected treatment is handled as its own structured item.

### 16.4 Drug / Treatment Exposure Relevant to Hair Quality

Question:

> **هل تستخدم حاليًا، أو سبق أن استخدمت، أيًا من الأدوية أو العلاجات التالية؟ اختر كل ما ينطبق عليك.**

Options:
- العلاج الكيماوي — التاكسانات
- العلاج الكيماوي — بوسلفان
- العلاج الكيماوي — سيكلوفوسفاميد
- الريتينويدات — إيزوتريتينوين (روأكيوتان / روكتان)
- الريتينويدات — أسيتريتين
- أدوية عصبية / مضادة للاختلاجات — حمض الفالبرويك
- أدوية عصبية / مضادة للاختلاجات — بريجابالين
- أدوية عصبية / مضادة للاختلاجات — فينيتوين
- العلاج المضاد للفيروسات القهقرية
- علاج مُعدّل للمناعة — توسيليزوماب
- دواء أو علاج آخر
- لا شيء مما سبق

Rules:
- `لا شيء مما سبق` is mutually exclusive.
- Per-item detail is shown only for selected drugs/treatments.
- For each selected item, capture independently: `CURRENTLY_USING / USED_PREVIOUSLY`; start as `MONTH_YEAR / YEAR_ONLY / DO_NOT_REMEMBER`; stop as the same approximate-date set when previously used; whether a change in hair nature or texture was noticed as `YES / NO / UNSURE`; and a short description only when `YES`.
- If the same medication has already been entered in Health Snapshot under the same scope, the platform should reuse the existing medication record and ask only the Hair Quality-specific follow-up instead of requesting the same medication identity/dose again.

### 16.5 Natural Hair Pattern

Question:

> **ما النمط الطبيعي لشعرك؟**

Options:
- مستقيم
- متموج
- مجعد
- شديد التجعد أو لولبي
- يوجد أكثر من نمط في مناطق مختلفة
- غير متأكد

Rules:
- Appears for all patients in Hair Quality.
- If a treatment that changes hair shape has been selected, the question refers to the natural pattern before treatment.
- `لا أتذكر نمط شعري الطبيعي قبل المعالجة` becomes available when that conditional context applies.
- Supporting visuals must be supplied and versioned as package-local presentation assets in the future implementation handoff; absent legacy visuals are not an executable dependency.

### 16.6 Current Hair Quality Problems

Question:

> **ما المشكلات التي تلاحظها حاليًا في جودة شعرك؟**

Options:
- جفاف
- تقصف
- تكسر
- هيشان
- تشابك
- قلة لمعان
- ضعف المرونة
- خشونة الشعرة
- لا شيء مما سبق

Rules:
- Appears for all patients in Hair Quality.
- `لا شيء مما سبق` is mutually exclusive.

### 16.7 Heat Tools

Question:

> **ما أدوات الحرارة التي تستخدمها على شعرك؟ اختر كل ما ينطبق عليك**

Options:
- سشوار / مجفف الشعر
- مكواة فرد الشعر (ليس / سيراميك / تيتانيوم)
- جهاز تجعيد الشعر (فير)
- ديفيوزر
- لا أستخدم أدوات حرارة

Rules:
- The published options above are the complete executable heat-tool content for this candidate.
- `لا أستخدم أدوات حرارة` is mutually exclusive.
- Frequency is asked only for each selected heat tool.
- Heat-protectant use is asked only if at least one heat tool is selected.

### 16.8 Hair Washing and Cleansers

Questions:
- **كم مرة تغسل شعرك عادة في الأسبوع؟**
- **ما أنواع المنظفات أو الشامبو التي تستخدمها حاليًا؟**

Options:
- كو-واش أو لو-شامبو
- شامبو يحتوي على سلفات أو سلفونات
- شامبو خالٍ من السلفات
- شامبو منقٍ
- شامبو مخلبي
- شامبو مضاد للقشرة
- لا أعرف نوعه
- أخرى

Rules:
- These questions appear for all patients in Hair Quality.
- `أخرى` opens **اكتب نوع المنظف أو الشامبو الآخر** as a required short text field.

### 16.9 Hair Care Routine

Question:

> **أي عناصر من روتين العناية تستخدمها حاليًا؟**

Options:
- شامبو
- بلسم
- ماسك
- ليف إن
- زيت
- لا أستخدم أيًا منها بانتظام

Rules:
- `لا أستخدم أيًا منها بانتظام` is mutually exclusive.
- Frequency details appear only for each selected routine item.
- Routine regularity appears only if at least one routine item is selected.
- Ask **هل تغيّر روتين العناية بشعرك مؤخرًا؟** with `نعم / لا / لا أتذكر`.
- If `نعم`, ask **ما الذي تغيّر، ومتى بدأ التغير؟** using short text plus `MONTH_YEAR / DO_NOT_REMEMBER`.

### 16.10 Post-Wash Order

The post-wash order question is limited to the items the patient actually uses from:
- بلسم أو ماسك
- ليف إن
- زيت

Rules:
- Do not force ranking of items the patient does not use.
- If only one or two applicable items are used, rank only those selected items.

### 16.11 Hair Quality Module Status

The Hair Quality clinical content and platform display logic reviewed in Phase 02 are included as candidate locked clinical content. The libraries that followed it in the review sequence are likewise carried forward in Sections 17–21.

## 17. Women’s Health + Men’s Health — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 17.1 General Display Principle

Women’s Health and Men’s Health are not always-on standalone questionnaires.

- Women’s Health is eligible only for female patients.
- Men’s Health is eligible only for male patients.
- Women’s Health activates only when the Hair Loss pathway is active. It does not activate for isolated Scalp, Hair Quality, Dermatology, Laser, or Aesthetic pathways.
- Men’s Health activates only through expressly approved pathway/question triggers; missing triggers remain an `Open Decision` and must not be invented.
- Within either active library, follow-up questions appear only when required by approved prior-answer branching.

`Pregnancy Context` is a shared conditional module distinct from Women’s Health. It is eligible for `FEMALE` patients and is available through every supported Pilot 0 pathway: Hair Loss, Scalp, Hair Quality, Dermatology, Laser, and Aesthetic Procedures. It is instantiated at most once per visit and is not gated by marital status, nationality, or culture. Its internal pregnancy, breastfeeding, and pregnancy-planning follow-ups remain progressively disclosed according to the package-local response rules. No additional contraindication or medical-suitability rule may be inferred.

### 17.2 Opening Symptom Questions

The opening symptom questions in Women’s Health and Men’s Health are `MULTI_SELECT`.

Rules:
- `لا شيء مما سبق` is mutually exclusive with all other symptom options.
- Follow-up details appear only for symptoms actually selected.
- Each symptom retains its own timing/history details rather than sharing one generic date across unrelated symptoms.

### 17.3 Women’s Health Branching

The complete patient-facing wording, response options, information text, and conditional prompts are published locally under Section `11. Women’s Health` in `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md`. Section 17.1 governs its approved Hair Loss-only activation boundary.

Approved display rules:
- menstrual-regularity details appear only where applicable;
- heavy-menstrual-flow details appear only if heavy flow is selected;
- light/scant menstrual-flow details appear only if that symptom is selected;
- excess facial/body hair details appear only if selected;
- acne details appear only if selected;
- increased oiliness details appear only if selected;
- fertility-difficulty details appear only if selected;
- contraception/hormonal-regulation details remain scoped to the Women’s Health context;
- pregnancy and breastfeeding remain separate branches and must not be merged;
- pregnancy-planning and intimate-desire questions retain their package-local published response sets and conditional details.

The response `لم أحاول الحمل` must not be interpreted as infertility or fertility difficulty.

### 17.4 Men’s Health Branching

The complete patient-facing wording, response options, and conditional prompts are published locally under Section `12. Men’s Health` in `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md`. Section 17.1 above governs activation and preserves its unresolved trigger boundary.

Approved display rules:
- reduced-libido details appear only if that symptom is selected;
- erectile-difficulty details appear only if selected;
- breast enlargement/pain details appear only if selected;
- reduced beard/body-hair details appear only if selected;
- muscle/strength-change details appear only if selected;
- fertility-history remains its own branch;
- hormone/anabolic-agent exposure remains a separate structured exposure record with package-local published start/stop timing and hair/scalp effects;
- the final additional hormonal/reproductive-health information field appears only when the patient answers `نعم`.

The response `لم أحاول الإنجاب` must not be interpreted as infertility or fertility difficulty.

### 17.5 Deduplication Across Health Snapshot and Sex-Specific Libraries

When a fact already exists in the same visit and same data scope, the patient should not be asked to re-enter the same fact.

Examples:
- if a medication is already recorded in Health Snapshot, reuse that medication record and ask only the sex-specific symptom relationship or relevant follow-up;
- if contraception or hormonal treatment is already recorded in an equivalent same-visit scope, reuse the existing fact and ask only the section-specific follow-up.

Deduplication must preserve clinically distinct context. Reuse does not mean collapsing different meanings or silently inferring relationships.

### 17.6 Date and Event Scope

Dates remain attached to the specific symptom, exposure, pregnancy/breastfeeding event, medication relationship, or other item they describe.

The platform must not merge dates from different sex-specific symptoms into one generic timeline point.

### 17.7 Free-Text Fields

Free-text input appears only where `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md` explicitly provides:
- `أخرى`;
- medication/treatment name where requested;
- description of an observed change;
- explicit final “additional information” question.

No new free-text prompts are introduced by platform inference.

### 17.8 Locked Status

Women’s Health and Men’s Health clinical-content branching and the platform rules above are included as candidate locked clinical content. Lifestyle / Nutrition, Dermatology, Laser, and Aesthetic Procedures are likewise carried forward in Sections 18–21. Only exact Men’s Health triggers explicitly left unapproved in Section 17.1 remain an `Open Decision`.

## 18. Lifestyle / Nutrition — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 18.1 Clinical Content

The reviewed Arabic questions/options are:

1. **هل تواجه صعوبة في اكتساب الوزن؟** — `نعم / لا`.
2. **هل يمر عليك أسبوع كامل من دون تناول خضار؟** — `نعم / لا / لا أتذكر`.
3. **هل يمر عليك أسبوع كامل من دون تناول لحوم حمراء؟** — `نعم / لا / لا أتذكر`.
4. **هل تعاني من إسهال مزمن؟** — `نعم / لا`.
5. **هل أجريت عملية لإنقاص الوزن؟** — `نعم / لا`; if `نعم`, capture the operation type and approximate date.
6. **هل تدخن أو تستخدم السجائر الإلكترونية / الفيب؟** — `نعم / لا`.
7. **هل تستخدم أيًا مما يلي؟** — `وصلات الشعر / باروكة أو قطعة شعر / ألياف تكثيف الشعر / مستحضرات أو بخاخات لإخفاء الفراغات / لا أستخدم أيًا مما سبق`.

### 18.2 Activation Trigger

The approved activation rule is:

`LIFESTYLE_NUTRITION_ACTIVE = HAIR_LOSS_ACTIVE OR HAIR_QUALITY_ACTIVE`

Meaning:

- Activate the Lifestyle / Nutrition library whenever the Hair Loss module is active, whether Hair Loss is primary or secondary.
- Activate the Lifestyle / Nutrition library whenever Hair Quality is the active primary pathway.
- Do not activate the library solely for isolated Scalp Symptoms.
- Do not activate the library automatically for Dermatology, Laser, or Aesthetic Procedures unless Hair Loss or Hair Quality is also active in the same visit.
- If both Hair Loss and Hair Quality are active, ask the Lifestyle / Nutrition library once only.

No new patient-facing gate question is added to activate this library.

### 18.3 Conditional Display Rules

- Weight-loss surgery details appear only when the patient answers `نعم` to the prior weight-loss-surgery question.
- In the hair-concealment / hair-addition multi-select question, `لا أستخدم أيًا مما سبق` is mutually exclusive with all other options.
- The library is deduplicated at visit scope and must not be repeated when activated by more than one eligible hair pathway.

### 18.4 Locked Status

Lifestyle / Nutrition clinical content and its activation/display logic are included as candidate locked clinical content. Dermatology, Laser, and Aesthetic Procedures are likewise carried forward in Sections 19–21.

## 19. Dermatology — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 19.1 Clinical Content

The Dermatology section remains exactly as present in `ALL_QUESTIONS_CLINICAL_CONTENT_v1_INCLUDED.md`.

Question:

> **ما المشكلة الجلدية التي ترغب بمراجعتها؟**

Response type:
- free-text description.

No additional Dermatology questions, diagnosis lists, symptom lists, body-location lists, duration questions, or other clinical branches are added in this review.

### 19.2 Display Rule

- Show this question when Dermatology is the active primary visit reason.
- If Laser and/or Aesthetic Procedures are also selected as additional services, the Dermatology free-text concern remains independent and the additional service pathway is handled separately according to its own rules.

### 19.3 Interpretation Boundary

- The patient-entered free text must not be converted automatically into a diagnosis.
- No additional clinical inference, alert, contraindication, or medical routing rule is introduced from this free-text field unless expressly governed elsewhere in this package.

### 19.4 Locked Status

Dermatology is closed in Phase 02 exactly at the scope above. Laser and Aesthetic Procedures were subsequently closed in Sections 20–21.

## 20. Laser — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 20.1 Clinical Content

The complete executable Laser selection and field contract for this candidate is published in this section; no absent catalogue is required.

The patient may select one or more Laser concerns from the package-local reviewed list below:
- إزالة الشعر غير المرغوب فيه
- التصبغات والبقع الداكنة، بما فيها النمش
- الكلف
- الاحمرار والوردية والأوعية الدموية السطحية
- ندبات حب الشباب
- الندبات الأخرى
- إعادة تسطيح الجلد لتحسين الملمس أو الخطوط الدقيقة
- إزالة الوشم أو المكياج الدائم
- مشكلة أخرى قد تحتاج علاجًا بالليزر
- غير متأكد وأرغب بمناقشة الخيارات مع الطبيب

### 20.2 Concern-Centric Data Model

Each selected Laser concern is treated as an independent `Laser Concern`.

For every selected concern, the platform keeps that concern’s own Mini-Pathway history fields:
- prior treatment for the same concern;
- approximate number of prior sessions;
- latest prior session date;
- prior complication history;
- remembered complication description where applicable.

Only when Laser is `PRIMARY`, the same concern record also keeps full-pathway fields such as body/target area, goal, and desired result where explicitly defined. Those fields do not exist in the `ADDITIONAL` Mini Pathway.

Data from different Laser concerns must not be merged into one generic Laser history record.

### 20.3 Area

The area question is scoped to each selected Laser concern only when Laser is `PRIMARY`.

- Prompt: **ما المنطقة المرتبطة بهذه المشكلة؟**
- Package-local area choices are: `الوجه / الرقبة / فروة الرأس / اليدان / الجسم / اللغلوغ / تحت العين / منطقة أخرى`.
- Show only clinically applicable choices for the selected concern; `منطقة أخرى` opens **اذكر المنطقة الأخرى** as short text.
- Do not copy an area selected for one Laser concern onto another concern automatically.

### 20.4 Prior Laser / Light-Based Treatment

The prior-treatment question is asked independently for each selected concern.

If the patient answers `نعم`:
- show **كم عدد الجلسات السابقة تقريبًا؟** as a non-negative approximate integer;
- show **متى كانت آخر جلسة تقريبًا؟** with `شهر/سنة / السنة فقط / لا أتذكر`.

If the patient answers `لا`, those detail fields remain hidden for that concern.

### 20.5 Prior Complications

The prior-complication question is shown only where there is prior Laser/light-based treatment for that same concern.

Response options are:
- نعم
- لا
- لا أتذكر

If `نعم`, open **اذكر ما تتذكره من المضاعفات** as a short description field.

Complication history remains scoped to the related Laser concern and is not generalized to unrelated Laser concerns.

### 20.6 Other / Unsure

- `مشكلة أخرى قد تحتاج علاجًا بالليزر` opens **اكتب المشكلة أو الطلب الآخر** as a short description field.
- `غير متأكد وأرغب بمناقشة الخيارات مع الطبيب` remains an undecided/request-for-assessment choice and must not be used by the platform to infer a Laser type, device, diagnosis, or treatment plan.

### 20.7 Primary vs Additional Service

When Laser is `PRIMARY`:
- show the full governed Laser pathway.

When Laser is `ADDITIONAL`:
- retain a separate selected-concern record only to identify the requested Laser concern;
- ask only: prior treatment for that same concern; approximate number of prior sessions when `نعم`; latest prior session date; prior complications; and remembered complication description when complications are `نعم`;
- do not ask area, goal, desired result, or any full-pathway-only field in the ADDITIONAL Mini Pathway.
- Laser remains an additional service and must not create a second primary `VisitReason`.

### 20.8 Multiple Laser Concerns

If the patient selects multiple Laser concerns in the same visit:
- create separate concern records;
- when Laser is `PRIMARY`, collect each concern’s full governed fields independently, including area where defined;
- when Laser is `ADDITIONAL`, collect only each concern’s Mini-Pathway history/complication fields and never area, goal, or desired-result fields;
- ask shared visit-level information only once where governed elsewhere by the platform.

### 20.9 Locked Status

Laser clinical content and its display/data-scoping rules are included as candidate locked clinical content. Aesthetic Procedures is likewise carried forward in Section 21.

## 21. Aesthetic Procedures — Locked in Clinical Review

**Candidate status:** Owner-approved in Phase 02 clinical review and included in this Baseline Candidate. These decisions remain non-governing for implementation until the candidate is explicitly approved as `Approved Baseline`.

### 21.1 Clinical Content

The complete executable Aesthetic Procedures selection and field contract for this candidate is published in this section; no absent procedure catalogue is required.

The patient may select one or more procedures from the package-local reviewed list below:
- بوتوكس
- فيلر
- سكين بوستر
- محفزات الكولاجين
- حقن إذابة الدهون
- علاج التعرق بالحقن
- إجراءات نحت أو تحسين القوام
- إجراء تجميلي آخر

### 21.2 Procedure-Centric Data Model

Each selected aesthetic procedure is treated as an independent `Aesthetic Procedure`.

For every selected procedure, the platform keeps that procedure’s own Mini-Pathway history fields:
- prior history of the same procedure;
- approximate number of prior sessions/procedures;
- latest prior session/procedure date;
- prior complication history;
- remembered complication description where applicable.

Only when Aesthetic Procedures is `PRIMARY`, the same procedure record also keeps full-pathway fields such as treatment area, goal where defined, and desired result/change. Those fields do not exist in the `ADDITIONAL` Mini Pathway.

Data from different aesthetic procedures must not be merged into one generic aesthetic history record.

### 21.3 Area

The area question is scoped to each selected procedure only when Aesthetic Procedures is `PRIMARY`.

- The package-local procedure/area mapping is:
  - `بوتوكس`: الوجه والرقبة؛ تعرّق فروة الرأس؛ الندبات؛ الوردية؛ النضارة؛ المسام.
  - `فيلر`: الوجه؛ الجسم؛ اليدان؛ مناطق خاصة.
  - `محفزات الكولاجين`: الوجه؛ الرقبة؛ اليدان؛ الجسم.
  - `حقن إذابة الدهون`: اللغلوغ؛ تحت العينين؛ الجسم.
  - `إجراءات نحت أو تحسين القوام`: مناطق الجسم.
  - `سكين بوستر` and `علاج التعرق بالحقن`: capture the treatment area as short text because no closed enumerated area list is published for either procedure.
- Do not copy an area selected for one procedure onto another procedure automatically.

### 21.4 Goal

The goal question is scoped independently to each selected procedure only when Aesthetic Procedures is `PRIMARY`.

- The package-local goals are: `سكين بوستر — إبرة نضارة`; `إجراءات نحت أو تحسين القوام — تضخيم مناطق الجسم / تنحيف مناطق الجسم`.
- For `بوتوكس`, `فيلر`, `محفزات الكولاجين`, and `حقن إذابة الدهون`, the selected area identifies the structured request and the desired-result field in Section 21.7 captures the goal in the patient’s words; no additional enumerated goal list is inferred.
- Do not invent a goal list for `علاج التعرق بالحقن`; no separate goal list is approved for that procedure in this candidate.

### 21.5 Prior Same Procedure

The prior-procedure question is asked independently for each selected procedure.

If the patient answers `نعم`:
- show **كم عدد الجلسات أو الإجراءات السابقة تقريبًا؟** as a non-negative approximate integer;
- show **متى كان آخر إجراء أو جلسة تقريبًا؟** with `شهر/سنة / السنة فقط / لا أتذكر`.

If the patient answers `لا`, those prior-procedure detail fields remain hidden for that procedure.

### 21.6 Prior Complications

The complication question is shown only where there is prior history of that same selected procedure.

Response options are:
- نعم
- لا
- لا أتذكر

If `نعم`, open **اذكر ما تتذكره من المضاعفات** as a short description field.

Complication history remains scoped to the related procedure and is not generalized to unrelated procedures.

### 21.7 Desired Result / Change

The desired-result/change free-text question is shown and stored within the same selected procedure record only when Aesthetic Procedures is `PRIMARY`.

When multiple procedures are selected, each procedure retains its own desired result/change so patient goals are not mixed across procedures.

### 21.8 Other Procedure

`إجراء تجميلي آخر` opens **اكتب الطلب أو الإجراء الآخر الذي ترغب بمراجعته** as a short description field.

No procedure, indication, device, product, or treatment plan is inferred automatically from free text.

### 21.9 Primary vs Additional Service

When Aesthetic Procedures is `PRIMARY`:
- show the full governed Aesthetic Procedures pathway.

When Aesthetic Procedures is `ADDITIONAL`:
- retain a separate selected-procedure record only to identify the requested procedure;
- ask only: prior history of that same procedure; approximate number of prior sessions/procedures when `نعم`; latest prior procedure/session date; prior complications; and remembered complication description when complications are `نعم`;
- do not ask treatment area, goal, desired result/change, or any full-pathway-only field in the ADDITIONAL Mini Pathway.
- Aesthetic Procedures remains an additional service and must not create a second primary `VisitReason`.

### 21.10 Multiple Aesthetic Procedures

If the patient selects multiple aesthetic procedures in the same visit:
- create separate procedure records;
- when Aesthetic Procedures is `PRIMARY`, collect each procedure’s full governed fields independently, including area, goal, and desired result where defined;
- when Aesthetic Procedures is `ADDITIONAL`, collect only each procedure’s Mini-Pathway history/complication fields and never area, goal, or desired-result fields;
- ask shared visit-level information only once where governed elsewhere by the platform.

### 21.11 Locked Status

Aesthetic Procedures clinical content and its display/data-scoping rules are included as candidate locked clinical content.

With this section, the major clinical libraries reviewed in Phase 02 are included in this Baseline Candidate as candidate locked clinical content:
- Patient Profile
- Health Snapshot
- Visit Reasons
- Hair Loss
- Scalp Symptoms
- Hair Quality
- shared Hair/Scalp diagnoses, biopsy, and treatments
- Trigger Events
- Course / Impact / Expectations
- Women’s Health
- Men’s Health
- Lifestyle / Nutrition
- Dermatology
- Laser
- Aesthetic Procedures

This file is a `Baseline Candidate for Owner Approval`. It is not implementation-governing and must not be treated as `Approved Baseline` or `Implementation Handoff` until the required approval gate is completed explicitly.

## 22. Baseline Candidate Approval Gate

### 22.1 Candidate Judgment

This document is prepared as a `Baseline Candidate for Owner Approval` only.

It must **not** be treated as:

- `Approved Baseline`;
- `Implementation Handoff`;
- authorization to generate implementation-specific decisions for unresolved items;
- authorization to close any `Open Decision` by inference.

### 22.2 Open Decisions Carried Forward

The following remain explicitly open in this candidate because the source itself leaves them open or outside the lock:

- exact activation trigger for a Men’s Health question where Section 17.1 says it has not been approved;
- any additional pregnancy-related contraindication or medical-suitability rule not stated in this package; the shared `Pregnancy Context` pathway availability itself is locked by Section 17.1;
- service-specific Clinical Story wording that does not change the locked section order in Section 7.3;
- detailed `Dual Perspective` field policies for any field beyond the initially approved visual-classification policy in Section 9.4;
- any other item explicitly marked `Open Decision` or outside the lock in this file.

No additional Open Decision is invented by 02.6B, and none of the above is resolved by 02.6B.

### 22.3 Approval Outcome Required

The next gate must record one of the following explicitly:

```text
APPROVE AS APPROVED BASELINE
APPROVE WITH SPECIFIED AMENDMENTS
REJECT / RETURN FOR REVISION
```

Until an explicit approval outcome is recorded, the authoritative status of this file remains:

```text
Baseline Candidate for Owner Approval
NOT Approved Baseline
NOT Implementation Handoff
```

### 22.4 Post-Approval Boundary

Only after explicit `Approved Baseline` status may a separate implementation-handoff step begin. That later step must reference the approved baseline version and preserve all Open Decisions as decision gates rather than converting them into code assumptions.
