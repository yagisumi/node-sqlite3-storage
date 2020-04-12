# @yagisumi/sqlite3-storage

A simple key-value store like localStorage using better-sqlite3.

[![NPM version][npm-image]][npm-url] [![node version][node-image]][npm-url] [![DefinitelyTyped][dts-image]][dts-url]  
[![Build Status][travis-image]][travis-url] [![Build Status][appveyor-image]][appveyor-url] [![Coverage percentage][coveralls-image]][coveralls-url]

## Installation

```sh
$ npm i @yagisumi/sqlite3-storage
```

## Usage

- javascript

```js
const { Database } = require('@yagisumi/sqlite3-storage');

const db = new Database(':memory:');
const storage = db.getStorage('foo');
storage.setItem('key1', 'value1');
let v = storage.getItem('key1');

for (let kv of storage) {
  console.log(kv.key, kv.value);
}

storage.clear();
```

- typescript

```ts
import { Database } from '@yagisumi/sqlite3-storage';

// ...
```

## Remarks

- Note that SQLite3 exceptions can be thrown from anywhere.

- When setting many items, you should do in a transaction. Otherwise it takes a lot of time.

```js
db.transaction({ rollback: false }, () => {
  for (let i = 0; i < 100; i++) {
    storage.setItem(`key${i}`, `value${i}`)
  }
})
```

## Example

example with typescript

```ts
import { Database, Sqlite3Storage } from "@yagisumi/sqlite3-storage"
import serialijse from "serialijse"

class Store<T> {
  constructor(private storage: Sqlite3Storage.Storage) {}
  set(key: string, obj: T) {
    this.storage.setItem(key, serialijse.serialize(obj))
  }
  get(key: string) {
    const v = this.storage.getItem(key)
    if (v) {
      return serialijse.deserialize<T>(v)
    } else {
      return null
    }
  }
}

class Person {
  constructor(readonly name: string, readonly age: number) {}
}
serialijse.declarePersistable(Person)

const db = new Database("temp.db")
const storage = db.getStorage("people")
const store = new Store<Person>(storage)

const people = [new Person("Mike", 39), new Person("Bob", 44)]

db.transaction(null, () => {
  for (let p of people) {
    store.set(p.name, p)
  }
})

for (let p of people) {
  console.log(store.get(p.name))
}
```

## API Reference

```ts
class Database {
  constructor(path_or_sqlite3: string | BetterSqlite3.Database, options?: Sqlite3Storage.DatabaseOptions);
  readonly inTransaction: boolean;
  close(): void;
  getStorage(name: string): Sqlite3Storage.Storage;
  transaction(options: Sqlite3Storage.TransactionOptions | null | undefined, func: () => void): void;
}

namespace Sqlite3Storage {
  interface Storage {
    readonly db: Database;
    readonly storageName: string;
    readonly length: number;
    clear(): void;
    getItem(key: string): string | null;
    key(index: number): string | null;
    at(index: number): KeyValue | null;
    removeItem(key: string): void;
    setItem(key: string, value: string): void;
  }
  interface KeyValue {
    key: string;
    value: string;
  }
  interface DatabaseOptions {
    // better-sqlite3 options
    memory?: boolean;
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (message?: any, ...additionalArgs: any[]) => void;
  }
  interface TransactionOptions {
    rollback?: boolean; // default: true
    type?: TransactionType; // "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE"
  }
}
```

## Documentation

https://yagisumi.github.io/node-sqlite3-storage/

## License

[MIT License](https://opensource.org/licenses/MIT)

[npm-image]: https://img.shields.io/npm/v/@yagisumi/sqlite3-storage.svg?style=flat-square
[npm-url]: https://npmjs.org/package/@yagisumi/sqlite3-storage
[node-image]: https://img.shields.io/node/v/@yagisumi/sqlite3-storage.svg
[packagephobia-image]: https://flat.badgen.net/packagephobia/install/@yagisumi/sqlite3-storage
[packagephobia-url]: https://packagephobia.now.sh/result?p=@yagisumi/sqlite3-storage
[travis-image]: https://img.shields.io/travis/yagisumi/node-sqlite3-storage.svg?logo=travis&style=flat-square
[travis-url]: https://travis-ci.org/yagisumi/node-sqlite3-storage
[appveyor-image]: https://img.shields.io/appveyor/ci/yagisumi/node-sqlite3-storage.svg?logo=appveyor&style=flat-square
[appveyor-url]: https://ci.appveyor.com/project/yagisumi/node-sqlite3-storage
[coveralls-image]: https://img.shields.io/coveralls/yagisumi/node-sqlite3-storage.svg?style=flat-square
[coveralls-url]: https://coveralls.io/github/yagisumi/node-sqlite3-storage?branch=master
[dts-image]: https://img.shields.io/badge/DefinitelyTyped-.d.ts-blue.svg?style=flat-square
[dts-url]: http://definitelytyped.org
