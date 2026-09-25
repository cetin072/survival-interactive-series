/**
 * Publication-only editorial decisions.  RAW is never edited: these entries
 * only select contiguous GM prose ranges and name the resulting chapters.
 */
const c01 = (number) => `seasons_v2/${number === 10 ? 'S02' : 'S01'}/raw_transcript/PART_${String(number === 10 ? 1 : number).padStart(3, '0')}.md`
const c02 = (session, number) => `archive/content/transcripts/C02-STRONGHOLD/SESSIONS/${session}/PART_${String(number).padStart(3, '0')}.md`
const c03s1 = (number) => `archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_${String(number).padStart(3, '0')}.md`
const c03s2 = (session, number) => `archive/content/transcripts/C03-AFTERFALL/S02/${session}/PART_${String(number).padStart(3, '0')}.md`
const source = (path, range = {}) => ({ path, ...range })

export const editorialOverrides = {
  // These files are entirely out-of-story retrospective/design/archive reports.
  exclude: {
    [c02('SESSION_20260925_CURRENT_ROOM', 2)]: 'design_feedback_only',
    [c02('SESSION_20260925_CURRENT_ROOM', 3)]: 'operational_meta_only',
    [c02('SESSION_20260925_CURRENT_ROOM', 4)]: 'operational_meta_only',
    [c03s1(6)]: 'design_retro_only',
    [c03s1(7)]: 'design_plan_only',
    [c03s1(8)]: 'operational_meta_only',
    [c03s1(9)]: 'operational_meta_only',
    [c03s1(10)]: 'operational_meta_only',
  },
  // Keep the verified scene before the explicit end-of-arc save report.
  trimAfter: {
    [c02('SESSION_C02_20260925_ROOM_01', 4)]: '# 이번 아크 종료',
  },
  trimBefore: {
    // Four GM blocks of explicit bug-discussion precede this verified scene.
    [c03s2('SESSION_001', 2)]: '## 2026년 11월 22일 16:31',
  },
}

const c01Chapter = (number, title) => ({ title, seasonId: number === 10 ? 'S02' : 'S01', arcLabel: number === 10 ? '두 번째 계절' : '붉은 하늘', dateLabel: number === 10 ? 'S02' : 'S01', sources: [source(c01(number))], relatedNodeIds: [] })

