import Sqlite3 from "better-sqlite3"

export namespace Sqlite3Storage {
  export interface Storage {
    /** sqlite3-storage Database object */
    readonly db: Database
    /** Storage name. This name is used for the table name. */
    readonly storageName: string
    /** Return the number of items stored. */
    readonly length: number
    /**
     * Clear items. All items will be deleted.
     */
    clear(): void
    /**
     * Get the item with the specified key. The order is ROWID of the table.
     * @param key key name
     */
    getItem(key: string): string | null
    /**
     * Return the key corresponding to the index
     * @param index a zero-based index
     */
    key(index: number): string | null
    /**
     * Return the key and value corresponding to the index
     * @param index a zero-based index
     */
    at(index: number): KeyValue | null
    /**
     * Remove the item with the specified key.
     * @param key key name
     */
    removeItem(key: string): void
    /**
     * Set item.
     * @param key
     * @param value
     */
    setItem(key: string, value: string): void
    [Symbol.iterator](): StorageIterator
  }

  export interface KeyValue {
    key: string
    value: string
  }

  export interface DatabaseOptions extends Sqlite3.Options {}

  export interface TransactionOptions {
    /** Whether to roll back when an exception occurs. default is true */
    rollback?: boolean
    /** transaction type. "DEFERRED", "IMMEDIATE" or "EXCLUSIVE" */
    type?: TransactionType
  }

  export type IteratorResult = { value: KeyValue; done: boolean }

  export interface StorageIterator {
    [Symbol.iterator](): StorageIterator
    next(): IteratorResult
    return(): IteratorResult
  }
}

type TransactionType = "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE"

export class Database {
  readonly db: Sqlite3.Database
  private readonly BEGIN: Sqlite3.Statement
  private readonly BEGIN_MAP: { [P in TransactionType]: Sqlite3.Statement }
  private readonly ROLLBACK: Sqlite3.Statement
  private readonly COMMIT: Sqlite3.Statement
  private readonly storageMap: { [key: string]: Sqlite3Storage } = {}

  /**
   *
   * @param path_or_sqlite3 path or better-sqlite3 Database instance
   * @param options better-sqlite3 Database option and table name used by sqlite3-storage
   */
  constructor(path_or_sqlite3: string | Sqlite3.Database, options?: Sqlite3Storage.DatabaseOptions) {
    if (typeof path_or_sqlite3 === "string") {
      this.db = new Sqlite3(path_or_sqlite3, options)
    } else if (path_or_sqlite3 instanceof Sqlite3) {
      this.db = path_or_sqlite3
    } else {
      throw new Error("argument error")
    }

    this.BEGIN = this.db.prepare(`BEGIN`)
    this.BEGIN_MAP = {
      DEFERRED: this.db.prepare(`BEGIN DEFERRED`),
      IMMEDIATE: this.db.prepare(`BEGIN IMMEDIATE`),
      EXCLUSIVE: this.db.prepare(`BEGIN EXCLUSIVE`),
    }
    this.ROLLBACK = this.db.prepare(`ROLLBACK`)
    this.COMMIT = this.db.prepare(`COMMIT`)
  }

  /**
   * Return whether database is in transaction.
   */
  get inTransaction() {
    return this.db.inTransaction
  }

  /**
   * Close database.
   */
  close() {
    this.db.close()
  }

  /**
   * Get storage.
   * @param name Storage name
   */
  getStorage(name: string): Sqlite3Storage.Storage {
    if (this.storageMap[name] == null) {
      this.storageMap[name] = new Sqlite3Storage(this, name)
    }

    return this.storageMap[name]
  }

  /**
   * Execute function in transaction.
   * @param options Transaction options about rollback and lock.
   * @param func Function to be executed in a transaction.
   */
  transaction(options: Sqlite3Storage.TransactionOptions | null | undefined, func: () => void) {
    if (this.db.inTransaction) {
      throw new Error("already in transaction")
    }

    let begin = this.BEGIN
    if (options && options.type && options.type in this.BEGIN_MAP) {
      begin = this.BEGIN_MAP[options.type]
    }

    let rollback = true
    if (options && options.rollback != null) {
      rollback = options.rollback
    }

    begin.run()
    try {
      func()
      this.COMMIT.run()
    } catch (error) {
      if (rollback) {
        this.ROLLBACK.run()
      } else {
        this.COMMIT.run()
      }
      throw error
    }
  }
}

/**
 * Simple key-value store like localStorage.
 */
