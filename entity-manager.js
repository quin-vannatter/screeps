const {
    Manager
} = require("./manager");
const {
    after
} = require("./utils");

const CLEAR_CACHE_FREQUENCY = 10;
const ID_PATTERN = /[a-f0-9]{15}/;
const NAME_PATTERN = /[A-Z]+\d+[A-Z]+\d+/;

function EntityManager(...services) {
    Manager.call(this, "e", services);

    const entityMapping = {
        rooms: () => Object.values(Game.rooms),
        structures: () => this.rooms.filter(room => room.controller.my).map(room => room.find(FIND_STRUCTURES)).reduce((a, b) => a.concat(b), []),
        nonRoadStructures: () => this.structures.filter(structure => structure.structureType !== STRUCTURE_ROAD),
        constructionSites: () => this.rooms.map(room => room.find(FIND_MY_CONSTRUCTION_SITES)).reduce((a, b) => a.concat(b), []),
        spawns: () => Object.values(Game.spawns),
        sources: () => this.rooms.map(room => room.find(FIND_SOURCES)).reduce((a, b) => a.concat(b), []),
        droppedResources: () => this.rooms.map(room => room.find(FIND_DROPPED_RESOURCES)).reduce((a, b) => a.concat(b), []),
        tombstones: () => this.rooms.map(room => room.find(FIND_TOMBSTONES)).reduce((a, b) => a.concat(b), []),
        creeps: () => Object.values(Game.creeps),
        controllers: () => this.rooms.filter(room => room.controller && room.controller.my).map(room => room.controller).reduce((a, b) => a.concat(b), []),
        hostiles: () => this.rooms.map(room => [
            FIND_HOSTILE_CREEPS,
            FIND_HOSTILE_STRUCTURES,
            FIND_HOSTILE_SPAWNS,
            FIND_HOSTILE_CONSTRUCTION_SITES,
            FIND_HOSTILE_POWER_CREEPS
        ].map(x => room.find(x)).reduce((a, b) => a.concat(b))).reduce((a, b) => a.concat(b))
    }

    this.entityReferences = {};
    this.cacheValue = {};
    this.cacheIndex = 0;

    Object.keys(entityMapping).forEach(key => {
        Object.defineProperty(this, key, {
            get: () => {
                if (this.props == undefined) {
                    this.props = {};
                }
                const propName = `__${key}`;
                if (this.props[propName] == undefined) {
                    this.props[propName] = entityMapping[key]();
                    this.props[propName] = this.props[propName].map(entity => this.getEntityOrId(entity.id || entity.name));
                }
                return this.props[propName];
            }
        })
    });
}

EntityManager.prototype = {
    ...Manager.prototype,
    exists: function (entity) {
        return Object.keys(entity || {}).length > 0;
    },
    isEntity: function(arg) {
        if (typeof(arg) === "string") {
            return ID_PATTERN.test(arg) || NAME_PATTERN.test(arg);
        } else if (arg != undefined && typeof(arg) === "object") {
            return ID_PATTERN.test(arg.id) || NAME_PATTERN.test(arg.name);
        }
        return false;
    },
    getEntityOrId: function (arg) {
        if (typeof(arg) === "number" && Memory.ids[arg] != undefined) {
            arg = Memory.ids[arg];
        }
        if (typeof(arg) === "string" && this.isEntity(arg)) {
            const isId = ID_PATTERN.test(arg);
            let value = this.entityReferences[arg];
            if (value == undefined) {
                value = !isId ? Game.rooms[arg] : Game.getObjectById(arg);
                if (value != undefined) {
                    this.entityReferences[arg] = value;
                }
            }
            return value;
        } else if (arg != undefined && typeof(arg) === "object" && this.isEntity(arg)) {
            const id = arg.id || arg.name;
            let index = Memory.ids.indexOf(id);
            if (index == -1) {
                index = Memory.ids.length;
                Memory.ids.push(id);
            }
            return index;
        }
    },
    refreshEntity: function(arg) {
        
        // Yes, the function toggles between index and entity. This looks weird, I know.
        return this.getEntityOrId(this.getEntityOrId(arg));
    },
    cache: function (key, property, defaultFn) {
        if (this.cacheValue[key] == undefined) {
            this.cacheValue[key] = {};
        }
        if (this.cacheValue[key][property] == undefined) {
            this.cacheValue[key][property] = defaultFn();
        }
        return this.cacheValue[key][property];
    },
    clear: function () {
        this.entityReferences = {};
    },
    clearCache: function() {
        this.cacheValue = {};
    },
    run: function () {
        this.props = {};
        if (Memory.ids == undefined) {
            Memory.ids = [];
        }
        after(CLEAR_CACHE_FREQUENCY, () => {
            const keys = Object.keys(this.cache);
            this.cacheValue[keys[this.cacheIndex++ % keys.length]] = {};
        });
    }
}

module.exports = {
    e: new EntityManager()
}