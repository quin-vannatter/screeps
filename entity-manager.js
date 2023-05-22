const {
    Manager
} = require("./manager");

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

    Object.keys(entityMapping).forEach(key => {
        Object.defineProperty(this, key, {
            get: () => {
                if (this.props == undefined) {
                    this.props = {};
                }
                const propName = `__${key}`;
                if (this.props[propName] == undefined) {
                    this.props[propName] = entityMapping[key]();
                    this.props[propName] = this.props[propName].map(entity => this.getEntity(entity.id || entity.name));
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
    isEntityId: function(id) {
        return ID_PATTERN.test(id) || NAME_PATTERN.test(id);
    },
    isEntity: function(entity) {
        return (entity != undefined && typeof(entity) === "object") && (ID_PATTERN.test(entity.id) || NAME_PATTERN.test(entity.name));
    },
    getEntity: function (id) {
        const isId = ID_PATTERN.test(id);
        let value = this.entityReferences[id];
        if (value == undefined) {
            value = !isId ? Game.rooms[id] : Game.getObjectById(id);
            if (value != undefined) {
                this.entityReferences[id] = value;
            }
        }
        return value;
    },
    getId: function(entity) {
        return entity.id || entity.name;
    },
    refreshEntity: function(entity) {
        return this.getEntity(this.getId(entity));
    },
    clear: function () {
        this.entityReferences = {};
    },
    run: function () {
        this.props = {};
    }
}

module.exports = {
    e: new EntityManager()
}