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
                occupy: (self, creep) => self.creep = creep,
                recordPresence: (self, creep) => {
                    if (creep.id != self.lastCreep.id) {
                        self.presence++;
                        self.lastCreep = creep;
                    }
                }
            },
            defaults: {
                creep: {},
                terrain: 0,
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
                getNextPosition: self => {
                    const position = self.getPositions().find(position => !position.isOccupied())
                    if (position != undefined) {
                        return position.toRoomPosition();
                    }
                },
                isFull: self => self.getNextPosition() == undefined,
                getPositions: self => self.positions.map(index => this.positions.entries[index]),
                getRoomPositions: self => this.positions.entries.filter(position => position.room.name === self.room.name)
            },
            defaults: {
                room: {},
                positions: []
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

                        }
                    }
                },
                defaults: {
                    structureType: TERRAIN_MASK_WALL
                }
            },
            safe: {
                template: {

                }
            }
        });
    },
    run: function() {
        this.recordPresence();
        this.handleRoadConstruction();
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
    getBlock: function(target, structureType, orthogonal) {
        orthogonal = orthogonal != undefined ? orthogonal : true;
        let condition;
        const terrain = target.room.getTerrain();
        if (typeof(structureType) === "number") {
            condition = (pos) => terrain.get(...pos) === structureType;
        } else {
            const roomStructures = this.StructureManager.getStructures().filter(structure => structure.room.name === target.room.name);
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
                            room: target.room
                        }, terrain))
                        .filter(pos => !this.positionInZone(pos)));
                    addedResults = addedResults || results.length != resultsLength; 
                });
            } while(addedResults);
            return results;
        }
        return search([target], orthogonal);
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
                    x: coords.x + (x % size),
                    y: coords.y + (y % size)
                };
                if (position.x !== target.pos.x && position.y !== target.pos.y) {
                    const roomPosition = this.getPosition({
                        room: startingPosition.room,
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