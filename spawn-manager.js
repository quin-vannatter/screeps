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
        const bodyPartMap = Object.keys(BODYPART_COST);
        let i = 0;
        while(bodyParts.length > 0) {
            const index = bodyParts.indexOf(bodyPartMap[i]);
            if (index != -1) {
                const value = bodyParts[index];
                results.push(value);
                bodyParts.splice(index, 1);
            }
            i = ((i + 1) % bodyPartMap.length);
        }
        return results;
    },
    // Returns true if a creep can be spawned or if a spawn has the capacity to spawn a creep.
    requestCreepForTasks: function(bodyParts, spawns, threshold) {
        if (spawns.length > 0) {
            bodyParts = this.getRequiredBodyParts(bodyParts);
            const creepCost = this.getCreepCost(bodyParts);
            const validSpawn = spawns.find(spawn => spawn.room.energyAvailable >= creepCost && (spawn.room.energyAvailable / spawn.room.energyCapacityAvailable * 100) > threshold);
            if (validSpawn != undefined) {
                this.spawn(validSpawn, bodyParts);
                return true;
            } else {
                const validSpawns = spawns.filter(spawn => spawn.room.energyCapacityAvailable >= creepCost);
                if (validSpawns.length > 0) {
                    validSpawns.forEach(validSpawn => this.TaskManager.getAndSubmitTask("depositEnergy", { destination: validSpawn }));
                }
            }
        }
        return false;
    },
    handleExtensions: function() {

        // Create new extensions.
        this.e.spawns.map(spawn => spawn.room).forEach(room => {
            const sources = this.e.sources.filter(source => source.room.name === room.name)
            const constructionSites = this.e.constructionSites.filter(constructionSite => constructionSite.room.name == room.name);
            const zones = sources.map(source => {
                const zones = this.CommuteManager.getZones(source, "hug").filter(zone => !zone.isFull());
                if (zones.length == 0) {
                    zones.push(this.CommuteManager.createZone("hug", source, TERRAIN_MASK_WALL));
                }
                return zones;
            }).reduce((a, b) => a.concat(b), []);
            zones.forEach(zone => {
                const position = zone.getNextPosition();
                if (!constructionSites.some(x => x.pos.x == position.x && x.pos.y == position.y)) {
                    position.toRoomPosition().createConstructionSite(STRUCTURE_EXTENSION);
                }
            })
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
    getRequiredBodyParts: function(bodyParts) {
        return new Array(Math.ceil(bodyParts.length / (this.usingRoads ? 2 : 1)))
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
    usingRoads: function() {
        const presencePositions = this.CommuteManager.positions.filter(position => position.presence > 0);
        const roadPositions = presencePositions.filter(position => {
            const occupant = position.getOccupant();
            return occupant != undefined && occupant.structureType === STRUCTURE_ROAD;
        });

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