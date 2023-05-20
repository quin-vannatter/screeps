const { Manager } = require("./manager");
const { log } = require('./utils');

const INCREASE_PRIORITY_FREQUENCY = 5;
const INCREASE_SPAWN_PRIORITY_FREQUENCY = 2;

// Task Manager. Should be loaded last so all tasks can be registered.
function TaskManager() {
    Manager.call(this, TaskManager.name);
}

TaskManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.tasks = this.MemoryManager.register("tasks", true, {
            template: {
                getTasksForRequirements: () => [],
                assign: (self, creep) => {
                    self.creep = creep;
                    log("Task Assigned", self.creep, task.name, task.destination);
                    creep.say(self.getMessage(), true);
                    self.onAssign();
                },
                unassign: self => {
                    log("Task Unassigned", self.creep, task.name, task.destination);
                    self.creep.say("Unassigned", true);
                    self.creep = {};
                },
                hasBodyParts: (self, creep) => self.bodyParts.every(bodyPart => creep.body.filter(x => x.hits > 0).some(x => x.type === bodyPart)),
                meetsRequirements: (self, creep) => self.hasBodyParts(creep) && self.canExecute(creep),
                checkIsComplete: (self) => (!self.checkCreep || this.e.exists(self.creep)) && self.isComplete(),
                canExecute: () => true,
                onAssign: () => {},
                range: 1,
                triggered: false,
                triggerCondition: () => false,
                getMessage: () => "Doing task",
                isWorkingTask: false,
                checkCreep: true,
                bodyParts: []
            },
            defaults: {
                creep: {},
                destination: {},
                priority: 0
            }
        });
    },
    run: function() {
        this.tasks.entries = this.tasks.entries.sort((a, b) => b.priority - a.priority);

        this.handleQueuedTasks();
        this.handleIdleCreeps();
        this.handleActiveTasks();

        this.tasks.entries = this.tasks.entries.filter(task => !task.checkIsComplete() && this.e.exists(task.destination));
    },
    idleCreeps: function() {
        return this.e.creeps.filter(creep => this.e.exists(creep) && !creep.spawning && !this.tasks.entries.some(task => task.creep == creep))
            .sort((a, b) => b.body.length - a.body.length);
    },
    handleQueuedTasks: function() {
        let queuedTasks = this.queuedTasks();
        const idleCreeps = this.idleCreeps();

        const count = queuedTasks.length;
        queuedTasks.forEach(task => this.findCreepForTask(task, idleCreeps));
        queuedTasks = this.queuedTasks();

        const creepsNeeded = queuedTasks.length == count;

        if (!creepsNeeded && queuedTasks.length > 0) {
            log("Remaining Tasks", queuedTasks.length, ...queuedTasks.map(task => task.name).filter((x, i, a) => a.indexOf(x) === i));
        } else {
            if (idleCreeps.length > 0) {
                log("Idle Creeps", idleCreeps.length);
            }

            // Get tasks where the spawn is the destination and they're deposits and increase the priority.
            const depositEnergyTasks = queuedTasks.filter(task => task.name === "depositEnergy" && (task.destination instanceof StructureSpawn || task.destination instanceof StructureExtension));
            depositEnergyTasks.forEach(task => task.priority++);
            this.SpawnManager.requestCreep(queuedTasks, idleCreeps);
        }

        if (!(Game.time % INCREASE_PRIORITY_FREQUENCY)) {
            const tasks = queuedTasks.sort((a, b) => a.priority - b.priority);
            if (tasks.length > 0) {
                tasks[0].priority++;
            }
        }
    },
    handleTriggeredTasks: function() {
        const triggeredTasks = this.triggeredTasks();
        const creeps = this.e.creeps;

        // Unassign any triggered tasks that are no longer triggered.
        triggeredTasks.filter(task => !task.triggerCondition() && this.e.exists(task.creep)).forEach(task => this.unassignCreep(task.creep));
        
        // Assign creeps to triggered tasks.
        triggeredTasks.filter(task => task.triggerCondition() && !this.e.exists(task.creep)).filter(task => this.findCreepForTask(task, creeps));
    },
    findCreepForTask(task, creeps) {
        const validCreeps = creeps.filter(creep => creep && task.hasBodyParts(creep));
        if (validCreeps.length > 0) {
            
            const creep = validCreeps.map(x => [x, x.pos.getRangeTo(task.destination)])
                .sort((a, b) => a[1] - b[1]).map(x => x[0])
                .find(creep => task.meetsRequirements(creep));

            if (creep != undefined) {
                this.unassignCreep(creep);
                task.assign(creep);
                creeps[creeps.findIndex(x => x == creep)] = undefined;
            } else {
                const newTasks = task.getTasksForRequirements(creep);
                if (newTasks.length > 0) {
                    this.submitTasks(newTasks);
                }
            }
            return true;
        }
        return false;
    },
    handleIdleCreeps: function() {
        let idleCreeps = this.idleCreeps();
        if (idleCreeps.length > 0) {
            idleCreeps.forEach(creep => creep.say("Idle", true));
            const managers = this.ManagerContainer.getAll(this);
            idleCreeps.forEach(creep => managers.some(manager => manager.requestWork(creep)));
        }
    },
    handleActiveTasks: function() {
        const activeTasks = this.activeTasks();
        activeTasks.forEach((task, i) => {
            const isComplete = task.checkIsComplete()
            if (!isComplete && !task.meetsRequirements(task.creep)) {
                task.unassign();
                this.CommuteManager.vacate(task.creep);
            } else if (!isComplete) {
                if (this.CommuteManager.canCommuteTo(task.destination, task.creep)) {
                    this.CommuteManager.commuteTo(task.creep, task.destination);
                } else if (!task.creep.pos.inRangeTo(task.destination, task.range)) {
                    task.creep.moveTo(task.destination);
                }
                if (this.CommuteManager.commuteComplete(task.creep) || task.creep.pos.inRangeTo(task.destination, task.range)) {
                    const result = task.execute();
                    if(result != OK) {
                        task.unassign();
                        this.CommuteManager.vacate(task.creep);
                    }
                }
            } else {
                this.CommuteManager.vacate(task.creep);
                task.creep.say("Complete", true);
            }
        });
    },
    unassignCreep: function(creep) {
        this.tasks.entries.filter(task => task.creep == creep).forEach(task => task.unassign());
    },
    getAndSubmitTask: function(name, options) {
        return this.submitTask(this.getTask(name, options));
    },
    submitTasks: function(tasks) {
        return tasks.filter(x => x).filter(task => this.submitTask(task)).length > 0;
    },
    submitTask: function(task, creep) {
        let created = false;
        if (task != undefined) {
            if (this.meetsThreshold(task)) {
                if (creep && task.meetsRequirements(creep)) {
                    task.assign(creep);
                    this.tasks.entries.push(task);
                    this.newTaskCount++;
                    created = true;
                } else if (!creep) {
                    log("Task Queued", task.name, task.destination);
                    this.tasks.entries.push(task);
                    this.newTaskCount++;
                    created = true;
                }
            }
        }
        return created;
    },
    getTask: function(name, data) {
        const task = this.tasks.create(name, data);
        return task;
    },
    meetsThreshold: function(task) {
        const zone = this.CommuteManager.getSafeZone(task.destination);
        const result = zone == undefined ? !this.tasks.entries.some(x => x.name === task.name && task.destination == x.destination) : !zone.isFull();
        if (result && zone) {
            zone.reserveNextPosition();
        }
        return result;
    },
    triggeredTasks: function() {
        return this.tasks.entries.filter(task => !this.e.exists(task.creep) && task.triggered);
    },
    queuedTasks: function() {
        return this.tasks.entries.filter(task => !this.e.exists(task.creep) && !task.triggered);
    },
    activeTasks: function() {
        return this.tasks.entries.filter(task => this.e.exists(task.creep));
    }
}

module.exports = {
    TaskManager: new TaskManager()
}
