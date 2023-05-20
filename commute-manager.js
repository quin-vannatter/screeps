const { Manager } = require("./manager");

function CommuteManager() {
    Manager.call(this, CommuteManager.name);
}

const ROAD_BUILD_THRESHOLD = 100;

// Zone update frequency.
const ZONE_UPDATE_FREQUENCY = 10000;

CommuteManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.positions = this.MemoryManager.register("positions", true, {
            template: {
                equals: (self, value) => value.x === self.x && value.y === self.y && value.room.name === self.room.name,
                toRoomPosition: self => new RoomPosition(self.x, self.y, self.room.name),
                getOccupant: (self, ignoreRoads) => {
                    const structures = ignoreRoads ? this.e.nonRoadStructures : this.e.structures;
                    return this.e.exists(self.creep) ? self.creep : structures.find(structure => structure.room.name === self.room.name && structure.pos.x == self.x && structure.pos.y == self.y)
                },
                occupy: (self, creep, range) => {
                    self.creep = creep;
                    self.range = range != undefined ? range : 1;
                },
                vacate: self => {
                    self.creep = {};
                },
                isBuildable: self => {
                    const occupant = self.getOccupant();
                    return self.terrain != TERRAIN_MASK_WALL && (occupant == undefined || occupant.structureType === STRUCTURE_ROAD);
                },
                recordPresence: (self, creep) => {
                    if (creep.id != self.lastCreep.id) {
                        self.presence++;
                        self.lastCreep = creep;
                    }
                },
                recordAttack: self => {
                    self.attacks++;
                },
                isCommuting: self => this.e.exists(self.creep) && (!self.creep.pos.x !== self.x || self.creep.pos.y !== self.y)
            },
            defaults: {
                creep: {},
                terrain: 0,
                room: {},
                x: 0,
                y: 0,
                lastCreep: {}, 
                presence: 0,
                attacks: 0
            }
        }).single();
        this.zones = this.MemoryManager.register("zones", true, {
            template: {
                equal: (self, position) => self.x === position.x && self.y === position.y && self.room.name === position.room.name,
                occupyNextPosition: (self, creep) => {
                    const position = self.getNextPosition(true);
                    if (position != undefined) {
                        position.occupy(creep, 0);
                        return position;
                    }
                },
                reserveNextPosition: self => self.reservations++,
                getNextPosition: (self, ignoreRoads) => {
                    const position = self.getPositions().find(position => !position.getOccupant(ignoreRoads));
                    return position;
                },
                isFull: (self, ignoreReservations) => {
                    const reservations = this.TaskManager.tasks.entries.filter(task => task.destination == self.target).length;
                    const occupiedPositions = self.getPositions().filter(position => position.getOccupant(true));
                    return (self.positions.length - occupiedPositions.length) <= (ignoreReservations ? 0 : reservations);
                },
                getPositions: self => self.positions.map(index => this.positions.entries[index])
            },
            defaults: {
                room: {},
                positions: [],
                target: {}
            }
        })
    },
    afterInit: function() {
        this.zones.register({
            hug: {
                template: {
                    generatePositions: (self, target, structureType) => {
                        if (structureType) {
                            self.structureType = structureType;
                        }
                        if (target.pos != undefined) {
                            self.target = target;
                            const terrain = target.room.getTerrain();
                            const startPosition = this.getPosition(target, terrain);
                            const closestPosition = this.searchForClosest(startPosition, self.structureType);
                            const orthogonal = structureType === STRUCTURE_ROAD ? false : true;
                            const baseBlock = this.getBlock(closestPosition, self.structureType, orthogonal);
                            let buildPositions = this.getBlock(baseBlock, 0, false, false).filter(position => position.terrain == 0);
                            buildPositions =  buildPositions.sort((a, b) => a.toRoomPosition().getRangeTo(target) - b.toRoomPosition().getRangeTo(target));
                            self.positions = this.positionsToZone(buildPositions);
                        }
                    }
                },
                defaults: {
                    structureType: TERRAIN_MASK_WALL
                }
            },
            safe: {
                template: {
                    generatePositions: (self, target, range) => {
                        self.positions = this.positionsToZone(this.getOpenPositionsByRange(target, range));
                        self.target = target;
                    }
                }
            },
            exits: {
                template: {
                    generatePositions: (self, target) => {
                        self.positions = this.positionsToZone(this.getExitPositions(target));
                        self.target = target;
                    } 
                }
            }
        });
    },
    run: function() {
        this.recordPresence();
        this.handleRoadConstruction();
        this.generateSafeZones();
        this.generateExitPositions();
        this.commuteCreeps();
        if (!(Game.time % ZONE_UPDATE_FREQUENCY)) {
            this.updateZones();
        }
    },
    commuteCreeps: function() {
        this.positions.entries.filter(position => position.isCommuting()).forEach(position => {
            try {
                position.creep.moveTo(position.toRoomPosition());
            } catch {
                position.vacate();
            }
        });
        // Move creeps standing in occupied spots
        this.positions.entries.filter(position => this.e.exists(position.creep)).forEach(position => {
            const creep = this.e.creeps.find(creep => creep.room.name === position.room.name && creep.pos.x === position.x && creep.pos.y === position.y && position.creep.id !== creep.id);
            if (creep != undefined) {
                creep.moveTo(Math.floor(50 * Math.random()), Math.floor(50 * Math.random()));
            }
        })
    },
    commuteTo: function(creep, target) {
        const zone = this.zones.entries.find(zone => zone.target == target);
        const alreadyAssigned = this.zones.entries.some(zone => zone.target == target && zone.getPositions().some(position => position.creep == creep));
        if (zone != undefined && !alreadyAssigned) {
            if (!zone.isFull(true)) {
                this.vacate(creep);
                zone.occupyNextPosition(creep);
            }
        }
    },
    canCommuteTo: function(target, creep) {
        const zone = this.zones.entries.find(zone => zone.target == target);
        return zone != undefined && (!zone.isFull(true) || zone.getPositions().some(position => position.creep == creep));
    },
    commuteComplete: function(creep) {
        const position = this.positions.entries.find(position => position.creep == creep);
        return position != undefined && !position.isCommuting();
    },
    createZone: function(type, ...args) {
        const newZone = this.zones.create(type, {});
        newZone.generatePositions(...args);
        this.zones.entries.push(newZone);
        return newZone;
    },
    updateZones: function() {
        this.zones.entries.forEach(zone => zone.generatePositions());
    },
    getZones: function(target, type) {
        return this.zones.entries.filter(zone => zone.target == target && zone.name == type);
    },
    getSafeZone: function(target) {
        const zones = this.getZones(target, "safe");
        if (zones.length > 0) {
            return zones[0];
        }
    },
    vacate: function(creep) {
        this.positions.entries
            .filter(position => position.creep == creep)
            .forEach(position => position.vacate());
    },
    positionsToZone: function(positions) {
        return positions.map(position => this.positions.entries.findIndex(entry => entry == position));
    },
    generateSafeZones: function() {
        // Generate safe positions for sources, spawns and controllers.
        const newTargets = this.e.rooms.map(room => [...this.e.sources, ...this.e.spawns, room.controller])
            .reduce((a, b) => a.concat(b), [])
            .filter(entity => !this.zones.entries.some(zone => zone.name === "safe" && zone.target == entity));

        const newZones = newTargets.map(target => {
            const zone = this.zones.create("safe", {});
            zone.generatePositions(target, target.structureType === STRUCTURE_CONTROLLER ? 2 : 1);
            return zone;
        });
        this.zones.entries.push(...newZones);
    },
    generateExitPositions: function() {
        const newRooms = this.e.rooms.filter(room => this.getZones(room, "exits").length == 0);
        const newZones = newRooms.map(target => {
            const zone = this.zones.create("exits", {});
            zone.generatePositions(target);
            return zone;
        });
        this.zones.entries.push(...newZones);
    },
    getPosition: function(target, terrain) {
        if (terrain == undefined) {
            terrain = target.room.getTerrain();
        }
        if (target.room.name != undefined && target.pos.x != undefined && target.pos.y != undefined) {
            let position = this.positions.entries.find(position => position.x === target.pos.x && position.y === target.pos.y && target.room.name === position.room.name);
            if (position == undefined) {
                position = this.positions.create({ room: target.room, x: target.pos.x, y: target.pos.y, terrain: terrain.get(target.pos.x, target.pos.y) });
                this.positions.entries.push(position);
            }
            return position;
        }
    },
    getExitPositions: function(room) {
        const terrain = room.getTerrain();
        const coords = Array(50).fill(0).map((_, i) => [[0, i], [49, i], [i, 0], [1, 49]]).reduce((a, b) => a.concat(b), [])
            .filter(coord => terrain.get(...coord) === 0);
        return coords.map(pos => this.getPosition({
            pos: {
                x: pos[0],
                y: pos[1]
            },
            room
        }, terrain));
    },
    recordPresence: function() {
        const terrain = {};
        this.e.creeps.forEach(creep => {
            if (terrain[creep.room.name] == undefined) {
                terrain[creep.room.name] = creep.room.getTerrain();
            }
            const position = this.getPosition(creep, terrain[creep.room.name]);
            if (position != undefined) {
                position.recordPresence(creep);
            }
        })
    },
    recordAttack: function(creep) {
        const position = this.getPosition(creep);
        if (position != undefined) {
            position.attacks++;
        }
    },
    handleRoadConstruction: function() {
        this.e.rooms.forEach(room => {
            if (this.e.constructionSites.find(x => x.structureType === STRUCTURE_ROAD && x.room.name === room.name) == undefined) {
                const position = this.positions.entries.filter(x => !x.getOccupant() && x.presence > ROAD_BUILD_THRESHOLD).sort((a, b) => b.presence - a.presence).find(x => x);
                if (position != undefined) {
                    position.toRoomPosition().createConstructionSite(STRUCTURE_ROAD);
                }
            }
        });
    },
    positionInZone: function(position) {
        return this.zones.entries.find(zone => zone.getPositions().some(x => x.equals(position)));
    },
    getBlock: function(target, structureType, orthogonal, recursive) {
        orthogonal = orthogonal != undefined ? orthogonal : true;
        recursive = recursive != undefined ? recursive : true;
        target = [].concat(target);
        if (target.length > 0) {
            const reference = target[0];
            let condition;
            const terrain = reference.room.getTerrain();
            if (typeof(structureType) === "number") {
                condition = pos => terrain.get(...pos) === structureType;
            } else {
                const roomStructures = this.e.structures.filter(structure => structure.room.name === reference.room.name);
                condition = pos => {
                    const structure = roomStructures.find(x => x.pos.x === pos[0] && x.pos.y === pos[1]);
                    return structure != undefined && structure.structureType === structureType;
                }
            }
            const search = (results, orthogonal) => {
                let addedResults = false;
                do {
                    addedResults = false;
                    let resultsLength = results.length;
                    results.forEach(item => {
                        results.push(...new Array(orthogonal ? 4 : 8).fill(0)
                            .map((_, i) => [[-1,1,0,0,-1,1,-1,1][i] + item.x, [0,0,-1,1,-1,-1,1,1][i] + item.y])
                            .filter(pos => !results.some(val => val.x === pos[0] && val.y === pos[1]) && condition(pos))
                            .map(pos => this.getPosition({
                                pos : {
                                    x: pos[0],
                                    y: pos[1]
                                },
                                room: reference.room
                            }, terrain))
                            .filter(pos => !this.positionInZone(pos)));
                        addedResults = addedResults || results.length != resultsLength; 
                    });
                } while(recursive && addedResults);
                return results;
            }
            return search(target, orthogonal);
        }
    },
    getOpenPositionsByRange: function(target, range) {
        range = Math.max(Math.min(range || 1, 25), 1);
        const terrain = target.room.getTerrain();
        const positions = [];
        for (let i = 1; i <= range; i++) {
            const coords = {
                x: target.pos.x - i,
                y: target.pos.y - i
            }
            const size = i * 2 + 1;
            for(let h = 0; h < size * size; h++) {
                const position = {
                    x: coords.x + (h % size),
                    y: coords.y + Math.floor(h / size)
                };
                if (!(position.x == target.pos.x && position.y == target.pos.y)) {
                    const roomPosition = this.getPosition({
                        room: target.room,
                        pos: position
                    }, terrain);
                    if (roomPosition.isBuildable() && !this.positionInZone(roomPosition)) {
                        positions.push(roomPosition);
                    }
                }
            }
        }
        return positions;
    },
    searchForClosest: function(target, structureType) {
        const terrain = target.room.getTerrain();
        let range = 1;
        while(range < 25) {
            const coords = {
                x: target.x - range,
                y: target.y - range
            }
            const size = range * 2 + 1;
            for (let i = 0; i < size * size; i++) {
                const position = {
                    x: coords.x + (i % size),
                    y: coords.y + Math.floor(i / size)
                };
                if (position.x !== target.x && position.y !== target.y) {
                    const roomPosition = this.getPosition({
                        room: target.room,
                        pos: position
                    }, terrain);
                    if (!this.positionInZone(roomPosition)) {
                        if (typeof(structureType) === "number") {
                            if (roomPosition.terrain === structureType) {
                                return roomPosition;
                            }
                        } else {
                            const occupant = roomPosition.getOccupant();
                            if (occupant != undefined && occupant instanceof Structure && occupant.structureType == structureType) {
                                return roomPosition;
                            }
                        }
                    }
                }
            }
            range++;
        }
    }
}

module.exports = {
    CommuteManager: new CommuteManager()
}