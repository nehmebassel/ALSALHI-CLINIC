export type PhysicianLocalizedText = {
  ar: string;
  en: string;
};

export type PhysicianPresentationAuditSignal = {
  code: "MISSING_STRUCTURED_LABEL";
  questionCode: string;
  fieldPath: string;
};

export type PhysicianDiagnosisSummary = {
  ar: string;
  en: string;
};

export type PhysicianQueueEpisode = {
  id: string;
  primary: PhysicianLocalizedText;
  status: "ACTIVE" | "CLOSED";
  visitCount: number;
  pendingCount: number;
  lastVisitAt: string;
};

export type PhysicianQueuePatient = {
  patientId: string;
  name: string;
  mrn: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
  latestAt: string;
  latestVisitType: "INITIAL" | "FOLLOW_UP";
  totalVisits: number;
  pendingCount: number;
  latestHairHistoryApproved: boolean;
  activeEpisodeCount: number;
  latestDiagnosis?: PhysicianDiagnosisSummary;
  episodes: PhysicianQueueEpisode[];
};

export type PhysicianQueueSummary = {
  patients: number;
  pendingInterviews: number;
  followUpsPending: number;
  activeEpisodes: number;
};

export type PhysicianQuestionOption = {
  code: string;
  ar: string;
  en: string;
};

export type PhysicianInterviewQuestion = {
  id: string;
  responseId?: string;
  code: string;
  text: PhysicianLocalizedText;
  help?: PhysicianLocalizedText;
  library: PhysicianLocalizedText;
  group: PhysicianLocalizedText;
  responseType: string;
  responseScopeType: string;
  responseScopeKey: string;
  currentSource: "PATIENT" | "PHYSICIAN";
  value: unknown;
  repeatableItems: unknown[];
  options: PhysicianQuestionOption[];
  editableByPhysician: boolean;
};


export type PhysicianClinicalStoryTimeframe = "CURRENT" | "BASELINE" | "PRIOR_FOLLOW_UP" | "CURRENT_FOLLOW_UP";

export type PhysicianClinicalStorySourceRef = {
  actor: "PATIENT" | "PHYSICIAN" | "SYSTEM";
  questionIds: string[];
  visitId?: string;
  recordedAt?: string;
};

export type PhysicianClinicalStoryEntry = {
  id: string;
  values: PhysicianLocalizedText[];
  valueType: "STRUCTURED" | "MEASURE" | "FREE_TEXT" | "RECORD";
  patientAuthored: boolean;
};

export type PhysicianClinicalStoryItem = {
  id: string;
  label: PhysicianLocalizedText;
  entries: PhysicianClinicalStoryEntry[];
  timeframe: PhysicianClinicalStoryTimeframe;
  sourceRefs: PhysicianClinicalStorySourceRef[];
};

export type PhysicianClinicalStoryGroup = {
  id: string;
  title: PhysicianLocalizedText;
  items: PhysicianClinicalStoryItem[];
};

export type PhysicianClinicalStorySection = {
  code:
    | "VISIT_REASON"
    | "HEALTH_SNAPSHOT"
    | "HAIR_LOSS"
    | "SCALP"
    | "SHARED_HISTORY"
    | "COURSE_IMPACT"
    | "LIFESTYLE_NUTRITION"
    | "WOMENS_HEALTH"
    | "MENS_HEALTH"
    | "PREGNANCY_CONTEXT"
    | "HAIR_QUALITY"
    | "DERMATOLOGY"
    | "LASER"
    | "AESTHETIC_PROCEDURES"
    | "FOLLOW_UP_CHANGE"
    ;
  title: PhysicianLocalizedText;
  description: PhysicianLocalizedText;
  groups: PhysicianClinicalStoryGroup[];
};

