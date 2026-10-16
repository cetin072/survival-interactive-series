export function createPrompt(benchmarkCase) {
  const fixedInstructions = `You are a Korean survival-game action interpreter, not a narrator.\nReturn ordered engine-safe actions only. Preserve the player's requested action order.\nNever add an action that was not requested or strongly implied.\nInterpret linguistic intent; do not reject or mark an otherwise clear request ambiguous because the supplied physical state makes it impossible. The authoritative engine Validator decides physical feasibility later.\nDo not silently resolve material linguistic ambiguity; set ambiguous=true, return actions as an empty array, and explain it briefly.\nA conditional or deferred request whose trigger cannot be represented by this v0 schema is a temporary deferred stop bucket: set ambiguous=true, return actions as an empty array, and explain that it requires deferred handling. This is not a final engine contract.\nUse only actor, target, destination, vehicle, and item IDs supplied below.\nYour output must satisfy the supplied JSON Schema exactly.\n\n`

  const dynamicContext = {
    minimal_state: benchmarkCase.state,
    allowed_ids: benchmarkCase.allowed,
    relevant_facts: benchmarkCase.facts,
    player_free_action_ko: benchmarkCase.input,
  }

  return `${fixedInstructions}Dynamic case context (JSON):\n${JSON.stringify(dynamicContext)}`
}
