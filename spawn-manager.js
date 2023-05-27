const { Manager } = require("./manager");
const { log } = require("./utils");

const NAMES = [
    "Bustamante",
    "MacLeod",
    "Bellerieve",
    "Venables",
    "Duke",
    "Dylan",
    "Yanisin",
    "Chauvin",
    "Erik",
    "Gibbs",
    "Gray",
    "Mitchell",
    "Coleton",
    "Aman",
    "Justin",
    "Dorish",
    "Jack",
    "Cassia",
    "Taylor"
]

const TICKS_TO_LIVE_THRESHOLD = 100;

// Percentage of used roads to stop producing creeps with 1-1 MOVE parts.
const USING_ROADS_THRESHOLD = 70;

// Percentage threshold to wait until spawning.
const SPAWN_PERCENT_MODIFIER = 0.9;

const BODY_PART_MAPPING = [
    WORK,
    CARRY,
    TOUGH,
    HEAL,
    CLAIM,
    ATTACK,
    RANGED_ATTACK
]

function SpawnManager(...services) {
    Manager.call(this, SpawnManager.name, services);
}

SpawnManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.tasks.register({
            recycleSelf: {
                template: {
                    execute: self => self.destination.recycleCreep(self.creep),
                    canExecute: self => self.destination.store != undefined && self.destination.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                    isComplete: self => !this.e.exists(self.creep),
                    getMessage: () => "Recycle",
                    checkCreep: false
                }
            },
            renewSelf: {
                template: {
                    execute: self => self.destination.renewCreep(self.creep),
                    isComplete: self => self.creep.ticksToLive > (self.ticksToLive || 0),
                    onAssign: self => self.ticksToLive = self.creep.ticksToLive,
                    getMessage: () => "Renew"
                }
            }
        });
    },
    run: function() {
        this.handleExtensions();
        this.handleSpawns();
        this.usingRoadsMap = this.e.rooms.filter(room => room.controller && room.controller.my).map(room => ({
            room,
            usingRoads: this.usingRoads(room)
        }));
    },
    requestCreep: function (tasks) {
        const threshold = 100 - (100 * Math.pow(SPAWN_PERCENT_MODIFIER, this.e.creeps.length));
        const spawns = this.e.spawns;
        let bodyParts = this.getBodyParts(tasks);
        while(!this.requestCreepForTasks(bodyParts, spawns, threshold) && bodyParts.length > 0) {
            bodyParts.pop();
        }
    },
    getBodyParts: function (tasks) {
        const bodyParts = tasks.map(task => task.bodyParts).reduce((a, b) => a.concat(b), []).filter(x => x);
        const results = [];
        let i = 0;
        while(bodyParts.length > 0) {
            const index = bodyParts.indexOf(BODY_PART_MAPPING[i]);
            if (index != -1) {
                const value = bodyParts[index];
                results.push(value);
                bodyParts.splice(index, 1);
            }
            i = ((i + 1) % BODY_PART_MAPPING.length);
        }
        return results;
    },
    // Returns true if a creep can be spawned or if a spawn has the capacity to spawn a creep.
    requestCreepForTasks: function(bodyParts, spawns, threshold) {
        let found = false;
        const spawnInfoEntries = spawns.map(spawn => {
            const spawnBodyParts = this.getRequiredBodyParts(spawn.room, bodyParts);
            return {
                spawn,
                creepCost: this.getCreepCost(spawnBodyParts),
                bodyParts: spawnBodyParts
            }
        });
        if (spawns.length > 0) {
            spawns.forEach(spawn => {
                const spawnInfo = spawnInfoEntries.find(entry => entry.spawn == spawn);
                if (spawn.room.energyCapacityAvailable >= spawnInfo.creepCost) {
                    if (spawn.room.energyAvailable >= spawnInfo.creepCost && (spawn.room.energyAvailable / spawn.room.energyCapacityAvailable * 100) >= threshold) {
                        this.spawn(spawn, spawnInfo.bodyParts);
                        found = true;
                    }
                }
            });
        }
        if (!found) {
            spawns.forEach(spawn => {
                const creepCost = spawnInfoEntries.find(entry => entry.spawn == spawn).creepCost;
                if (spawn.room.energyCapacityAvailable >= creepCost) {
                    this.TaskManager.getAndSubmitTask("depositEnergy", { destination: spawn });
                }
            });
        }
        return found;
    },
    handleSpawns: function() {
        const rooms = this.e.rooms.filter(room => room.controller && room.controller.my);
        rooms.forEach(room => {
            if (!this.e.spawns.some(spawn => spawn.room == room)) {
                const constructionSites = this.e.constructionSites.filter(constructionSite => constructionSite.room == room && constructionSite.structureType === STRUCTURE_SPAWN);
                if (constructionSites.length <= 0) {
                    this.e.sources.filter(source => source.room == room).forEach(source => this.CommuteManager.getPosition(source));
                    const buildPosition = this.CommuteManager.getHeatMapPosition(room, position => position.getOccupant() instanceof Source ? 1 : 0);
                    if (buildPosition != undefined) {
                        buildPosition.toRoomObject().pos.createConstructionSite(STRUCTURE_SPAWN);
                    }
                }
            }
        })
    },
    handleExtensions: function() {

        // Create new extensions.
        this.e.rooms.filter(room => room.controller && room.controller.my && this.StructureManager.structureReachedLimit(room, STRUCTURE_EXTENSION)).forEach(room => {
            this.e.sources.filter(source => source.room == room).forEach(source => {
                const zones = this.CommuteManager.getZones(source, "hug");
                if (zones.length > 0 && zones.some(zone => !zone.isFull())) {
                    const openZones = zones.filter(zone => !zone.isFull());
                    if (openZones.length > 0) {
                        const constructionSites = this.e.constructionSites.filter(constructionSite => constructionSite.room == room && constructionSite.structureType == STRUCTURE_EXTENSION);
                        if (!openZones.some(zone => zone.positions.some(pos => constructionSites.some(constructionSite => pos[0] == constructionSite.pos.x && pos[1] == constructionSite.pos.y)))) {
                            const zone = openZones[0];
                            zone.getNextPosition().toRoomObject().pos.createConstructionSite(STRUCTURE_EXTENSION);
                        }
                    }
                } else if (zones.some(zone => !zone.isLocked)) {
                    const lockedZones = zones.filter(zone => zone.isLocked);
                    const structureTypes = [TERRAIN_MASK_WALL, STRUCTURE_ROAD].filter(structureType => !lockedZones.some(zone => zone.structureType === structureType));
                    if (structureTypes.length > 0) {
                        this.CommuteManager.createZone("hug", { target: source, structureType: structureTypes[0], room });
                    }
                }
            });
        });

        // Make sure extensions are full.
        this.e.structures.filter(structure => structure.structureType === STRUCTURE_EXTENSION)
            .filter(structure => {
                const freeCapacity = structure.store.getFreeCapacity(RESOURCE_ENERGY);
                return freeCapacity == null || freeCapacity > 0
            })
            .forEach(extension => this.TaskManager.getAndSubmitTask("depositEnergy", { destination: extension }))
    },
    requestWork: function(creep) {
        // Creeps can recycle themselves.
        if (creep.ticksToLive < TICKS_TO_LIVE_THRESHOLD) {
            this.recycleOrRenewAtClosestSpawn(creep);
            return true;
        }

        return false;
    },
    getRequiredBodyParts: function(room, bodyParts) {
        return new Array(Math.ceil(bodyParts.length / (this.usingRoadsMap.find(entry => entry.room == room).usingRoads ? 2 : 1)))
            .fill(MOVE).concat(bodyParts);
    },
    spawn: function(spawn, bodyParts) {
        let name = NAMES[Math.round(1000 * Math.random()) % NAMES.length];
        const number = Math.max(0, ...Object.keys(Game.creeps).filter(key => key.startsWith(name)).map(key => {
            if (/The\s\d+/.test(key)) {
                return parseInt(/\d+/.exec(/The\s\d+/.exec(key)[0])[0]);
            }
            return 1;
        })) + 1;
        let suffix;
        switch (number % 10) {
            case 2:
                suffix = "nd";
                break;
            case 3:
                suffix = "rd";
                break;
            default:
                suffix = "th";
                break;

        }
        name = number == 1 ? name : `${name} the ${number}${suffix}`;
        if(spawn.spawnCreep(bodyParts, name) == OK) {
            log("Spawning Creep", name);
        }
    },
    usingRoads: function(room) {
        const presencePositions = this.CommuteManager.positions.entries.filter(position => position.presence > 0 && position.room == room).length;
        const roadPositions = this.e.structures.filter(structure => structure.room == room && structure.structureType == STRUCTURE_ROAD).length;
        return (roadPositions / presencePositions * 100) > USING_ROADS_THRESHOLD;
    },
    recycleOrRenewAtClosestSpawn: function(creep) {
        const spawns = this.e.spawns.filter(spawn => spawn.room.name === creep.room.name).sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));
        if(spawns.length > 0) {
            const spawn = spawns[0];
            this.TaskManager.unassignCreep(creep);
            this.TaskManager.submitTask(this.TaskManager.getTask(spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0 ? "recycleSelf" : "renewSelf", { destination: spawn }), creep);
        }
    },
    getClosestSpawn: function(tasks) {
        return tasks.filter(task => task.destination.pos != undefined)
            .map(task => task.destination.pos.findClosestByPath(FIND_MY_SPAWNS)).reduce((a, b) => {
            if (b != null) {
                let entry = a.find(x => x.value == b);
                if (entry == undefined) {
                    entry = {
                        value: b,
                        count: 0
                    };
                    a.push(entry);
                }
                entry.count++;
            }
            return a;
        }, []).sort((a, b) => b.count - a.count).map(x => x.value);
    },
    getCreepCost: function (bodyParts) {
        return bodyParts.length > 0 && bodyParts.map(bodyPart => BODYPART_COST[bodyPart]).reduce((a, b) => a + b);
    }
}

module.exports = {
    SpawnManager: new SpawnManager()
}