export type PhysicianCaseSummary = {
  reviewStatus: "UNDER_REVIEW" | "COMPLETED";
  visitType?: "INITIAL" | "FOLLOW_UP";
  visitReason?: PhysicianLocalizedText;
  additionalReasons: PhysicianLocalizedText[];
  currentConcern: PhysicianLocalizedText[];
  mainConcern: PhysicianLocalizedText[];
  problemOnset: PhysicianLocalizedText[];
  importantContext: Array<{
    code:
      | "MARITAL_SOCIAL_STATUS"
      | "CONTRACEPTIVE_USE"
      | "PREGNANCY_BREASTFEEDING_CONTEXT"
      | "PREVIOUSLY_DIAGNOSED_CONDITIONS"
      | "CURRENT_MEDICATIONS"
      | "ALLERGIES"
      | "PREVIOUS_HAIR_THERAPIES"
      | "CURRENT_HAIR_THERAPIES";
    label: PhysicianLocalizedText;
    values: PhysicianLocalizedText[];
  }>;
  needsAttention: PhysicianLocalizedText[];
  latestDiagnosis?: PhysicianLocalizedText;
  patientReportedMeasures: Array<{
    code: string;
    label: PhysicianLocalizedText;
    value: number;
    date?: string;
    source: "PATIENT";
    modifiedByPhysician: boolean;
  }>;
  physicianMeasures: Array<{ code: string; label: PhysicianLocalizedText; value: number; date: string; source: "PHYSICIAN" }>;
  historyStatus: "NOT_APPLICABLE" | "PENDING" | "APPROVED";
  physicianJourneyStatus: "NOT_APPLICABLE" | "NOT_STARTED" | "STARTED";
  lastPhysicianVisit?: string;
};

export type PhysicianFollowUpFact = {
  id: string;
  label: PhysicianLocalizedText;
  values: PhysicianLocalizedText[];
  sourceVisitId?: string;
  sourceVisitAt?: string;
};

export type PhysicianFollowUpSection = {
  code: string;
  title: PhysicianLocalizedText;
  facts: PhysicianFollowUpFact[];
};

export type PhysicianVisitSummary = {
  id: string;
  createdAt: string;
  visitOccurredAt?: string;
  completedAt?: string;
  visitType: "INITIAL" | "FOLLOW_UP";
  visitStatus: "CREATED" | "COMPLETED" | "CANCELLED";
  interviewId: string;
  interviewStatus: "UNDER_REVIEW" | "COMPLETED";
  patientReviewState?: "PENDING" | "HAIR_HISTORY_APPROVED" | "COMPLETED";
  physicianRecordStatus?: "DRAFT" | "FINALIZED";
  primaryCode?: string;
  primary: PhysicianLocalizedText;
  additionalCodes?: string[];
  additional: PhysicianLocalizedText[];
  episodeId?: string;
  diagnosis?: PhysicianDiagnosisSummary;
  hasFollowUpDelta: boolean;
};

export type PhysicianEpisodeDetail = {
  id: string;
  primary: PhysicianLocalizedText;
  status: "ACTIVE" | "CLOSED";
  openedAt: string;
  closedAt?: string;
  visits: PhysicianVisitSummary[];
};

export type PhysicianMeasurementPoint = {
  visitId: string;
  date: string;
  value: number;
};

export type PhysicianMeasurementSeries = {
  code: string;
  label: PhysicianLocalizedText;
  points: PhysicianMeasurementPoint[];
};

export type PhysicianTimelineItem = {
  id: string;
  type: "MEDICATION" | "PROCEDURE" | "LAB" | "DIAGNOSIS" | "TRIGGER" | "OTHER";
  visitId: string;
  date?: string;
  datePrecision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
  title?: PhysicianLocalizedText;
  description?: PhysicianLocalizedText;
};



