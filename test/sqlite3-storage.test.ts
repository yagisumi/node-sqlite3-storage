import { Database, Sqlite3Storage } from "../src/sqlite3-storage"
import Sqlite3 from "better-sqlite3"
import os from "os"
import path from "path"
import fs from "fs"

describe("SimpleStorage", () => {
  const MEMORY = ":memory:"

  const testKV = {
    key: "test_key",
    value: "test_value",
  }

  const TMPFILE = path.join(os.tmpdir(), `sqlite3-storate-test-${process.pid}.db`)

  const KV_Array: Array<{ key: string; value: string }> = []
  for (let i = 0; i < 10; i++) {
    KV_Array.push({ key: `key${i}`, value: `value${i}` })
  }

  function openStorage(path: string, name: string, func: (db: Database, storage: Sqlite3Storage.Storage) => void) {
    const db = new Database(path)
    try {
      const storage = db.getStorage(name)
      func(db, storage)
      db.close()
    } catch (error) {
      db.close()
      throw error
    }
  }

  test("create Database", () => {
    const db = new Database(MEMORY)
    expect(db).toBeInstanceOf(Database)
    db.close()
    expect(db.db.open).toBe(false)

    const sqlite = new Sqlite3(MEMORY)
    const db2 = new Database(sqlite)
    expect(db2).toBeInstanceOf(Database)
    db2.close()

    expect(() => new Database({} as any)).toThrow("argument error")

    try {
      const db3 = new Database(TMPFILE)
      const storage = db3.getStorage("test")
      storage.setItem(testKV.key, testKV.value)
      db3.close()

      const readonly_db = new Database(TMPFILE, { readonly: true })
      const readonly_storage = readonly_db.getStorage("test")
      expect(readonly_storage.getItem(testKV.key)).toBe(testKV.value)
      expect(() => {
        readonly_storage.setItem("key", "value")
      }).toThrow(/readonly/)
      readonly_db.close()

      fs.unlinkSync(TMPFILE)
    } catch (err) {}
  })

  test("create Storage", () => {
    const db = new Database(MEMORY)
    expect(() => db.getStorage("")).toThrow("invalid name")
    db.close()

    openStorage(MEMORY, "test", (db, storage) => {
      storage.setItem(testKV.key, testKV.value)
      expect(storage.getItem(testKV.key)).toBe(testKV.value)
    })
  })

  test("create Storage but already table exists", () => {
    const sqlite = new Sqlite3(MEMORY)
    const tableName1 = "KVS"
    const tableName2 = "ITEMS"
    const stmtCreateTable1 = sqlite.prepare(`
    CREATE TABLE IF NOT EXISTS ${tableName1} (
        foo TEXT NOT NULL,
        bar TEXT NOT NULL
      )
    `)
    stmtCreateTable1.run()
    const stmtCreateTable2 = sqlite.prepare(`
    CREATE TABLE IF NOT EXISTS ${tableName2} (
        foo INTEGER NOT NULL,
        bar TEXT NOT NULL,
        baz BLOB
      )
    `)
    stmtCreateTable2.run()
    const db = new Database(sqlite)
    expect(() => {
      db.getStorage(tableName1)
    }).toThrow("unexpected table info")
    expect(() => {
      db.getStorage(tableName2)
    }).toThrow("unexpected table info")
  })

  test("Storage methods", () => {
    openStorage(MEMORY, "test", (db, storage) => {
      // append
      for (let kv of KV_Array) {
        storage.setItem(kv.key, kv.value)
      }
      // length
      expect(storage.length).toBe(KV_Array.length)
      expect(db.getStorage("test").length).toBe(KV_Array.length)

      // key, at, getItem
      for (let i = 0; i < KV_Array.length; i++) {
        expect(storage.key(i)).toBe(KV_Array[i].key)
        expect(storage.getItem(KV_Array[i].key)).toBe(KV_Array[i].value)
        const kv = storage.at(i)
        expect(kv).not.toBeNull()
        if (kv) {
          expect(kv.key).toBe(KV_Array[i].key)
          expect(kv.value).toBe(KV_Array[i].value)
        }
      }
      expect(storage.key(KV_Array.length + 100)).toBeNull()
      expect(storage.at(KV_Array.length + 100)).toBeNull()

      // removeItem
      storage.removeItem(KV_Array[2].key)
      expect(storage.getItem(KV_Array[2].key)).toBeNull()
      expect(storage.length).toBe(KV_Array.length - 1)

      // append after removed
      const kv_array = ([] as Array<{ key: string; value: string }>).concat(KV_Array)
      kv_array.splice(2, 1)
      kv_array.push(testKV)
      storage.setItem(testKV.key, testKV.value)
      expect(storage.getItem(testKV.key)).toBe(testKV.value)
      for (let i = 0; i < kv_array.length; i++) {
        expect(storage.key(i)).toBe(kv_array[i].key)
        expect(storage.getItem(kv_array[i].key)).toBe(kv_array[i].value)
      }

      // update
      storage.setItem(testKV.key, "NewValue")
      expect(storage.getItem(testKV.key)).toBe("NewValue")

      // clear
      storage.clear()
      expect(storage.length).toBe(0)

      for (let kv of KV_Array) {
        storage.setItem(kv.key, kv.value)
      }
      expect(storage.length).toBe(KV_Array.length)

      let key: string | null = null
      while ((key = storage.key(0))) {
        storage.removeItem(key)
      }
      expect(storage.length).toBe(0)
    })
  })

  test("Database transaction", () => {
    openStorage(MEMORY, "test", (db, storage) => {
      expect(storage.length).toBe(0)
      db.transaction(null, () => {
        for (let kv of KV_Array) {
          storage.setItem(kv.key, kv.value)
        }
      })
      expect(storage.length).toBe(KV_Array.length)
      storage.setItem(testKV.key, testKV.value)
      expect(storage.getItem(testKV.key)).toBe(testKV.value)
      storage.clear()
      expect(storage.length).toBe(0)

      // rollback on error
      expect(() => {
        db.transaction({ type: "IMMEDIATE" }, () => {
          for (let kv of KV_Array) {
            storage.setItem(kv.key, kv.value)
          }
          throw new Error("an error")
        })
      }).toThrow("an error")
      expect(storage.length).toBe(0)
      storage.setItem(testKV.key, testKV.value)
      expect(storage.getItem(testKV.key)).toBe(testKV.value)
      storage.clear()
      expect(storage.length).toBe(0)

      // not rollback on error
      const break_num = 3
      let count = 0
      expect(() => {
        db.transaction({ rollback: false }, () => {
          for (let i = 0; i < KV_Array.length; i++) {
            storage.setItem(KV_Array[i].key, KV_Array[i].value)
            count += 1
            if (i === break_num) {
              throw new Error("an error")
            }
          }
        })
      }).toThrow("an error")
      expect(storage.length).toBe(count)
      storage.setItem(testKV.key, testKV.value)
      expect(storage.getItem(testKV.key)).toBe(testKV.value)
      storage.clear()
      expect(storage.length).toBe(0)

      // already in transaction
      expect(() => {
        db.transaction({ rollback: true, type: "INVALID" as any }, () => {
          expect(db.inTransaction).toBe(true)
          db.transaction({ rollback: true }, () => {})
        })
      }).toThrow("already in transaction")
      storage.setItem(testKV.key, testKV.value)
      expect(storage.getItem(testKV.key)).toBe(testKV.value)

      // locked by another process:
      // SqliteError: database is locked
    })
  })

  test("Storage iterator", () => {
    openStorage(MEMORY, "s1", (db, s1) => {
      const s2 = db.getStorage("s2")
      for (let kv of KV_Array) {
        s1.setItem(kv.key, kv.value)
        s2.setItem(kv.key, kv.value)
      }

      for (let kv of s2) {
        expect(s1.getItem(kv.key)).toBe(kv.value)
      }

      for (let kv of s2[Symbol.iterator]()) {
        if (kv.value === KV_Array[3].value) {
          break
        }
      }
    })
  })
})