export const editorialPlan = {
  'C01-HAN-JUNHO': [
    c01Chapter(1, '붉은 하늘'), c01Chapter(2, '남쪽으로 가는 밤'), c01Chapter(3, '체육관의 밤'),
    c01Chapter(4, '돌아갈 곳'), c01Chapter(5, '두 번째 거점'), c01Chapter(6, '남쪽 생활권'),
    c01Chapter(7, '가까운 임시거점'), c01Chapter(8, '외곽주택의 불빛'), c01Chapter(9, '생활서비스의 시작'),
    c01Chapter(10, '도심 아파트'),
  ],
  'C02-STRONGHOLD': [
    { title: '사라진 번호판', partId: 'PART I', arcLabel: '산불장', dateLabel: 'PART I', sources: [source(c02('SESSION_2031_02_TO_2031_03_ROOM_20260925', 1)), source(c02('SESSION_2031_02_TO_2031_03_ROOM_20260925', 2))], relatedNodeIds: [] },
    { title: '마산의 야적장', partId: 'PART I', arcLabel: '산불장', dateLabel: 'PART I', sources: [source(c02('SESSION_2031_02_TO_2031_03_ROOM_20260925', 5))], relatedNodeIds: [] },
    { title: '산불 이후', partId: 'PART II', arcLabel: '재편의 계절', dateLabel: 'PART II', sources: [source(c02('SESSION_20260925_CURRENT_ROOM', 1))], relatedNodeIds: [] },
    { title: '도시 외곽', partId: 'PART II', arcLabel: '재편의 계절', dateLabel: 'PART II', sources: [source(c02('SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925', 1))], relatedNodeIds: [] },
    { title: '다시 짓는 거점', partId: 'PART III', arcLabel: '거점의 확장', dateLabel: 'PART III', sources: [source(c02('SESSION_C02_20260925_ROOM_01', 1))], relatedNodeIds: [] },
    { title: '투자와 확장', partId: 'PART III', arcLabel: '거점의 확장', dateLabel: 'PART III', sources: [source(c02('SESSION_C02_20260925_ROOM_01', 2))], relatedNodeIds: [] },
    { title: '북서권의 약속', partId: 'PART III', arcLabel: '거점의 확장', dateLabel: 'PART III', sources: [source(c02('SESSION_C02_20260925_ROOM_01', 3)), source(c02('SESSION_C02_20260925_ROOM_01', 4))], relatedNodeIds: [] },
    { title: '아래 거점', partId: 'PART IV', arcLabel: '야간의 기록', dateLabel: 'PART IV', sources: [source(c02('SESSION_20260925_2039_CURRENT_ROOM', 1))], relatedNodeIds: [] },
    { title: '겨울의 야간', partId: 'PART IV', arcLabel: '야간의 기록', dateLabel: 'PART IV', sources: [source(c02('SESSION_20260925_2039_CURRENT_ROOM', 2))], relatedNodeIds: [] },
    { title: '봄의 경계', partId: 'PART IV', arcLabel: '야간의 기록', dateLabel: 'PART IV', sources: [source(c02('SESSION_20260925_2039_CURRENT_ROOM', 3))], relatedNodeIds: [] },
    { title: '여름 이후', partId: 'PART IV', arcLabel: '야간의 기록', dateLabel: 'PART IV', sources: [source(c02('SESSION_20260925_2039_CURRENT_ROOM', 4))], relatedNodeIds: [] },
  ],
  'C03-AFTERFALL': [
    { title: '두 번째 거점', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(1))], relatedNodeIds: ['char-jinwoo', 'loc-nw-center', 'loc-agri'] },
    { title: '정식 연합체', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(2), { before: '## 11월 2일 08:05' })], relatedNodeIds: ['char-jinwoo', 'loc-agri'] },
    { title: '폐쇄된 체육시설', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(2), { from: '## 11월 2일 08:05' })], relatedNodeIds: ['char-jinwoo', 'loc-contact'] },
    { title: '북쪽 의원', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(3), { before: '## 11월 8일 11:40' })], relatedNodeIds: ['char-jinwoo', 'loc-clinic'] },
    { title: '산림교육원', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(3), { from: '## 11월 8일 11:40' })], relatedNodeIds: ['char-jinwoo', 'loc-forest'] },
    { title: '백운생활관', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(4), { before: '# 11월 16일 15:30' })], relatedNodeIds: ['char-jinwoo', 'loc-baekun'] },
    { title: '교환지의 사람들', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(4), { from: '# 11월 16일 15:30' })], relatedNodeIds: ['char-jinwoo', 'loc-contact', 'loc-clinic'] },
    { title: '겨울 전 갈무리', seasonId: 'S01', arcLabel: '두 거점과 외곽', dateLabel: 'S01', sources: [source(c03s1(5))], relatedNodeIds: ['char-jinwoo', 'loc-nw-center'] },
    { title: '서쪽 화재선', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_001', 1))], relatedNodeIds: ['char-jinwoo', 'char-taehoon', 'event-fireline'] },
    { title: '실증단지의 불', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_001', 2), { from: '## 2026년 11월 22일 16:31' })], relatedNodeIds: ['char-jinwoo', 'char-taehoon', 'loc-agri', 'event-fireline'] },
    { title: '야간 감시', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_001', 3))], relatedNodeIds: ['char-jinwoo', 'char-taehoon', 'event-fireline'] },
    { title: '불이 지나간 자리', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_001', 4))], relatedNodeIds: ['char-jinwoo', 'char-taehoon', 'event-fireline'] },
    { title: '첫겨울의 아침', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_002', 1))], relatedNodeIds: ['char-jinwoo', 'event-winter-council'] },
    { title: '공공대피시설', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_002', 2))], relatedNodeIds: ['char-jinwoo', 'char-hajin', 'loc-shelter', 'event-shelter'] },
    { title: '일곱 명의 원칙', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_002', 3))], relatedNodeIds: ['char-jinwoo', 'loc-nw-center'] },
    { title: '외곽 주민복지관', seasonId: 'S02', arcLabel: '화재선과 첫겨울', dateLabel: 'S02', sources: [source(c03s2('SESSION_002', 4))], relatedNodeIds: ['char-jinwoo', 'char-hajin', 'char-hayoung', 'char-yujin', 'loc-shelter'] },
  ],
}
