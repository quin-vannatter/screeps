const { Manager } = require("./manager");

function CommuteManager() {
    Manager.call(this, CommuteManager.name);
}

const ROAD_BUILD_THRESHOLD = 100;

CommuteManager.prototype = {
    ...Manager.prototype,
    init: function() {
        this.positions = this.MemoryManager.register("positions", true, {
            template: {
                equals: (self, value) => value.x === self.x && value.y === self.y && value.room.name === self.room.name,
                toRoomPosition: self => new RoomPosition(self.x, self.y, self.room.name),
                getOccupant: self => self.creep.id != undefined ? self.creep : this.StructureManager.getStructures()
                    .find(structure => structure.room.name === self.room.name && structure.pos.x == self.x && structure.pos.y == self.y),
                occupy: (self, creep, range) => {
                    self.creep = creep;
                    self.range = range || 1;
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
                isCommuting: self => self.creep.id != undefined && !self.creep.pos.inRangeTo(self.toRoomPosition(), self.range)
            },
            defaults: {
                creep: {},
                terrain: 0,
                range: 1,
                room: {},
                x: 0,
                y: 0,
                lastCreep: {}, 
                presence: 0
            }
        }).single();
        this.zones = this.MemoryManager.register("zones", true, {
            template: {
                equal: (self, position) => self.x === position.x && self.y === position.y && self.room.name === position.room.name,
                occupyNextPosition: (self, creep) => {
                    const position = self.getPositions().find(position => {
                        const occupant = position.getOccupant();
                        return occupant == undefined || occupant.structureType === STRUCTURE_ROAD;
                    })
                    if (position != undefined) {
                        position.occupy(creep);
                        return position.toRoomPosition();
                    }
                },
                isFull: self => !self.getPositions().some(position => {
                    const occupant = position.getOccupant();
                    return occupant == undefined || occupant.structureType == STRUCTURE_ROAD;
                }),
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
                            const startPosition = this.getPosition(target);
                            const closestPosition = this.searchForClosest(startPosition, self.structureType);
                            const orthogonal = structureType === STRUCTURE_ROAD ? false : true;
                            const baseBlock = this.getBlock(closestPosition, self.structureType, orthogonal);
                            let buildPositions = this.getBlock(baseBlock, 0, false, false);
                            buildPositions =  buildPositions.sort((a, b) => a.toRoomPosition().getRangeTo(startPosition) - b.toRoomPosition().getRangeTo(startPosition));
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
            }
        });
    },
    run: function() {
        this.recordPresence();
        this.handleRoadConstruction();
        this.generateSafeZones();
        this.commuteCreeps();
    },
    commuteCreeps: function() {
        this.positions.entries.filter(position => position.isCommuting()).forEach(position => {
            position.creep.moveTo(position.toRoomPosition());
        });
    },
    commuteTo: function(creep, target, range) {
        const zone = this.zones.entries.find(zone => zone.target == target);
        const alreadyAssigned = this.zones.entries.some(zone => zone.target == target && zone.getPositions().some(position => position.creep.id == creep.id));
        if (creep.id === "25ca66c8c5d454e") {
            console.log(JSON.stringify(zone.getPositions()));
        }
        if (zone != undefined && !alreadyAssigned) {
            if (!zone.isFull()) {
                this.vacate(creep);
                zone.occupyNextPosition(creep);
            }
        } else if (!alreadyAssigned) {
            const terrain = target.room.getTerrain();
            const position = this.getPosition(target, terrain);
            if (position.getOccupant() == undefined) {
                this.vacate(creep);
                position.occupy(creep, range);
            }
        }
    },
    canCommuteTo: function(target) {
        const terrain = target.room.getTerrain();
        const zone = this.zones.entries.find(zone => zone.target == target);
        if (zone == undefined) {
            const occupant = this.getPosition(target, terrain).getOccupant();
            return occupant == undefined || occupant.structureType == STRUCTURE_ROAD;
        } else {
            return !zone.isFull()
        }
    },
    commuteComplete: function(creep) {
        const position = this.positions.entries.find(position => position.creep.id === creep.id);
        return position != undefined && !position.isCommuting();
    },
    vacate: function(creep) {
        this.positions.entries
            .filter(position => position.creep.id === creep.id)
            .forEach(position => position.vacate());
    },
    positionsToZone: function(positions) {
        return positions.map(position => this.positions.entries.findIndex(entry => entry == position));
    },
    generateSafeZones: function() {
        // Generate safe positions for sources, spawns and controllers.
        const newTargets = Object.values(Game.rooms).map(room => [...room.find(FIND_SOURCES), ...room.find(FIND_MY_SPAWNS), room.controller])
            .reduce((a, b) => a.concat(b), [])
            .filter(entity => !this.zones.entries.some(zone => zone.name === "safe" && zone.target.id === entity.id));

        const newZones = newTargets.map(target => {
            const zone = this.zones.create("safe", {});
            zone.generatePositions(target, target.structureType === STRUCTURE_CONTROLLER ? 3 : 1);
            return zone;
        });
        this.zones.entries.push(...newZones);
    },
    getPosition: function(target, terrain) {
        if (target.room.name != undefined && target.pos.x != undefined && target.pos.y != undefined) {
            let position = this.positions.entries.find(position => position.x === target.pos.x && position.y === target.pos.y && target.room.name === position.room.name);
            if (position == undefined) {
                position = this.positions.create({ room: target.room, x: target.pos.x, y: target.pos.y, terrain: terrain.get(target.pos.x, target.pos.y) });
                this.positions.entries.push(position);
            }
            return position;
        }
    },
    recordPresence: function() {
        const terrain = {};
        Object.values(Game.creeps).forEach(creep => {
            if (terrain[creep.room.name] == undefined) {
                terrain[creep.room.name] = creep.room.getTerrain();
            }
            const position = this.getPosition(creep, terrain[creep.room.name]);
            if (position != undefined) {
                position.recordPresence(creep);
            }
        })
    },
    handleRoadConstruction: function() {
        Object.values(Game.rooms).forEach(room => {
            if (Object.values(Game.constructionSites).find(x => x.structureType === STRUCTURE_ROAD && x.room.name === room.name) == undefined) {
                const position = this.positions.entries.filter(x => !x.getOccupant() && x.presence > ROAD_BUILD_THRESHOLD).sort((a, b) => b.presence - a.presence).find(x => x);
                if (position != undefined) {
                    position.toRoomPosition().createConstructionSite(STRUCTURE_ROAD);
                }
            }
        });
    },
    positionInZone: function(position) {
        return this.zones.entries.some(zone => zone.getPositions().some(x => x.equals(position)))
    },
    getBlock: function(target, structureType, orthogonal, recursive) {
        orthogonal = orthogonal != undefined ? orthogonal : true;
        recursive = recursive != undefined ? recursive : true;
        target = [].concat(target);
        if (target.length > 0) {
            const reference = target[0];
            let condition;
            const terrain = target.room.getTerrain();
            if (typeof(structureType) === "number") {
                condition = (pos) => terrain.get(...pos) === structureType;
            } else {
                const roomStructures = this.StructureManager.getStructures().filter(structure => structure.room.name === reference.room.name);
                condition = (pos) => {
                    const structure = roomStructures.find(x => x.pos.x === pos[0] && x.pos.y === pos[1]);
                    return structure != undefined && structure.structureType === structureType;
                }
            }
            const search = (results, orthogonal) => {
                let addedResults = false;
                do {
                    let resultsLength = results.length;
                    results.forEach(item => {
                        results.push(...new Array(orthogonal ? 4 : 8).fill(0)
                            .map((_, i) => [[-1,1,0,0,-1,1,-1,1][i] + item.x, [0,0,-1,1,-1,-1,1,1][i] + item.y])
                            .filter(pos => !results.some(val => val.x === pos.x && val.y === pos.y) && condition(pos))
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
        const coords = {
            x: target.pos.x - range,
            y: target.pos.y - range
        }
        const positions = [];
        for (let i = 1; i <= range; i++) {
            const size = i * 2 + 1;
            for(let h = 0; h < size * size; h++) {
                const position = {
                    x: coords.x + (h % size),
                    y: coords.y + Math.floor(h / size)
                };
                if (position.x !== target.pos.x && position.y !== target.pos.y) {
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
                x: target.pos.x - range,
                y: target.pos.y - range
            }
            const size = range * 2 + 1;
            for (let i = 0; i < size * size; i++) {
                const position = {
                    x: coords.x + (i % size),
                    y: coords.y + Math.floor(i / size)
                };
                if (position.x !== target.pos.x && position.y !== target.pos.y) {
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