export type PhysicianJourneyVisitReference = {
  visitId: string;
  episodeId: string;
  visitOccurredAt: string;
  visitType: "INITIAL" | "FOLLOW_UP";
  pattern?: {
    sinclair?: number;
    mcuFvCode?: string;
    hairLineMidlineCm?: number;
    hairLineRightSideCm?: number;
    hairLineLeftSideCm?: number;
  };
  trichoscopy?: {
    findingCodes: string[];
    findingLabels: string[];
    otherFindingText?: string;
  };
  anatomicalMap?: {
    regionCount: number;
    views: Array<{ view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE"; regionCount: number }>;
    regions: Array<{ view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE"; label: PhysicianLocalizedText; noteText?: string }>;
  };
};

export type PhysicianHairJourneyEpisode = {
  episodeId: string;
  primary: PhysicianLocalizedText;
  status: "ACTIVE" | "CLOSED";
  effectiveState: {
    diagnoses: Array<{ diagnosisId: string; text: string; status: "ACTIVE" | "RESOLVED" }>;
    treatmentCourses: Array<{ treatmentCourseId: string; name: string; regimenText?: string; noteText?: string; status: "ACTIVE" | "STOPPED" }>;
    procedurePlans: Array<{ procedurePlanId: string; procedureCode: string; otherProcedureText?: string; plannedDate?: string; noteText?: string; status: "OPEN" | "FULFILLED" | "CANCELLED_OR_DEFERRED" }>;
    performedProcedures: Array<{ procedureDecisionId: string; procedurePlanId?: string; procedureCode: string; otherProcedureText?: string; performedDate: string; noteText?: string; visitId: string }>;
  };
  measurementSeries: PhysicianMeasurementSeries[];
  timeline: PhysicianTimelineItem[];
  visits: PhysicianJourneyVisitReference[];
};

export type PhysicianHairHistoryLayer =
  | "MEASURES"
  | "SYMPTOMS"
  | "TREATMENTS"
  | "PROCEDURES"
  | "TRIGGERS"
  | "DIAGNOSES"
  | "TESTS_LABS"
  | "PHOTOS";

export type PhysicianHairHistoryItem = {
  id: string;
  layer: PhysicianHairHistoryLayer;
  itemType: string;
  label: PhysicianLocalizedText;
  value: unknown;
  date?: string;
  datePrecision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
  source: "PATIENT" | "PHYSICIAN";
  included: boolean;
  editable: boolean;
  sourceQuestionCode?: string;
  sourceScopeKey?: string;
  sourceResponseId?: string;
  sourceItemIndex?: number;
};

export type PhysicianHairHistory = {
  status: "PATIENT_REPORTED_PREVIEW" | "REVIEWED_DRAFT" | "AMENDMENT_DRAFT" | "APPROVED_READ_ONLY";
  sourceVisitId?: string;
  sourceVisitAt?: string;
  clinicalReferenceAt: string;
  baseRevision: number;
  approvedRevision?: number;
  approvedAt?: string;
  lastEditedAt?: string;
  items: PhysicianHairHistoryItem[];
};

export type PhysicianPatientWorkspaceData = {
  capabilities: {
    hairHistory: boolean;
    physicianHairJourney: boolean;
  };
  patient: {
    id: string;
    name: string;
    mrn: string;
    gender: "MALE" | "FEMALE";
    dateOfBirth: string;
    maritalStatus: "MARRIED" | "NOT_MARRIED";
  };
  summary: {
    totalVisits: number;
    pendingCount: number;
    activeEpisodeCount: number;
    latestVisitAt?: string;
    latestDiagnosis?: PhysicianDiagnosisSummary;
  };
  reviewVisit?: PhysicianVisitSummary;
  initialVisit?: PhysicianVisitSummary;
  initialQuestions: PhysicianInterviewQuestion[];
  reviewQuestions: PhysicianInterviewQuestion[];
  followUpSections: PhysicianFollowUpSection[];
  caseSummary: PhysicianCaseSummary;
  clinicalStorySummary: PhysicianLocalizedText[];
  clinicalStory: PhysicianClinicalStorySection[];
  episodes: PhysicianEpisodeDetail[];
  measurementSeries: PhysicianMeasurementSeries[];
  timeline: PhysicianTimelineItem[];
  physicianHairJourney: PhysicianHairJourneyEpisode[];
  hairHistory: PhysicianHairHistory;
  approvedHairHistory: {
    approvedAt: string;
    itemCount: number;
  } | null;
  presentationAuditSignals: PhysicianPresentationAuditSignal[];
};
