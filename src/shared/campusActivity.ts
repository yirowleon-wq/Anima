/** School observations are distinct from local workouts and practice credits. */
export const CAMPUS_ACTIVITY_SOURCE_ID = 'campus:activity';

/** Public edition references, not cached thresholds or a personal progress source. */
export const CAMPUS_ACTIVITY_PUBLIC_RULE_REFERENCES = [
  { id: 'uci-academic-calendar-2026-27', title: 'UCI quarterly academic calendar 2026–27',
    url: 'https://www.reg.uci.edu/calendars/quarterly/2026-2027/quarterly26-27.html',
    revisedAt: '2026-10-29', checkedAt: '2026-11-01', scope: 'Public institutional calendar; no personal schedule or activity-credit rule' },
  { id: 'uci-academic-regulations-2026-27', title: 'UCI academic regulations 2026–27',
    url: 'https://catalogue.uci.edu/informationforadmittedstudents/academicregulationsandprocedures/',
    checkedAt: '2026-11-01', scope: 'Public academic reference; program and cohort rules require their own source' },
] as const;

/** IDs identify Anima’s local catalog, not university service endpoints. */
export const CAMPUS_ACTIVITY_MODULES = [
  { id: 1, resource: 'study_records', label: 'Learning records' },
  { id: 2, resource: 'exercise', label: 'Fitness activity' },
  { id: 3, resource: 'notices', label: 'Notices' },
  { id: 4, resource: 'teams', label: 'Teams' },
  { id: 5, resource: 'events', label: 'Events' },
  { id: 6, resource: 'counselling', label: 'Tutoring' },
  { id: 7, resource: 'counts', label: 'Progress' },
  { id: 8, resource: 'venues', label: 'Venues' },
  { id: 9, resource: 'fitness_attendance', label: 'Activity attendance' },
  { id: 10, resource: 'training', label: 'Workshops' },
  { id: 11, resource: 'fitness', label: 'Fitness measurements' },
  { id: 12, resource: 'competitions', label: 'Competitions' },
  { id: 13, resource: 'classes', label: 'Course attendance' },
  { id: 14, resource: 'venue_entries', label: 'Venue visits' },
  { id: 15, resource: 'feedback', label: 'Feedback' },
  { id: 16, resource: 'venue_live', label: 'Facility status' },
  { id: 17, resource: 'graduation_courses', label: 'Degree requirements' },
  { id: 18, resource: 'graduation_report', label: 'Milestones' },
  { id: 19, resource: 'external_fitness', label: 'External fitness' },
] as const;

export type CampusActivityModuleResource = (typeof CAMPUS_ACTIVITY_MODULES)[number]['resource'];
export type CampusActivityResource =
  | CampusActivityModuleResource
  | 'profile'
  | 'menus'
  | 'terms'
  | 'summary'
  | 'records'
  | 'record_detail'
  | 'statistics'
  | 'rules'
  | 'course_terms'
  | 'courses'
  | 'attendance';

export interface CampusActivityReadArgs {
  resource: CampusActivityResource;
  refresh?: boolean;
  /** Opaque saved observation; continuing it never changes to a newer response. */
  snapshotId?: string;
  offset?: number;
  limit?: number;
  /** Zero-based school page; distinct from continuing a saved response. */
  upstreamPage?: number;
  /** From the same mode's school venue directory, never an arbitrary ID. */
  venueSiteId?: string;
  /** Calendar date in the configured institutional time zone, not an instant or booking request. */
  searchDate?: string;
  pointer?: string;
  schoolYear?: string;
  termId?: string;
  recordId?: string;
  courseId?: string;
  begin?: number;
  end?: number;
  period?: 'WEEK' | 'MONTH' | 'TERM';
  validStatus?: -1 | 0 | 1;
  subpage?:
    | 'results'
    | 'schedule'
    | 'feedback'
    | 'records'
    | 'mine'
    | 'attendance'
    | 'orders'
    | 'buddies'
    | 'training'
    | 'reservation'
    | 'art_reservation'
    | 'certificates';
}

export interface CampusActivityConnectorState {
  sourceId: typeof CAMPUS_ACTIVITY_SOURCE_ID;
  label: string;
  configured: boolean;
  credentialsConfigured: boolean;
  sessionSaved: boolean;
  runtimeAvailable: boolean;
  signerConfigured: boolean;
  readAllowed?: boolean;
  campusReadAllowed?: boolean;
  reason?: string;
}

export interface CampusActivityObservation {
  sourceId: typeof CAMPUS_ACTIVITY_SOURCE_ID;
  resource: CampusActivityResource;
  status: 'fresh' | 'saved' | 'partial' | 'auth_required' | 'unavailable';
  fetchedAt?: string;
  observedAt: string;
  snapshotId?: string;
  /** Reader payloads use recordRead/personalRecordRead for an actual completed
   * personal query, including a school's explicit empty result. Existence is
   * expressed separately by readState, recordCount and the returned list.
   * Public catalogues/live counts and unread/denied queries keep both false. */
  data?: unknown;
  coverage: {
    complete: boolean;
    kind: 'records' | 'official_page' | 'catalog' | 'unknown';
    total?: number;
    returned?: number;
    offset?: number;
    next?: { snapshotId: string; offset: number; pointer?: string };
    upstreamPagination?: 'whole_response' | 'paged_response' | 'unknown';
    /** A new provider query, never a continuation within this saved response. */
    upstreamNext?: {
      resource: 'venues' | 'training' | 'counselling' | 'venue_entries';
      subpage?: 'orders' | 'training' | 'records';
      upstreamPage: number;
      termId?: string;
    };
    venueSelection?: {
      resource: 'venues';
      subpage: 'reservation' | 'art_reservation';
      directoryPointer: '/response/data' | '/directoryResponse/data';
      venueMapField: 'venueInfo';
      siteMapField: 'venueSiteInfo';
      idField: 'id';
      dateFormat: 'YYYY-MM-DD';
      timeZone: string;
    };
    extent?: 'returned_response';
    unit?: 'unicode_codepoints';
    navigationOnly?: boolean;
    /** JSON pointer within this immutable source response, never an API URL. */
    pointer?: string;
    /** The immutable source is the authenticated owner's venue profile. */
    profileRead?: boolean;
  };
  error?: { code: string; message: string; httpStatus?: number; diagnosticsSaved?: boolean };
  note?: string;
}
