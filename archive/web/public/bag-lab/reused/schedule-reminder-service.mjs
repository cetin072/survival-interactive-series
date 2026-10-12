// Adapted from cetin072/worklog-voice-pwa @23d525b29aa5cbad983f6934a7f41140689c5487.
// Only namespace/brand substitutions; scheduling state machine is unchanged.
/** Durable notification state machine. One owner per device-state namespace/JS runtime.
 * OS side effects are journalled BEFORE execution; SecureStore and the OS are not
 * a transaction. Recovery converges an interrupted operation, never infers success.
 */
export const REMINDER_STATE_KEY = 'bag-side.mobile.schedule-notifications.v3';
const V2 = 'bag-side.mobile.schedule-notifications.v2';
const V1 = 'bag-side.mobile.schedule-notifications.v1';
const CLEANUP_V1 = 'bag-side.mobile.pending-notification-cleanup.v1';
export const REMINDER_OWNER = 'bag-side.schedule-reminder.v3';
export const REMINDER_OFFSETS = [0, 5, 10, 30, 60, 1440]         ;
                                                                      
                                                                                                               
                                                                 
                                                                                                                  
                                                                                                                           
                                        
                     
                                                                           
  
                                                                                                                                         
                
                                               
                                                                                                 
  
                              
                                              
                                                                            
                                            
                                                 
  
export class ReminderStateError extends Error {
  constructor(code        ) { super(`알림 기록을 확인하지 못했습니다. 추가 변경을 중단했습니다. (${code})`); }
}
function record(value         )                                   { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function id(value         )                  {
  return typeof value === 'string' && value.length > 0 && value.length <= 300 && !['__proto__', 'prototype', 'constructor'].includes(value);
}
function offset(value         )                                 { return REMINDER_OFFSETS.includes(value                         ); }
function json(raw        )          { try { return JSON.parse(raw); } catch { throw new ReminderStateError('INVALID_JSON'); } }
function reminder(value         )                   {
  if (!record(value) || !id(value.identifier) || typeof value.title !== 'string' || !offset(value.offsetMinutes)
    || typeof value.triggerAt !== 'string' || !Number.isFinite(new Date(value.triggerAt).getTime())) throw new ReminderStateError('INVALID_REMINDER');
  return { identifier: value.identifier, title: value.title, offsetMinutes: value.offsetMinutes, triggerAt: value.triggerAt };
}
function mappings(value         )           {
  if (!record(value)) throw new ReminderStateError('INVALID_MAPPING');
  return Object.fromEntries(Object.entries(value).map(([sid, entries]) => {
    if (!id(sid) || !record(entries)) throw new ReminderStateError('INVALID_SCHEDULE');
    return [sid, Object.fromEntries(Object.entries(entries).map(([key, item]) => {
      const parsed = reminder(item);
      if (key !== String(parsed.offsetMinutes)) throw new ReminderStateError('INVALID_OFFSET');
      return [key, parsed];
    }))];
  }));
}
function cleanup(value         )                           {
  if (!record(value)) throw new ReminderStateError('INVALID_CLEANUP');
  return Object.fromEntries(Object.entries(value).map(([sid, ids]) => {
    if (!id(sid) || !Array.isArray(ids) || !ids.every(id)) throw new ReminderStateError('INVALID_CLEANUP');
    return [sid, [...new Set(ids)]];
  }));
}
const slot = (sid        , minutes        ) => JSON.stringify([sid, minutes]);
function parseState(raw        )        {
  const value = json(raw);
  if (!record(value) || value.version !== 3 || !record(value.intents)) throw new ReminderStateError('INVALID_STATE');
  const intents                         = Object.fromEntries(Object.entries(value.intents).map(([key, item]) => {
    if (!record(item) || !id(item.scheduleId) || !offset(item.offsetMinutes) || !Array.isArray(item.obsolete) || !item.obsolete.every(id)
      || key !== slot(item.scheduleId, item.offsetMinutes)) throw new ReminderStateError('INVALID_INTENT');
    const desired = item.desired === null ? null : reminder(item.desired);
    if (desired && (desired.offsetMinutes !== item.offsetMinutes || item.obsolete.includes(desired.identifier))) throw new ReminderStateError('UNSAFE_INTENT');
    return [key, { scheduleId: item.scheduleId, offsetMinutes: item.offsetMinutes, desired, obsolete: [...new Set(item.obsolete)] }];
  }));
  const state        = { version: 3, reminders: mappings(value.reminders), intents, legacyCleanup: cleanup(value.legacyCleanup) };
  const owned = Object.values(state.reminders).flatMap(Object.values).map((r) => r.identifier);
  if (new Set(owned).size !== owned.length) throw new ReminderStateError('DUPLICATE_MAPPING_ID');
  return state;
}
export function reminderTriggerAt(startsAt               , minutes        ) {
  return new Date(new Date(startsAt).getTime() - minutes * 60_000);
}

export function createScheduleReminderService(deps                                                                               ) {
  const now = deps.now || Date.now;
  // Serializes the WHOLE OS + read/modify/write operation, not only the final write.
  let tail                   = Promise.resolve();
  function serial   (run                  )             {
    const task = tail.then(run); tail = task.catch(() => undefined); return task;
  }
  async function read()                 {
    const raw = await deps.storage.getItem(REMINDER_STATE_KEY);
    if (raw !== null) return parseState(raw); // Corruption must never become an empty mapping.
    const v2 = await deps.storage.getItem(V2);
    let reminders          ;
    if (v2 !== null) reminders = mappings(json(v2));
    else {
      const v1 = await deps.storage.getItem(V1);
      const legacy = v1 === null ? {} : json(v1);
      if (!record(legacy)) throw new ReminderStateError('INVALID_LEGACY');
      reminders = mappings(Object.fromEntries(Object.entries(legacy).map(([sid, item]) => {
        if (!record(item)) throw new ReminderStateError('INVALID_LEGACY');
        return [sid, { '0': { ...item, offsetMinutes: 0 } }];
      })));
    }
    const rawCleanup = await deps.storage.getItem(CLEANUP_V1);
    const initial        = { version: 3, reminders, intents: {}, legacyCleanup: rawCleanup === null ? {} : cleanup(json(rawCleanup)) };
    // Commit migration before using it; retain legacy keys, never fall back after v3 exists.
    const committed = await deps.storage.updateItem(REMINDER_STATE_KEY, (current) => current ?? JSON.stringify(initial));
    if (committed === null) throw new ReminderStateError('MIGRATION_FAILED');
    return parseState(committed);
  }
  async function change(update                        ) {
    await read();
    await deps.storage.updateItem(REMINDER_STATE_KEY, (raw) => {
      if (raw === null) throw new ReminderStateError('STATE_DISAPPEARED');
      const state = parseState(raw); update(state); return JSON.stringify(state);
    });
  }
  function isOwned(request                          ) {
    return request.identifier.startsWith('bag-side.reminder.v3.') && request.content.data?.owner === REMINDER_OWNER;
  }
  function matches(request                          , sid        , item                  ) {
    const data = request.content.data;
    return request.identifier === item.identifier && data?.target === 'schedule' && data.scheduleId === sid
      && data.offsetMinutes === item.offsetMinutes && request.content.body === item.title
      && (!isOwned(request) || data.triggerAt === item.triggerAt);
  }
  async function cancelKnown(identifier        , sid        ) {
    const requests = await deps.driver.list();
    const found = requests.find((r) => r.identifier === identifier);
    if (!found) return;
    if (found.content.data?.target !== 'schedule' || found.content.data.scheduleId !== sid) throw new ReminderStateError('OWNERSHIP_MISMATCH');
    await deps.driver.cancel(identifier);
    if ((await deps.driver.list()).some((r) => r.identifier === identifier)) throw new Error('알림 취소를 확인하지 못했습니다. 다시 시도해주세요.');
  }
  async function settle(key        ) {
    const intent = (await read()).intents[key];
    if (!intent) return;
    const { scheduleId, desired } = intent;
    let next = desired;
    if (next && new Date(next.triggerAt).getTime() <= now()) {
      // An interrupted operation that is now past due must not fire immediately.
      await change((s) => { s.intents[key] = { ...intent, desired: null, obsolete: [...new Set([...intent.obsolete, next .identifier])] }; });
      return settle(key);
    }
    if (next) {
      if (!await deps.driver.permission(false)) throw new Error('알림 권한이 없어 예약을 확인하지 못했습니다. 휴대폰 설정을 확인해주세요.');
      let requests = await deps.driver.list();
      const found = requests.find((r) => r.identifier === next .identifier);
      if (found && !matches(found, scheduleId, next)) throw new ReminderStateError('RESERVATION_MISMATCH');
      if (!found) {
        // Requested ID is durable BEFORE scheduling; lost native acknowledgements are recoverable.
        const actualId = await deps.driver.schedule(next, scheduleId);
        if (actualId !== next.identifier) throw new ReminderStateError('UNEXPECTED_NATIVE_ID');
        requests = await deps.driver.list();
        if (!requests.some((r) => matches(r, scheduleId, next ))) throw new Error('휴대폰의 알림 예약을 확인하지 못했습니다. 다시 시도해주세요.');
      }
    }
    for (const identifier of intent.obsolete) await cancelKnown(identifier, scheduleId);
    await change((s) => {
      const entries = s.reminders[scheduleId] || {};
      if (next) entries[String(intent.offsetMinutes)] = next; else delete entries[String(intent.offsetMinutes)];
      if (Object.keys(entries).length) s.reminders[scheduleId] = entries; else delete s.reminders[scheduleId];
      delete s.intents[key];
    });
  }
  async function schedule(input               , requestPermission         ) {
    if (!id(input.scheduleId) || !offset(input.offsetMinutes) || !input.title.trim()) throw new ReminderStateError('INVALID_INPUT');
    const triggerAt = reminderTriggerAt(input.scheduleStartsAt, input.offsetMinutes);
    if (!Number.isFinite(triggerAt.getTime()) || triggerAt.getTime() <= now()) throw new Error('알림 시각이 이미 지났습니다.');
    if (!await deps.driver.permission(requestPermission)) throw new Error('알림 권한이 필요합니다. 휴대폰 설정에서 생존가방 알림을 허용해주세요.');
    const key = slot(input.scheduleId, input.offsetMinutes);
    await settle(key);
    const state = await read(); const previous = state.reminders[input.scheduleId]?.[String(input.offsetMinutes)];
    const requests = await deps.driver.list();
    const triggerIso = triggerAt.toISOString();
    if (previous?.triggerAt === triggerIso && previous.title === input.title
      && requests.some((r) => matches(r, input.scheduleId, previous))) return previous;
    const identifier = `bag-side.reminder.v3.${deps.newId()}`;
    if (!id(identifier) || requests.some((r) => r.identifier === identifier)
      || Object.values(state.reminders).flatMap(Object.values).some((r) => r.identifier === identifier)
      || Object.values(state.intents).some((i) => i.desired?.identifier === identifier || i.obsolete.includes(identifier))) throw new ReminderStateError('DUPLICATE_ID');
    const desired                   = { identifier, triggerAt: triggerIso, title: input.title, offsetMinutes: input.offsetMinutes };
    await change((s) => { s.intents[key] = { scheduleId: input.scheduleId, offsetMinutes: input.offsetMinutes, desired, obsolete: previous ? [previous.identifier] : [] }; });
    await settle(key);
    const confirmed = (await read()).reminders[input.scheduleId]?.[String(input.offsetMinutes)];
    if (confirmed?.identifier !== desired.identifier) throw new Error('알림 시각이 지나 예약이 유지되지 않았습니다.');
    return confirmed;
  }
  async function cancel(sid        , minutes        ) {
    if (!id(sid) || !offset(minutes)) throw new ReminderStateError('INVALID_INPUT');
    const state = await read(); const key = slot(sid, minutes); const intent = state.intents[key];
    const previous = state.reminders[sid]?.[String(minutes)];
    const system = await deps.driver.list();
    const ownedIds = system.filter((r) => isOwned(r) && r.content.data?.scheduleId === sid && r.content.data.offsetMinutes === minutes).map((r) => r.identifier);
    const obsolete = [...new Set([...(intent?.obsolete || []), ...ownedIds, ...(intent?.desired ? [intent.desired.identifier] : []), ...(previous ? [previous.identifier] : [])])];
    if (!obsolete.length && !intent && !previous) return false;
    // Supersede an incomplete replacement before touching the OS. It must never be restored.
    await change((s) => { s.intents[key] = { scheduleId: sid, offsetMinutes: minutes, desired: null, obsolete }; });
    await settle(key); return true;
  }
  async function list(sid        ) {
    const state = await read();
    return Object.values(state.reminders[sid] || {}).sort((a, b) => a.offsetMinutes - b.offsetMinutes);
  }
  return Object.freeze({
    scheduleReminder: (input               ) => serial(() => schedule(input, true)),
    listScheduleReminders: (sid        ) => serial(() => list(sid)),
    listPendingScheduleReminders: (sid) => serial(async () => Object.values((await read()).intents).filter(i => i.scheduleId === sid).map(i => i.desired).filter(Boolean)),
    listTrackedReminderScheduleIds: () => serial(async () => {
      const state = await read();
      return [...new Set([...Object.keys(state.reminders), ...Object.values(state.intents).map((i) => i.scheduleId), ...Object.keys(state.legacyCleanup)])];
    }),
    getScheduleReminderStatus: () => serial(async () => {
      const state = await read();
      const scheduled = Object.values(state.reminders).reduce((total, entries) => total + Object.keys(entries).length, 0);
      const pending = Object.values(state.intents).filter((intent) => intent.desired !== null).length;
      const cleanupPending = Object.values(state.intents).filter((intent) => intent.desired === null).length
        + Object.values(state.legacyCleanup).reduce((total, ids) => total + ids.length, 0);
      return { scheduled, pending, cleanupPending };
    }),
    cancelScheduleReminder: (sid        , minutes        ) => serial(() => cancel(sid, minutes)),
    cancelAllScheduleReminders: (sid        ) => serial(async () => {
      let count = 0; let failed = 0;
      for (const minutes of REMINDER_OFFSETS) { try { if (await cancel(sid, minutes)) count += 1; } catch { failed += 1; } }
      // A server-confirmed cancellation must also clean migrated rollback remnants.
      const state = await read();
      for (const identifier of state.legacyCleanup[sid] || []) {
        try { await cancelKnown(identifier, sid); await change((s) => { s.legacyCleanup[sid] = s.legacyCleanup[sid].filter((v) => v !== identifier); }); }
        catch { failed += 1; }
      }
      if (failed) throw new Error(`알림 ${failed}개를 취소하지 못했습니다. 정리 내역을 보존했으며 다시 시도해야 합니다.`);
      return count;
    }),
    synchronizeScheduleReminders: (input                                      ) => serial(async () => {
      const state = await read();
      const keys = new Set([...Object.values(state.reminders[input.scheduleId] || {}).map((r) => r.offsetMinutes),
        ...Object.values(state.intents).filter((i) => i.scheduleId === input.scheduleId).map((i) => i.offsetMinutes)]);
      let updated = 0; let removed = 0; let failed = 0;
      for (const minutes of keys) {
        try {
          const pending = (await read()).intents[slot(input.scheduleId, minutes)];
          if (pending?.desired === null) { await settle(slot(input.scheduleId, minutes)); removed += 1; continue; }
          if (reminderTriggerAt(input.scheduleStartsAt, minutes).getTime() <= now()) { await cancel(input.scheduleId, minutes); removed += 1; }
          else { await schedule({ ...input, offsetMinutes: minutes                          }, false); updated += 1; }
        } catch { failed += 1; }
      }
      return { updated, removed, failed };
    }),
    reconcileScheduleReminders: () => serial(async () => {
      let state = await read(); // Validate all metadata BEFORE any OS cleanup.
      let restored = 0; let removed = 0; let cleanedPending = 0; let failed = 0; let untracked = 0;
      for (const [sid, ids] of Object.entries(state.legacyCleanup)) for (const identifier of ids) {
        try { await cancelKnown(identifier, sid); await change((s) => { s.legacyCleanup[sid] = s.legacyCleanup[sid].filter((v) => v !== identifier); }); cleanedPending += 1; }
        catch { failed += 1; }
      }
      for (const key of Object.keys(state.intents)) { try { await settle(key); } catch { failed += 1; } }
      state = await read();
      const system = await deps.driver.list();
      for (const [sid, entries] of Object.entries(state.reminders)) for (const item of Object.values(entries)) {
        if (state.intents[slot(sid, item.offsetMinutes)]) continue;
        try {
          if (new Date(item.triggerAt).getTime() <= now()) { await cancel(sid, item.offsetMinutes); removed += 1; }
          else if (!system.some((r) => matches(r, sid, item))) {
            await schedule({ scheduleId: sid, title: item.title, scheduleStartsAt: new Date(new Date(item.triggerAt).getTime() + item.offsetMinutes * 60_000), offsetMinutes: item.offsetMinutes                          }, false); restored += 1;
          }
        } catch { failed += 1; }
      }
      state = await read();
      const protectedIds = new Set([...Object.values(state.reminders).flatMap(Object.values).map((r) => r.identifier),
        ...Object.values(state.intents).flatMap((i) => [...i.obsolete, ...(i.desired ? [i.desired.identifier] : [])])]);
      for (const request of await deps.driver.list()) {
        if (protectedIds.has(request.identifier) || request.content.data?.target !== 'schedule') continue;
        const sid = request.content.data.scheduleId;
        if (!isOwned(request) || !id(sid) || !offset(request.content.data.offsetMinutes)) { untracked += 1; continue; }
        try { await cancelKnown(request.identifier, sid); cleanedPending += 1; } catch { failed += 1; }
      }
      state = await read();
      return { restored, removed, cleanedPending, failed, untracked, pending: Object.keys(state.intents).length + Object.values(state.legacyCleanup).flat().length };
    }),
  });
}
