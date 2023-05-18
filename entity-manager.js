const { Manager } = require("./manager");

function EntityManager(...services) {
    Manager.call(this, "e", services);

    const entityMapping = {
        rooms: () => Object.values(Game.rooms),
        structures: () => this.rooms.filter(room => room.controller.my).map(room => room.find(FIND_STRUCTURES)).reduce((a, b) => a.concat(b), []),
        constructionSites: () => this.rooms.map(room => room.find(FIND_MY_CONSTRUCTION_SITES)).reduce((a, b) => a.concat(b), []),
        spawns: () => Object.values(Game.spawns),
        sources: () => this.rooms.map(room => room.find(FIND_SOURCES)).reduce((a, b) => a.concat(b), []),
        droppedResources: () => this.rooms.map(room => room.find(FIND_DROPPED_RESOURCES)).reduce((a, b) => a.concat(b), []),
        tombstones: () => this.rooms.map(room => room.find(FIND_TOMBSTONES)).reduce((a, b) => a.concat(b), []),
        creeps: () => Object.values(Game.creeps),
        controllers: () => this.rooms.filter(room => room.controller && room.controller.my).map(room => room.controller).reduce((a, b) => a.concat(b), [])
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
                    this.props[propName] = this.props[propName].map(entity => this.get(entity.id || entity.name, entity.id == undefined));
                }
                return this.props[propName];
            }
        })
    });
}

EntityManager.prototype = {
    ...Manager.prototype,
    exists: function(entity) {
        return Object.keys(entity || {}).length > 0;
    },
    get: function(arg, isRoom) {
        let value = this.entityReferences[arg];
        if (value == undefined) {
            value = isRoom ? Game.rooms[arg] : Game.getObjectById(arg);
            if (value != undefined) {
                this.entityReferences[arg] = value;
            }
        }
        return value;
    },
    clear: function() {
        this.entityReferences = {};
    },
    run: function() {
        this.props = {};
    }
}

module.exports = {
    e: new EntityManager()
}