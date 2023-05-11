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
                isOccupied: self => self.occupied || self.terrain == 1 || self.creep.id != undefined || Object.values(Game.structures)
                    .filter(structure => structure.room.name === self.room.name)
                    .some(structure => structure.pos.x == self.x && structure.pos.y == self.y),
                occupy: (self, creep) => self.creep = creep,
                recordPresence: (self, creep) => {
                    if (creep.id != self.lastCreep.id) {
                        self.presence++;
                        self.lastCreep = creep;
                    }
                }
            },
            defaults: {
                occupied: false,
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
                getNextPosition: self => {
                    const position = self.getPositions().find(position => !position.isOccupied())
                    if (position != undefined) {
                        return position.toRoomPosition();
                    }
                },
                isFull: self => self.getNextPosition() == undefined,
                getPositions: self => self.positions.map(value => this.positions.entries.find(position => position.equals(value))),
                getRoomPositions: self => this.positions.entries.filter(position => position.room.name === self.room.name)
            },
            defaults: {
                room: {},
                positions: []
            }
        })
    },
    run: function() {
        this.recordPresence();
        this.handleRoadConstruction();
    },
    getPosition: function(target) {
        if (target.room.name != undefined && target.pos.x != undefined && target.pos.y != undefined) {
            let position = this.positions.entries.find(position => position.x === target.pos.x && position.y === target.pos.y && target.room.name === position.room.name);
            if (position == undefined) {
                position = this.positions.create({ room: target.room, x: target.pos.x, y: target.pos.y, terrain: target.room.getTerrain().get(target.pos.x, target.pos.y) });
                this.positions.entries.push(position);
            }
            return position;
        }
    },
    recordPresence: function() {
        Object.values(Game.creeps).forEach(creep => {
            const position = this.getPosition(creep);
            if (position != undefined) {
                position.recordPresence(creep);
            }
        })
    },
    handleRoadConstruction: function() {
        Object.values(Game.rooms).forEach(room => {
            if (Object.values(Game.constructionSites).find(x => x.structureType === STRUCTURE_ROAD && x.room.name === room.name) == undefined) {
                const position = this.positions.entries.filter(x => !x.isOccupied() && x.presence > ROAD_BUILD_THRESHOLD).sort((a, b) => b.presence - a.presence).find(x => x);
                if (position != undefined) {
                    if(position.toRoomPosition().createConstructionSite(STRUCTURE_ROAD) != OK) {
                        position.occupied = true;
                    }
                }
            }
        });
    }
}

module.exports = {
    CommuteManager: new CommuteManager()
}