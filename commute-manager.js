const { Manager } = require("./manager");
const { after, stringify } = require("./utils");

function CommuteManager() {
    Manager.call(this, CommuteManager.name);
}

const ROAD_BUILD_THRESHOLD = 100;

// Zone update frequency.
const ZONE_UPDATE_FREQUENCY = 1000;

CommuteManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.positions = this.MemoryManager.register("positions", {
            template: {
                equals: (self, value) => value.x === self.x && value.y === self.y && value.room.name === self.room.name,
                toRoomObject: self => {

                    const value = {
                        room: self.room,
                        pos: new RoomPosition(self.x, self.y, self.room.name)
                    };
                    value.toString = () => value.pos.toString();
                    return value;
                },
                getOccupant: (self, ignoreRoads) => {
                    const structures = ignoreRoads ? this.e.nonRoadStructures : this.e.structures;
                    const entities = structures.concat(this.e.sources);
                    return this.e.exists(self.creep) ? self.creep : entities.find(entity => entity.room === self.room && entity.pos.x == self.x && entity.pos.y == self.y)
                },
                occupy: (self, creep, range) => {
                    self.creep = creep;
                    self.range = range != undefined ? range : 1;
                },
                vacate: self => self.creep = {},
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
                recordAttack: self => self.attacks++,
                isCommuting: self => this.e.exists(self.creep) && (self.creep.pos.x !== self.x || self.creep.pos.y !== self.y)
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
        this.zones = this.MemoryManager.register("zones", {
            template: {
                equal: (self, position) => self.x === position.x && self.y === position.y && self.room === position.room,
                occupyNextPosition: (self, creep) => {
                    const position = self.getNextPosition(true);
                    if (position != undefined) {
                        position.occupy(creep, 0);
                        return position;
                    }
                },
                getNextPosition: (self, ignoreRoads) => self.getPositions().find(position => !position.getOccupant(ignoreRoads)),
                isFull: (self, ignoreReservations) => {
                    const reservations = this.TaskManager.tasks.entries.filter(task => task.destination == self.target).length;
                    const occupiedPositions = self.getPositions().filter(position => position.getOccupant(true));
                    return (self.positions.length - occupiedPositions.length) <= (ignoreReservations ? 0 : reservations);
                }
            },
            transient: {
                getPositions: self => self.positions.map(coords => this.getPosition({
                    pos: {
                        x: coords[0],
                        y: coords[1]
                    },
                    room: self.room
                }, self.room.getTerrain()))
            },
            defaults: {
                room: {},
                positions: [],
                target: {},
                isLocked: false
            }
        });
    },
    afterInit: function() {
        this.zones.register({
            hug: {
                template: {
                    generatePositions: self => {
                        self.positions = [];
                        if (self.target.pos != undefined) {
                            const terrain = self.target.room.getTerrain();
                            const startPosition = this.getPosition(self.target, terrain);
                            let found = false;
                            const ignorePositions = [];
                            let buildPositions = [];
                            while(!found) {
                                found = false;
                                const closestPosition = this.searchForClosest(startPosition, self.structureType, ignorePositions);
                                const orthogonal = self.structureType === STRUCTURE_ROAD ? false : true;
                                const baseBlock = this.getBlock(closestPosition, self.structureType, orthogonal);
                                buildPositions = this.getBlock(baseBlock, 0, false, false).filter(position => position.terrain == 0);
                                buildPositions =  buildPositions.sort((a, b) => a.toRoomObject().pos.getRangeTo(self.target) - b.toRoomObject().pos.getRangeTo(self.target));
                                if (buildPositions.length > 0) {
                                    found = true;
                                } else {
                                    ignorePositions.push(...baseBlock);
                                }
                            }
                            self.positions = this.positionsToZone(buildPositions);
                        }
                    }
                },
                defaults: {
                    structureType: TERRAIN_MASK_WALL
                },
                transient: {
                    getSignature: self => `${self.target.id}${self.structureType}`
                }
            },
            safe: {
                template: {
                    generatePositions: self => self.positions = this.positionsToZone(this.getOpenPositionsByRange(self.target, self.range))
                },
                transient: {
                    getSignature: self => `${self.target.id}${self.range}`
                }
            },
            exits: {
                template: {
                    generatePositions: self => self.positions = this.positionsToZone(this.getExitPositions(self.room))
                },
                transient: {
                    getSignature: self => `${self.room.name}`
                }
            }
        });
    },
    run: function() {
        this.e.rooms.filter(room => room.controller && room.controller.my).forEach(room => {
            this.recordPresence(room);
            this.handleRoadConstruction(room);
            this.generateSafeZones(room);
            this.generateExitPositions(room);
            this.commuteCreeps();
            after(ZONE_UPDATE_FREQUENCY, () => this.updateZones(room));
        });
    },
    commuteCreeps: function() {
        this.positions.entries.filter(position => position.isCommuting()).forEach(position => {
            try {
                position.creep.moveTo(position.toRoomObject().pos);
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
        return position == undefined || !position.isCommuting();
    },
    createZone: function(type, data) {
        const newZone = this.zones.create(type, data);
        const matchingZones = this.zones.entries.filter(zone => zone.getSignature() === newZone.getSignature() && zone.name === newZone.name);
        if (matchingZones.length == 0 || matchingZones.every(zone => !zone.isLocked)) {
            newZone.generatePositions();
            if (newZone.positions.length > 0) {
                this.zones.entries.push(newZone);
                return newZone;
            } else {
                // If the zone has no positions, lock the zone.
                this.zones.entries
                    .filter(zone => zone.name == newZone.name && zone.getSignature() === newZone.getSignature())
                    .forEach(zone => zone.isLocked = true);
            }
        }
    },
    updateZones: function() {
        this.zones.entries.forEach(zone => zone.positions = []);
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
        return positions.map(position => [position.x, position.y]);
    },
    generateSafeZones: function(room) {
        // Generate safe positions for sources, spawns and controllers.
        const newTargets = [
            ...this.e.sources.filter(source => source.room == room), 
            ...this.e.spawns.filter(spawn => spawn.room == room), 
            room.controller
        ].filter(entity => entity && !this.zones.entries.some(zone => zone.name === "safe" && zone.target == entity));

        newTargets.forEach(target => this.createZone("safe", { target, room: target.room, range: target.structureType === STRUCTURE_CONTROLLER ? 2 : 1 }));
    },
    generateExitPositions: function(room) {
        if (this.getZones(room, "exits").length == 0) {
            this.createZone("exits", { room, target: room });
        }
    },
    isPositionValid: function(target) {
        if (target.pos.x != undefined && target.pos.y != undefined) {
            return [target.pos.x, target.pos.y].every(x => x >= 0 && x <= 49);
        }
        return false;
    },
    getPosition: function(target, terrain) {
        if (terrain == undefined) {
            terrain = target.room.getTerrain();
        }
        if (target.room.name != undefined && this.isPositionValid(target)) {
            let position = this.positions.entries.find(position => position.x === target.pos.x && position.y === target.pos.y && target.room.name === position.room.name);
            if (position == undefined) {
                position = this.positions.create({ room: target.room, x: target.pos.x, y: target.pos.y, terrain: terrain.get(target.pos.x, target.pos.y) });
                if (position.terrain != 1) {
                    this.positions.entries.push(position);
                }
            }
            return position;
        }
    },
    getHeatMapPosition(room, weightFunction) {
        const terrain = room.getTerrain();
        const totalWeight = this.positions.entries.map(position => weightFunction(position)).reduce((a, b) => a + b, 0);
        if (totalWeight > 0) {
            const pos = this.positions.entries.map(position => {
                    const weight = weightFunction(position);
                    if (weight > 0) {
                        return new Array(weight).fill([position.x, position.y])
                    }
                })
                .filter(x => x)
                .reduce((a, b) => a.concat(b), [])
                .reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0])
                .map(x => Math.round(x/totalWeight));
            return this.searchForClosestBuildable(this.getPosition({
                pos: {
                    x: pos[0],
                    y: pos[1]
                },
                room
            }, terrain));
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
        }, terrain)).filter(pos => pos && !this.positionInZone(pos));
    },
    recordPresence: function(room) {
        const terrain = {};
        this.e.creeps.filter(creep => creep.room == room).forEach(creep => {
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
    handleRoadConstruction: function(room) {
        if (this.e.constructionSites.find(x => x.structureType === STRUCTURE_ROAD && x.room.name === room.name) == undefined) {
            const position = this.positions.entries.filter(x => !x.getOccupant() && x.presence > ROAD_BUILD_THRESHOLD).sort((a, b) => b.presence - a.presence).find(x => x);
            if (position != undefined) {
                position.toRoomObject().pos.createConstructionSite(STRUCTURE_ROAD);
            }
        }
    },
    positionInZone: function(position) {
        return this.zones.entries.some(zone => zone.positions.some(coord => coord[0] === position.x && coord[1] === position.y) && zone.room == position.room);
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
            const search = (results, orthogonal, checkResults) => {
                checkResults = checkResults || results;
                let addedResults = [];
                checkResults.forEach(item => {
                    addedResults = new Array(orthogonal ? 4 : 8).fill(0)
                        .map((_, i) => [[-1,1,0,0,-1,1,-1,1][i] + item[0], [0,0,-1,1,-1,-1,1,1][i] + item[1]])
                        .filter(pos => !results.some(val => val[0] === pos[0] && val[1] === pos[1]) && condition(pos));
                    results.push(...addedResults);
                });
                return (addedResults.length > 0 && recursive) ? search(results, orthogonal, addedResults) : results.map(pos => this.getPosition({
                    pos: {
                        x: pos[0],
                        y: pos[1]
                    },
                    room: reference.room
                }, terrain)).filter(position => position && !this.positionInZone(position));
            }
            return search(target.map(position => [position.x, position.y]), orthogonal);
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
                    if (roomPosition && roomPosition.isBuildable() && !this.positionInZone(roomPosition)) {
                        positions.push(roomPosition);
                    }
                }
            }
        }
        return positions;
    },
    searchForClosestBuildable: function(target) {
        let found = false;
        let ignorePositions = [];
        let closestPosition;
        while(!found && ignorePositions < 2500) {
            closestPosition = this.searchForClosest(target, 0, ignorePositions);
            console.log(JSON.stringify(closestPosition));
            if (!closestPosition.isBuildable()) {
                ignorePositions.push(closestPosition);
            } else {
                found = true;
            }
        }
        return found && closestPosition;
    },
    searchForClosest: function(target, structureType, ignorePositions) {
        ignorePositions = ignorePositions || [];
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
                    if (roomPosition && !this.positionInZone(roomPosition) && !ignorePositions.some(position => position.equals(roomPosition))) {
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