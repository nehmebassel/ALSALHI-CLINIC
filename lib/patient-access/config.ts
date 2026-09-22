export const PATIENT_SESSION_WARNING_MINUTES = 5;
export const PATIENT_SESSION_LOCK_MINUTES = 7;
export const PATIENT_SESSION_EXPIRY_MINUTES = 30;
export const TERMINAL_DRAFT_PURGE_HOURS = 24;

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface PatientSessionDeadlines {
  warningAt: Date;
  lockAt: Date;
  expiresAt: Date;
}

export function getPatientSessionDeadlines(
  lastActivityAt: Date,
): PatientSessionDeadlines {
  return {
    warningAt: new Date(
      lastActivityAt.getTime() +
        PATIENT_SESSION_WARNING_MINUTES * MILLISECONDS_PER_MINUTE,
    ),
    lockAt: new Date(
      lastActivityAt.getTime() +
        PATIENT_SESSION_LOCK_MINUTES * MILLISECONDS_PER_MINUTE,
    ),
    expiresAt: new Date(
      lastActivityAt.getTime() +
        PATIENT_SESSION_EXPIRY_MINUTES * MILLISECONDS_PER_MINUTE,
    ),
  };
}

export function getTerminalDraftPurgeAfter(terminalAt: Date): Date {
  return new Date(
    terminalAt.getTime() +
      TERMINAL_DRAFT_PURGE_HOURS * MILLISECONDS_PER_HOUR,
  );
}
