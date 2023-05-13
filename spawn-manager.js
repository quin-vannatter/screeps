const { Manager } = require("./manager");

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
    "Mitchell"
]

const TICKS_TO_LIVE_THRESHOLD = 100;

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
                    canExecute: (self, creep) => creep.ticksToLive <= TICKS_TO_LIVE_THRESHOLD,
                    isComplete: self => Object.keys(self.creep).length == 0,
                    getMessage: () => "Seppuku"
                }
            }
        });
    },
    requestCreep: function (tasks) {
        let groupingSize = tasks.length;

        if (groupingSize == 0) {
            return;
        }
        do {
            const groupedTasks = this.groupTasks(tasks, groupingSize);
            tasks = [];
            groupedTasks.forEach(taskGroup => {
                if(!this.requestCreepForTasks(taskGroup)) {
                    tasks = tasks.concat(taskGroup);
                }
            });
            groupingSize--;
        } while(!tasks.length > 0 && groupingSize >= 1)
    },
    // Returns true if a creep can be spawned or if a spawn has the capacity to spawn a creep.
    requestCreepForTasks: function(tasks) {
        const spawns = this.getClosestSpawn(tasks);
        if (spawns.length > 0) {
            const bodyParts = this.getRequiredBodyParts(tasks);
            const creepCost = this.getCreepCost(bodyParts);
            const validSpawn = spawns.find(spawn => spawn.store[RESOURCE_ENERGY] >= creepCost);
            if (validSpawn != undefined) {
                this.spawn(validSpawn, bodyParts);
                return true;
            } else {
                const validSpawns = spawns.filter(spawn => spawn.store.getCapacity(RESOURCE_ENERGY) >= creepCost);
                if (validSpawns.length > 0) {
                    validSpawns.forEach(validSpawn => this.TaskManager.getAndSubmitTask("depositEnergy", { destination: validSpawn }));
                    return true;
                }
                if(spawns.some(spawn => spawn.store.getCapacity(RESOURCE_ENERGY) < creepCost)) {
                }
            }
        }
        return false;
    },
    getRoomSources: function(spawn) {
        const rooms = spawn ? [spawn.room] : Object.values(Game.rooms)
        return rooms.map(room => room.find(FIND_SOURCES)).reduce((a, b) => a.concat(b), []);
    },
    requestWork: function(creep) {
        // Creeps can recycle themselves.
        const closestSpawns = creep.room.find(FIND_MY_SPAWNS);
        if (closestSpawns.length > 0) {
            const task = this.TaskManager.getTask("recycleSelf", { destination: closestSpawns[0] });
            if (task.meetsRequirements(creep)) {
                task.assign(creep);
                this.TaskManager.submitTask(task);
                return true;
            }
        }

        return false;
    },
    getRequiredBodyParts: function(tasks) {
        const requiredBodyParts = tasks.map(task => task.bodyParts)
            .reduce((a, b) => a.concat(b), [])
            .filter((x, i, a) => a.indexOf(x) == i);
        return new Array(requiredBodyParts.length).fill(MOVE).concat(requiredBodyParts);
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
        console.log(`Spawning ${name}.`)
        spawn.spawnCreep(bodyParts, name);
    },
    groupTasks: function(tasks, groupSize) {
        let i = 0;
        return tasks.reduce((a,b) => {
            const index = Math.floor(i == 0 ? 0 : i / groupSize);
            a[index].push(b);
            i++;
            return a;
        }, new Array(Math.floor(tasks.length / groupSize)).fill([]))
    },
    getClosestSpawn: function(tasks) {
        return tasks.filter(task => task.destination.pos != undefined)
            .map(task => task.destination.pos.findClosestByPath(FIND_MY_SPAWNS)).reduce((a, b) => {
            if (b != null) {
                let entry = a.find(x => x.value.id == b.id);
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
        return bodyParts.map(bodyPart => BODYPART_COST[bodyPart]).reduce((a, b) => a + b);
    }
}

module.exports = {
    SpawnManager: new SpawnManager()
}