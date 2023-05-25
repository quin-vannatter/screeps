const { Manager } = require("./manager");
const { stringify } = require("./utils");

function CombatManager() {
    Manager.call(this, CombatManager.name);
}

const TOWER_DISTANCE_THRESHOLD = 100;
const REPAIR_THRESHOLD = 20;
const MIN_DEFENDER_COUNT = 2;

CombatManager.prototype = {
    ...Manager.prototype,
    afterInit: function() {
        this.TaskManager.tasks.register({
            defend: {
                template: {
                    execute: self => self.creep.attack(self.destination),
                    triggered: true,
                    triggerCondition: self => this.inCombat[self.room.name],
                    bodyParts: [
                        ATTACK
                    ],
                    getMessage: () => "Attacking"
                }
            }
        });
    },
    run: function(room) {
        this.inCombat = this.e.rooms.map(room => [room.name, this.e.hostiles.some(hostile => hostile.room == room)]).reduce((a, b) => ({ ...a, [b[0]]: b[1] }), {});
        this.handleTowers(room);
        this.handleDefense(room);
    },
    handleDefense: function(room) {
        const defenderTasks = this.TaskManager.tasks.entries.filter(task => task.room == room && task.name === "defend");
        const requiredDefenderCount = Math.max(MIN_DEFENDER_COUNT, this.e.hostiles.length);
        if (defenderTasks.length < requiredDefenderCount) {
            this.TaskManager.getAndSubmitTask("defend", { room, destination: room });
        }
        if (this.inCombat[room.name]) {
            const hostiles = this.e.hostiles.filter(hostile => hostile.room == room).sort((a, b) => a.hits - b.hits);
            if (hostiles.length > 0) {
                const hostile = hostiles[0];
                this.TaskManager.tasks.entries.filter(task => task.name === "defend").forEach(task => task.destination = hostile);
            }
        }
    },
    handleTowers: function(room) {
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller ? room.controller.level : 0];
        if (maxTowers > 0) {
            const currentTowers = this.e.structures.filter(structure => structure.room == room && structure.structureType == STRUCTURE_TOWER);
            const currentConstructionSites = this.e.constructionSites.filter(constructionSite => constructionSite.room == room && constructionSite.structureType == STRUCTURE_TOWER);
            if (currentTowers.length < maxTowers && currentConstructionSites.length == 0) {
                const buildPosition = this.CommuteManager.getHeatMapPosition(room, position => position.attacks);
                if (buildPosition != undefined) {
                    const roomPosition = buildPosition.toRoomPosition();
                    if (!currentTowers.some(tower => tower.pos.getRangeTo(roomPosition) < TOWER_DISTANCE_THRESHOLD)) {
                        roomPosition.createConstructionSite(STRUCTURE_TOWER);
                    }
                }
            }
        }

        this.e.structures.filter(structure => structure.room == room && structure.structureType === STRUCTURE_TOWER).forEach(tower => {
            const freeCapacity = tower.store.getFreeCapacity(RESOURCE_ENERGY);

            if (freeCapacity == null || freeCapacity > 0) {
                this.TaskManager.getAndSubmitTask("depositEnergy", { destination: tower });
            }

            const hostiles = this.e.hostiles.filter(hostile => hostile.room == tower.room);
            if (hostiles.length > 0) {
                const hostile = hostiles[0];
                tower.attack(hostile);
                return;
            }

            const hurtCreeps = this.e.creeps.filter(creep => creep.room == tower.room && creep.hits < creep.hitsMax);
            if (hurtCreeps.length > 0) {
                const creep = hurtCreeps[0];
                tower.heal(creep);
                return;
            }

            const damagedStructures = this.e.structures.filter(structure => structure.room == tower.room && 
                (structure.hits / structure.hitsMax * 100) < REPAIR_THRESHOLD);
            if (damagedStructures.length > 0) {
                const structure = damagedStructures[0];
                tower.repair(structure);
            }
        });
    }
}

module.exports = {
    CombatManager: new CombatManager()
}