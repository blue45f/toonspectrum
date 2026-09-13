/** Isolated IndexedDB namespace, optimistic concurrency, atomic last-known-good save. */
const DB_NAME = 'toonstudio-emergency-drawing-v1';
export class LocalConflict extends Error { constructor() { super('다른 탭에서 같은 문서가 변경되었습니다.'); this.name = 'LocalConflict'; } }
export class LocalStore {
  constructor() { this.connection = null; }
  async open() {
    if (this.connection) return this.connection;
    return new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open(DB_NAME, 1); } catch (error) { reject(error); return; }
      const timer = setTimeout(() => reject(new Error('로컬 저장소에 연결하지 못했습니다. 복구 파일로 저장해 주세요.')), 4000);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('revisions', { keyPath: ['id', 'revision'] });
      };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
      request.onblocked = () => { clearTimeout(timer); reject(new Error('다른 창이 저장소 업그레이드를 막고 있습니다.')); };
      request.onsuccess = () => {
        clearTimeout(timer); this.connection = request.result;
        this.connection.onversionchange = () => { this.connection.close(); this.connection = null; };
        resolve(this.connection);
      };
    });
  }
  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const rows = [];
      const req = db.transaction('documents', 'readonly').objectStore('documents').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(rows.sort((a, b) => b.document.updatedAt - a.document.updatedAt)); return; }
        const row = cursor.value; rows.push({ id: row.id, revision: row.revision, document: { title: row.document.title, updatedAt: row.document.updatedAt } }); cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
  async get(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction('documents').objectStore('documents').get(id);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  async save(document, expectedRevision) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'revisions'], 'readwrite');
      const documents = tx.objectStore('documents');
      const revisions = tx.objectStore('revisions');
      const next = expectedRevision + 1;
      let failure;
      const req = documents.get(document.id);
      req.onsuccess = () => {
        if ((req.result?.revision ?? 0) !== expectedRevision) { failure = new LocalConflict(); tx.abort(); return; }
        const row = { id: document.id, revision: next, document };
        documents.put(row); revisions.put(row);
        if (next > 5) revisions.delete([document.id, next - 5]);
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('로컬 저장이 취소되었습니다.'));
      tx.onerror = () => { failure ??= tx.error; };
    });
  }
  async history(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction('revisions', 'readonly').objectStore('revisions').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.revision - a.revision));
      req.onerror = () => reject(req.error);
    });
  }
}
