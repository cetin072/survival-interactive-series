// Worklog durable storage; reused fault-injection test harness only.
export const STORAGE_LIMITS = Object.freeze({
    chunkBytes: 1500,
    maxBytes: 1_500_000,
    maxChunks: 1024
});
export class StorageIntegrityError extends Error {
    code;
    constructor(code){
        super(`기기 저장소를 안전하게 처리하지 못했습니다. 다시 시도해주세요. (${code})`), this.code = code;
        this.name = 'StorageIntegrityError';
    }
}
const ID = /^[a-f0-9]{32}$/;
const HASH = /^[a-f0-9]{64}$/;
const headKey = (key)=>`${key}__atomic_v1`;
const pendingKey = (key)=>`${key}__atomic_pending_v1`;
const partKey = (key, id, index)=>`${key}__atomic_${id}_${index}`;
const legacyMetaKey = (key)=>`${key}__chunkmeta`;
const legacyPartKey = (key, index)=>`${key}__chunk_${index}`;
function object(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function parse(raw) {
    try {
        return JSON.parse(raw);
    } catch  {
        throw new StorageIntegrityError('CORRUPT_METADATA');
    }
}
function validCount(value) {
    return Number.isInteger(value) && Number(value) > 0 && Number(value) <= STORAGE_LIMITS.maxChunks;
}
function generation(value) {
    if (!object(value) || typeof value.id !== 'string' || !ID.test(value.id) || !validCount(value.chunks) || !Number.isInteger(value.length) || Number(value.length) < 0 || !Number.isInteger(value.bytes) || Number(value.bytes) < 0 || Number(value.bytes) > STORAGE_LIMITS.maxBytes || Number(value.length) > Number(value.bytes) || typeof value.digest !== 'string' || !HASH.test(value.digest)) {
        throw new StorageIntegrityError('CORRUPT_GENERATION');
    }
    return {
        id: value.id,
        chunks: value.chunks,
        length: Number(value.length),
        bytes: Number(value.bytes),
        digest: value.digest
    };
}
function legacy(value) {
    if (!object(value) || !Number.isInteger(value.chunks) || Number(value.chunks) < 0 || Number(value.chunks) > STORAGE_LIMITS.maxChunks) throw new StorageIntegrityError('CORRUPT_LEGACY');
    return {
        chunks: Number(value.chunks)
    };
}
function manifest(raw) {
    const value = parse(raw);
    if (!object(value) || value.v !== 1 || !Array.isArray(value.garbage) || value.garbage.length > 2) {
        throw new StorageIntegrityError('CORRUPT_MANIFEST');
    }
    const current = value.current === null ? null : generation(value.current);
    const garbage = value.garbage.map(generation);
    if (garbage.some((ref)=>ref.id === current?.id)) throw new StorageIntegrityError('UNSAFE_CLEANUP');
    return {
        v: 1,
        current,
        garbage,
        legacy: value.legacy === null ? null : legacy(value.legacy)
    };
}
function chunk(value) {
    if (typeof value !== 'string') throw new StorageIntegrityError('INVALID_VALUE');
    const parts = [];
    let part = '';
    let partBytes = 0;
    let bytes = 0;
    for (const char of value){
        const cp = char.codePointAt(0);
        if (cp >= 0xd800 && cp <= 0xdfff) throw new StorageIntegrityError('INVALID_UNICODE');
        const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
        bytes += size;
        if (bytes > STORAGE_LIMITS.maxBytes) throw new StorageIntegrityError('VALUE_TOO_LARGE');
        if (partBytes + size > STORAGE_LIMITS.chunkBytes) {
            parts.push(part);
            part = '';
            partBytes = 0;
        }
        part += char;
        partBytes += size;
    }
    parts.push(part);
    if (parts.length > STORAGE_LIMITS.maxChunks) throw new StorageIntegrityError('VALUE_TOO_LARGE');
    return {
        parts,
        bytes
    };
}
export function createDurableStorage(options) {
    const { store } = options;
    const tails = new Map();
    function serial(key, operation) {
        if (!/^[a-zA-Z0-9._-]+$/.test(key)) return Promise.reject(new StorageIntegrityError('INVALID_KEY'));
        const result = (tails.get(key) || Promise.resolve()).then(operation);
        const tail = result.then(()=>undefined, ()=>undefined);
        tails.set(key, tail);
        void tail.then(()=>{
            if (tails.get(key) === tail) tails.delete(key);
        });
        return result;
    }
    async function readManifest(key) {
        const raw = await store.getItem(headKey(key));
        return raw === null ? null : manifest(raw);
    }
    async function readPending(key) {
        const raw = await store.getItem(pendingKey(key));
        return raw === null ? null : generation(parse(raw));
    }
    async function readLegacyInfo(key) {
        const raw = await store.getItem(legacyMetaKey(key));
        if (raw === null) return {
            chunks: 0
        };
        const value = legacy(parse(raw));
        if (!value.chunks) throw new StorageIntegrityError('CORRUPT_LEGACY');
        return value;
    }
    async function readGeneration(key, ref) {
        const parts = [];
        for(let i = 0; i < ref.chunks; i += 1){
            const part = await store.getItem(partKey(key, ref.id, i));
            if (part === null) throw new StorageIntegrityError('MISSING_CHUNK');
            parts.push(part);
        }
        const value = parts.join('');
        if (value.length !== ref.length || chunk(value).bytes !== ref.bytes || await options.digest(value) !== ref.digest) {
            throw new StorageIntegrityError('CORRUPT_VALUE');
        }
        return value;
    }
    async function readUnlocked(key) {
        const state = await readManifest(key);
        if (state) return state.current ? readGeneration(key, state.current) : null;
        const info = await readLegacyInfo(key);
        if (!info.chunks) return store.getItem(key);
        const parts = [];
        for(let i = 0; i < info.chunks; i += 1){
            const part = await store.getItem(legacyPartKey(key, i));
            if (part === null) throw new StorageIntegrityError('MISSING_LEGACY_CHUNK');
            parts.push(part);
        }
        const value = parts.join('');
        chunk(value);
        return value;
    }
    async function deleteGeneration(key, ref) {
        for(let i = 0; i < ref.chunks; i += 1)await store.removeItem(partKey(key, ref.id, i));
    }
    async function maintenance(key) {
        const state = await readManifest(key);
        const pending = await readPending(key);
        if (pending) {
            if (pending.id !== state?.current?.id) await deleteGeneration(key, pending);
            await store.removeItem(pendingKey(key));
        }
        if (!state) return;
        for (const old of state.garbage)await deleteGeneration(key, old);
        if (state.legacy) {
            for(let i = 0; i < state.legacy.chunks; i += 1)await store.removeItem(legacyPartKey(key, i));
            await store.removeItem(key);
            await store.removeItem(legacyMetaKey(key));
        }
        if (state.garbage.length || state.legacy) {
            await store.setItem(headKey(key), JSON.stringify({
                ...state,
                garbage: [],
                legacy: null
            }));
        }
    }
    async function bestEffortMaintenance(key) {
        try {
            await maintenance(key);
        } catch  {
            try {
                options.onMaintenancePending?.();
            } catch  {}
        }
    }
    async function writeUnlocked(key, value) {
        const { parts, bytes } = chunk(value);
        const digest = await options.digest(value);
        if (!HASH.test(digest)) throw new StorageIntegrityError('INVALID_DIGEST');
        await maintenance(key);
        const previous = await readManifest(key);
        const legacyInfo = previous ? null : await readLegacyInfo(key);
        const id = options.newGenerationId();
        if (!ID.test(id) || id === previous?.current?.id) throw new StorageIntegrityError('INVALID_GENERATION_ID');
        const ref = {
            id,
            chunks: parts.length,
            length: value.length,
            bytes,
            digest
        };
        await store.setItem(pendingKey(key), JSON.stringify(ref));
        for(let i = 0; i < parts.length; i += 1)await store.setItem(partKey(key, id, i), parts[i]);
        if (await readGeneration(key, ref) !== value) throw new StorageIntegrityError('WRITE_VERIFICATION_FAILED');
        const next = {
            v: 1,
            current: ref,
            garbage: previous?.current ? [
                previous.current
            ] : [],
            legacy: legacyInfo
        };
        try {
            await store.setItem(headKey(key), JSON.stringify(next));
        } catch (error) {
            if ((await readManifest(key))?.current?.id !== id) throw error;
        }
        await bestEffortMaintenance(key);
    }
    async function removeUnlocked(key) {
        let previous = null;
        let legacyInfo = null;
        try {
            previous = await readManifest(key);
            if (!previous) legacyInfo = await readLegacyInfo(key);
        } catch (error) {
            if (!(error instanceof StorageIntegrityError)) throw error;
        }
        const next = {
            v: 1,
            current: null,
            garbage: previous?.current ? [
                ...previous.garbage,
                previous.current
            ] : previous?.garbage || [],
            legacy: previous?.legacy || legacyInfo
        };
        await store.setItem(headKey(key), JSON.stringify(next));
        await bestEffortMaintenance(key);
    }
    return Object.freeze({
        getItem: (key)=>serial(key, ()=>readUnlocked(key)),
        setItem: (key, value)=>serial(key, ()=>writeUnlocked(key, value)),
        removeItem: (key)=>serial(key, ()=>removeUnlocked(key)),
        updateItem: (key, update)=>serial(key, async ()=>{
                const next = update(await readUnlocked(key));
                if (next === null) await removeUnlocked(key);
                else await writeUnlocked(key, next);
                return next;
            }),
        recover: (key)=>serial(key, ()=>maintenance(key))
    });
}
