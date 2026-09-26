/**
 * Public-only selection from the Canon v2 S01 → S02 handoff.
 *
 * Keep this file free of hidden-seed, scene, location, vehicle, and disaster
 * fields: it is shipped to the browser. canonV2Runtime.test.ts checks these
 * values against the authoritative structured Canon documents.
 */
export const canonV2PublicSource = {
  timelineId: 'canon_v2',
  seasonId: 'S02',
  previousSeasonId: 'S01',
  previousSeasonComplete: true,
  family: [
    { id: 'player', name: '한준호', relation: '본인', age: 41, role: '가족의 주 플레이어 / 판단·자원·외부 대응' },
    { id: 'wife', name: '서윤', relation: '아내', age: 39, role: '공동 의사결정자 / 생활 지속성·가족 안전' },
    { id: 'son', name: '민석', relation: '아들', age: 15, role: '중학생 / 정보·기술 적응·독립성 성장' },
    { id: 'father', name: '정호', relation: '아버지', age: 68, role: '외곽 생활·지역 경험·생활기술' },
  ],
  bases: [
    { id: 'city_apartment', role: 'primary_home', status: 'maintained', capabilities: [] },
    { id: 'outer_house', role: 'father_home_and_family_secondary_base', status: 'maintain_not_expand_aggressively', capabilities: ['some_food_production', 'water_buffer', 'power_buffer', 'storage_and_living_support'] },
    { id: 'b2_route', role: 'third_escape_option_information', status: 'information_only_no_fixed_property_or_equipment', capabilities: [] },
  ],
  preparedness: [
    ['vehicle_emergency_cache', 'reduced_but_maintained'],
    ['household_stockpile', 'medium_rotating_stock'],
    ['emergency_cash', 'maintained_at_limited_level'],
    ['family_reunion_rules', 'permanent_core_rules'],
    ['situation_board', 'inactive_in_normal_times_reactivate_in_emergency'],
  ],
  seasonFlags: ['family_independent_decisions', 'simultaneous_pressures', 's01_assets_remain_valid', 's01_assets_are_not_automatic_solution'],
} as const
