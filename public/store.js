const KEY = 'codecoach-prototype-v1';
export function newParticipant() {
  return { id: crypto.randomUUID(), createdAt: Date.now(), progress: {}, events: [], feedback: null };
}
export function loadState(storage) {
  try {
    const state = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY));
    if (state?.version === 1 && Array.isArray(state.participants) && state.participants.length && state.participants.every(p => p && typeof p.id === 'string' && p.progress && typeof p.progress === 'object' && !Array.isArray(p.progress) && Array.isArray(p.events)) && state.participants.some(p => p.id === state.currentId)) return state;
  } catch { /* Private browsing or invalid data: start a fresh in-memory session. */ }
  const participant = newParticipant();
  return { version: 1, currentId: participant.id, participants: [participant] };
}
export function saveState(state, storage) {
  try { (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function getProgress(participant, task) {
  return participant.progress[task.id] ||= { code: task.starter, attempts: 0, hints: 0, hintHistory: [], solved: false, xp: 0, result: null, startedAt: null, solvedAt: null };
}
export function usedHelpLevel(progress) {
  return Math.max(progress.hints ?? 0, progress.chatHelpLevel ?? 0);
}
export function recordResult(progress, result, now = Date.now(), helpLevel = usedHelpLevel(progress)) {
  progress.attempts++;
  progress.result = result;
  const firstSolve = !progress.solved && result.total > 0 && result.passed === result.total;
  if (firstSolve) {
    progress.solved = true;
    progress.solvedAt = now;
    progress.hintsAtSolve = helpLevel;
    progress.attemptsAtSolve = progress.attempts;
  }
  return firstSolve;
}
