export async function supervisorAgent(state) {
  const missing = [];
  if (!state.estimation) missing.push('estimation');
  if (!state.decomposition) missing.push('decomposition');
  if (!state.code) missing.push('coding');
  if (!state.tests) missing.push('testing');
  if (!state.git) missing.push('git');

  // Fix: ensure logs is always an array
  const logs = Array.isArray(state.logs) ? state.logs : [];
  return { ...state, logs: [...logs, `supervisor:routing:${missing.join(',')}`] };
}
