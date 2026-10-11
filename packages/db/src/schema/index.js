"use strict";
/**
 * BCIS Database Schema - Main Export
 * Exports all schema tables and relations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pgUuid = exports.interval = exports.time = exports.pgTimestamp = exports.doublePrecision = exports.real = exports.serial = exports.check = exports.foreignKey = exports.primaryKey = exports.jsonb = exports.date = exports.pgEnum = exports.index = exports.uniqueIndex = exports.numeric = exports.integer = exports.timestamp = exports.boolean = exports.text = exports.varchar = exports.uuid = exports.pgTable = exports.max = exports.min = exports.avg = exports.sum = exports.count = exports.asc = exports.desc = exports.sql = exports.isNotNull = exports.isNull = exports.inArray = exports.ilike = exports.like = exports.ne = exports.lte = exports.lt = exports.gte = exports.gt = exports.not = exports.or = exports.and = exports.eq = exports.relations = void 0;
__exportStar(require("./security"), exports);
__exportStar(require("./subscribers"), exports);
__exportStar(require("./services"), exports);
__exportStar(require("./billing"), exports);
__exportStar(require("./payments"), exports);
__exportStar(require("./collections"), exports);
__exportStar(require("./operations"), exports);
// Re-export drizzle-orm for convenience
var drizzle_orm_1 = require("drizzle-orm");
Object.defineProperty(exports, "relations", { enumerable: true, get: function () { return drizzle_orm_1.relations; } });
var drizzle_orm_2 = require("drizzle-orm");
Object.defineProperty(exports, "eq", { enumerable: true, get: function () { return drizzle_orm_2.eq; } });
Object.defineProperty(exports, "and", { enumerable: true, get: function () { return drizzle_orm_2.and; } });
Object.defineProperty(exports, "or", { enumerable: true, get: function () { return drizzle_orm_2.or; } });
Object.defineProperty(exports, "not", { enumerable: true, get: function () { return drizzle_orm_2.not; } });
Object.defineProperty(exports, "gt", { enumerable: true, get: function () { return drizzle_orm_2.gt; } });
Object.defineProperty(exports, "gte", { enumerable: true, get: function () { return drizzle_orm_2.gte; } });
Object.defineProperty(exports, "lt", { enumerable: true, get: function () { return drizzle_orm_2.lt; } });
Object.defineProperty(exports, "lte", { enumerable: true, get: function () { return drizzle_orm_2.lte; } });
Object.defineProperty(exports, "ne", { enumerable: true, get: function () { return drizzle_orm_2.ne; } });
Object.defineProperty(exports, "like", { enumerable: true, get: function () { return drizzle_orm_2.like; } });
Object.defineProperty(exports, "ilike", { enumerable: true, get: function () { return drizzle_orm_2.ilike; } });
Object.defineProperty(exports, "inArray", { enumerable: true, get: function () { return drizzle_orm_2.inArray; } });
Object.defineProperty(exports, "isNull", { enumerable: true, get: function () { return drizzle_orm_2.isNull; } });
Object.defineProperty(exports, "isNotNull", { enumerable: true, get: function () { return drizzle_orm_2.isNotNull; } });
Object.defineProperty(exports, "sql", { enumerable: true, get: function () { return drizzle_orm_2.sql; } });
Object.defineProperty(exports, "desc", { enumerable: true, get: function () { return drizzle_orm_2.desc; } });
Object.defineProperty(exports, "asc", { enumerable: true, get: function () { return drizzle_orm_2.asc; } });
Object.defineProperty(exports, "count", { enumerable: true, get: function () { return drizzle_orm_2.count; } });
Object.defineProperty(exports, "sum", { enumerable: true, get: function () { return drizzle_orm_2.sum; } });
Object.defineProperty(exports, "avg", { enumerable: true, get: function () { return drizzle_orm_2.avg; } });
Object.defineProperty(exports, "min", { enumerable: true, get: function () { return drizzle_orm_2.min; } });
Object.defineProperty(exports, "max", { enumerable: true, get: function () { return drizzle_orm_2.max; } });
var pg_core_1 = require("drizzle-orm/pg-core");
Object.defineProperty(exports, "pgTable", { enumerable: true, get: function () { return pg_core_1.pgTable; } });
Object.defineProperty(exports, "uuid", { enumerable: true, get: function () { return pg_core_1.uuid; } });
Object.defineProperty(exports, "varchar", { enumerable: true, get: function () { return pg_core_1.varchar; } });
Object.defineProperty(exports, "text", { enumerable: true, get: function () { return pg_core_1.text; } });
Object.defineProperty(exports, "boolean", { enumerable: true, get: function () { return pg_core_1.boolean; } });
Object.defineProperty(exports, "timestamp", { enumerable: true, get: function () { return pg_core_1.timestamp; } });
Object.defineProperty(exports, "integer", { enumerable: true, get: function () { return pg_core_1.integer; } });
Object.defineProperty(exports, "numeric", { enumerable: true, get: function () { return pg_core_1.numeric; } });
Object.defineProperty(exports, "uniqueIndex", { enumerable: true, get: function () { return pg_core_1.uniqueIndex; } });
Object.defineProperty(exports, "index", { enumerable: true, get: function () { return pg_core_1.index; } });
Object.defineProperty(exports, "pgEnum", { enumerable: true, get: function () { return pg_core_1.pgEnum; } });
Object.defineProperty(exports, "date", { enumerable: true, get: function () { return pg_core_1.date; } });
Object.defineProperty(exports, "jsonb", { enumerable: true, get: function () { return pg_core_1.jsonb; } });
Object.defineProperty(exports, "primaryKey", { enumerable: true, get: function () { return pg_core_1.primaryKey; } });
Object.defineProperty(exports, "foreignKey", { enumerable: true, get: function () { return pg_core_1.foreignKey; } });
Object.defineProperty(exports, "check", { enumerable: true, get: function () { return pg_core_1.check; } });
Object.defineProperty(exports, "serial", { enumerable: true, get: function () { return pg_core_1.serial; } });
Object.defineProperty(exports, "real", { enumerable: true, get: function () { return pg_core_1.real; } });
Object.defineProperty(exports, "doublePrecision", { enumerable: true, get: function () { return pg_core_1.doublePrecision; } });
Object.defineProperty(exports, "pgTimestamp", { enumerable: true, get: function () { return pg_core_1.timestamp; } });
Object.defineProperty(exports, "time", { enumerable: true, get: function () { return pg_core_1.time; } });
Object.defineProperty(exports, "interval", { enumerable: true, get: function () { return pg_core_1.interval; } });
Object.defineProperty(exports, "pgUuid", { enumerable: true, get: function () { return pg_core_1.uuid; } });