class Sqlite3Storage implements Sqlite3Storage.Storage {
  readonly db: Database
  readonly storageName: string
  private readonly INSERT: Sqlite3.Statement
  private readonly UPDATE: Sqlite3.Statement
  private readonly GET_VALUE: Sqlite3.Statement
  private readonly DELETE: Sqlite3.Statement
  private readonly AT: Sqlite3.Statement
  private readonly KEY: Sqlite3.Statement
  private readonly COUNT: Sqlite3.Statement
  private readonly CLEAR: Sqlite3.Statement

  constructor(db: Database, storageName: string) {
    this.db = db
    if (!storageName.match(/^[_a-zA-Z][_a-zA-Z0-9]*$/)) {
      throw new Error("invalid name")
    }
    this.storageName = storageName

    this.initTable()

    this.INSERT = this.db.db.prepare(`INSERT OR IGNORE INTO ${this.storageName} (itemKey, itemValue) VALUES(?, ?)`)
    this.UPDATE = this.db.db.prepare(`UPDATE ${this.storageName} SET itemValue = ? WHERE itemKey = ?`)
    this.GET_VALUE = this.db.db.prepare(`SELECT itemValue FROM ${this.storageName} WHERE itemKey = ?`)
    this.GET_VALUE.pluck(true)
    this.DELETE = this.db.db.prepare(`DELETE FROM ${this.storageName} WHERE itemKey = ?`)
    this.AT = this.db.db.prepare(`SELECT * FROM ${this.storageName} ORDER BY ROWID LIMIT 1 OFFSET ?`)
    this.KEY = this.db.db.prepare(`SELECT itemKey FROM ${this.storageName} ORDER BY ROWID LIMIT 1 OFFSET ?`)
    this.KEY.pluck(true)
    this.COUNT = this.db.db.prepare(`SELECT COUNT (*) FROM ${this.storageName}`)
    this.COUNT.pluck(true)
    this.CLEAR = this.db.db.prepare(`DELETE FROM ${this.storageName}`)
  }
  private initTable() {
    const stmtCreateTable = this.db.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${this.storageName} (
        itemKey TEXT NOT NULL,
        itemValue TEXT NOT NULL
      )
    `)
    stmtCreateTable.run()

    const stmtTableInfo = this.db.db.prepare(`PRAGMA table_info('${this.storageName}')`)
    const info = stmtTableInfo.all()
    this.checkTableInfo(info)

    const stmtCreateIndex = this.db.db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS itemKeyIndex
      ON ${this.storageName} (itemKey)
    `)
    stmtCreateIndex.run()
  }

  checkTableInfo(info: Array<{ name: string; type: string; notnull: number }>) {
    if (Array.isArray(info) && info.length == 2) {
      if (
        info[0].name === "itemKey" &&
        info[0].type === "TEXT" &&
        info[0].notnull === 1 &&
        info[1].name === "itemValue" &&
        info[1].type === "TEXT" &&
        info[1].notnull === 1
      ) {
        return true
      }
    }
    throw Error("unexpected table info")
  }

  get length(): number {
    return this.COUNT.get()
  }

  clear() {
    this.CLEAR.run()
  }

  getItem(key: string): string | null {
    return this.GET_VALUE.get(key) || null
  }

  key(index: number): string | null {
    return this.KEY.get(index) || null
  }

  at(index: number): Sqlite3Storage.KeyValue | null {
    const row = this.AT.get(index)
    if (row) {
      return { key: row.itemKey, value: row.itemValue }
    } else {
      return null
    }
  }

  removeItem(key: string) {
    this.DELETE.run(key)
  }

  setItem(key: string, value: string) {
    const r = this.INSERT.run(key, value)
    if (r.changes === 0) {
      this.UPDATE.run(value, key)
    }
  }

  [Symbol.iterator](): Sqlite3Storage.StorageIterator {
    return new StorageIterator(this)
  }
}

class StorageIterator implements Sqlite3Storage.StorageIterator {
  private storage: Sqlite3Storage.Storage
  private index = 0

  constructor(storage: Sqlite3Storage.Storage) {
    this.storage = storage
  }

  [Symbol.iterator](): Sqlite3Storage.StorageIterator {
    return this
  }

  next(): Sqlite3Storage.IteratorResult {
    const kv = this.storage.at(this.index)
    this.index += 1
    if (kv) {
      return { value: kv, done: false }
    } else {
      return { value: undefined as any, done: true }
    }
  }

  return(): Sqlite3Storage.IteratorResult {
    return { value: undefined as any, done: true }
  }
}
