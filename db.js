/* 手機上的資料庫（IndexedDB）。同網域還有 34、43、47，名字要不一樣，不能清別人的。
   notes：每篇心得（碎片、寫作中、小輝草稿、定稿）；photos：還沒傳上雲端的照片；kv：設定、書單、快取。 */
const DB_NAME = 'yuedu-reading';
let dbConn = null;

function dbOpen() {
  if (dbConn) return Promise.resolve(dbConn);
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('notes', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'name' });
      d.createObjectStore('kv', { keyPath: 'k' });
    };
    r.onsuccess = () => { dbConn = r.result; dbConn.onclose = () => { dbConn = null; }; resolve(dbConn); };
    r.onerror = () => reject(r.error);
  });
}
async function dbDo(store, mode, fn) {
  const d = await dbOpen();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => resolve(q && q.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const dbPut = (s, v) => dbDo(s, 'readwrite', o => o.put(v));
const dbGet = (s, k) => dbDo(s, 'readonly', o => o.get(k));
const dbDel = (s, k) => dbDo(s, 'readwrite', o => o.delete(k));
const dbAll = s => dbDo(s, 'readonly', o => o.getAll());
const kvGet = async k => (await dbGet('kv', k))?.v;
const kvSet = (k, v) => dbPut('kv', { k, v });
const kvDel = k => dbDel('kv', k);
