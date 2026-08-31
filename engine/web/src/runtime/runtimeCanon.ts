import type { RuntimeCanon } from './types'

export const runtimeCanon: RuntimeCanon = {
  vehicles: {
    family_car: { owner_id: 'player_family' },
  },
  bases: {
    urban_apartment: { owner_id: 'player_family', capabilities: ['urban_living'] },
    outer_house: {
      owner_id: 'player_family',
      capabilities: ['solar', 'battery', 'lpg', 'water_storage', 'food_storage', 'tools', 'cctv', 'access_control'],
    },
  },
}
