export const EXPECTED_MODEL_BASELINE = Object.freeze({
  bytes: 22_671_680,
  sha256: 'D6D78C9BD1BD9C7CA87A07509A2E7B6585995FCBDEC054F297167BA7C15CD878',
  nodes: 301,
  meshes: 176,
  materials: 58,
})

const role = (names) => Object.freeze(names)

/** Every authored GLB material belongs to exactly one rendering responsibility. */
export const MATERIAL_ROLES = Object.freeze({
  paint: role(['primary']),
  glass: role(['glass.0', 'glass.1']),
  interior: role([
    'movsteer_1.0.0',
    'belt.0',
    'Putih.0',
    'Carpet.0',
    'Carpet_Light.0',
    'texture_Buttons.0',
    'Seat_Leather_white.0',
    'door_lf.0',
    'door_lf.5',
  ]),
  lampShell: role([
    'black_lights.0',
    'back_chrome_light.0',
    'aluminium_light.0',
    'aluminium2.0',
  ]),
  controlledEmitter: role([
    'right_rear_light',
    'breaklight_l',
    'foglight_r',
    'foglight_l',
    'right_front_light',
    'left_front_light',
    'left_rear_light',
    'revlight_L',
  ]),
  passiveReflector: role([
    'pantulans.0',
    'tembus_red.0',
    'light_night',
    'indicator_lf',
    'indicator_rf',
    'satin_red.0',
    'indicator_rr',
    'indicator_lr',
    'light_pantulan.0',
  ]),
  metal: role([
    'movsteer_1.0.1',
    'chassis.0',
    'suspensi.0',
    'suspensi.1',
    'mirror_inside.0',
    'wheels.0',
  ]),
  rim: role(['hub_rb.0', 'hub_rf.0', 'hub_rf.1', 'wheels.4', 'wheels.6']),
  tyre: role(['wheels.2', 'wheels.3']),
  blackPlastic: role([
    'dvorright.0',
    'JUST_BLACK.0',
    'hitam.0',
    'Plastic.0',
    'primary.004',
    'front_black.0',
    'wheels.1',
  ]),
  screen: role(['LCDs.0']),
  preserve: role(['primary.001', 'platnomor.1', 'platnomor.2', 'primary.002']),
})

const ROLE_ENTRIES = Object.entries(MATERIAL_ROLES)
  .flatMap(([roleName, names]) => names.map((name) => [name, roleName]))

const ROLE_BY_MATERIAL = new Map(
  ROLE_ENTRIES,
)

export function materialRoleEntries() {
  return ROLE_ENTRIES.map((entry) => [...entry])
}

export function getMaterialRole(name) {
  return ROLE_BY_MATERIAL.get(name) ?? null
}
