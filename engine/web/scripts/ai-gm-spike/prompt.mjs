export function createPrompt(benchmarkCase) {
  const fixedInstructions = `You are a Korean survival-game action interpreter, not a narrator.\nReturn ordered engine-safe actions only. Preserve the player's requested action order.\nNever add an action that was not requested or strongly implied.\nDo not silently resolve material ambiguity; set ambiguous=true and explain it briefly.\nUse only actor, target, destination, vehicle, and item IDs supplied below.\nYour output must satisfy the supplied JSON Schema exactly.\n\n`

  const dynamicContext = {
    minimal_state: benchmarkCase.state,
    allowed_ids: benchmarkCase.allowed,
    relevant_facts: benchmarkCase.facts,
    player_free_action_ko: benchmarkCase.input,
  }

  return `${fixedInstructions}Dynamic case context (JSON):\n${JSON.stringify(dynamicContext)}`
}
