export interface SpeechAct {
  startCodePoint: number;
  endCodePoint: number;
  subjectId: string;
  worldId: string;
  kind: 'assert' | 'correct' | 'hypothesize' | 'ask' | 'propose' | 'accept' | 'reject' | 'revoke' | 'quote';
  route: 'policy_restriction' | 'scenario' | 'memory_candidate' | 'work_state' | 'no_change';
  scope: 'turn' | 'episode' | 'long_term';
  ambiguous: boolean;
}
