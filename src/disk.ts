/**
 * Keeping a copy on disk.
 *
 * localStorage is one browser's private drawer: clear the site data and the
 * calculations go with it. The File System Access API lets the app hold a real
 * file the user chose and write to it on every change, so the sheet lives
 * somewhere they can back up, sync and find in six months.
 *
 * The handle survives a reload — it is stored in IndexedDB, which can hold one
 * where localStorage cannot — but the permission does not always: the browser
 * may ask again, and it will only ask during a click. So the app keeps three
 * states: off, connected, and "needs a click to reconnect".
 */

export type DiskState = 'unsupported' | 'off' | 'on' | 'needs-permission'

const DB = 'longhand'
const STORE = 'handles'
const KEY = 'file'

export const supportsDisk = (): boolean =>
  typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function rememberHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    await transact('readwrite', (store) => store.put(handle, KEY) as IDBRequest<any>)
  } catch {
    /* a browser that will not keep the handle just asks again next time */
  }
}

export async function recallHandle(): Promise<FileSystemFileHandle | null> {
  try {
    return (await transact('readonly', (store) => store.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function forgetHandle(): Promise<void> {
  try {
    await transact('readwrite', (store) => store.delete(KEY) as IDBRequest<any>)
  } catch {
    /* nothing to forget */
  }
}

/** Does this handle still allow writing, without asking? */
export async function permissionState(
  handle: FileSystemFileHandle,
): Promise<'granted' | 'prompt' | 'denied'> {
  const query = (handle as any).queryPermission
  if (typeof query !== 'function') return 'granted'
  try {
    return await query.call(handle, { mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/** Ask for permission. Must be called from a click, or the browser refuses. */
export async function requestPermission(handle: FileSystemFileHandle): Promise<boolean> {
  const request = (handle as any).requestPermission
  if (typeof request !== 'function') return true
  try {
    return (await request.call(handle, { mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

const TYPES = [
  {
    description: 'Longhand calculations',
    accept: { 'application/json': ['.longhand', '.json'] as string[] },
  },
]

export async function chooseNewFile(suggestedName: string): Promise<FileSystemFileHandle | null> {
  try {
    return await (window as any).showSaveFilePicker({ suggestedName, types: TYPES })
  } catch {
    return null // the user cancelled
  }
}

export async function chooseExistingFile(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: TYPES,
      multiple: false,
    })
    return handle ?? null
  } catch {
    return null
  }
}

export async function readFile(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    const file = await handle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

export async function writeFile(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  try {
    const writable = await (handle as any).createWritable()
    await writable.write(text)
    await writable.close()
    return true
  } catch {
    return false
  }
}
