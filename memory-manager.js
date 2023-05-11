const { Manager } = require("./manager");

const ID_PATTERN = /[a-f0-9]{15}/;
const NAME_PATTERN = /[A-Z]+\d+[A-Z]+\d+/;

function Entry(name, template, defaults) {
    this.name = name;
    this.template = template;
    this.defaults = defaults;
    this.updateEntry({ ...template, ...defaults });
    this.data = {};
}

Entry.prototype = {
    create: function (data) {
        const entry = new Entry(this.name, this.template, this.defaults);
        entry.data = { ...this.defaults, ...data };
        const completeData = { ...this.template, ...entry.data };
        entry.updateEntry(completeData);
        return entry;
    },
    updateEntry: function(data) {
        const self = this;
        Object.keys(data).forEach(key => {
            const value = data[key];
            this[key] = typeof(value) === "function" ? (...args) => value(self, ...args) : value;
        });
    },
    fromMemory: function (properties, data) {
        return this.create(properties.map((key, i) => ({ [key]: data[i] })).reduce((a, b) => ({...a, ...b}), {}));
    },
    toMemory: function (names, properties) {
        return [names.indexOf(this.name), ...properties.map(key => this[key])];
    },
    properties: function() {
        return Object.keys(this.data);
    }
}

function MemoryManager() {
    Manager.call(this, MemoryManager.name);
    this.collections = {};
    this.ids = [];
}

MemoryManager.prototype = {
    ...Manager.prototype,
    setup: function () {
        if (Memory.collections == undefined) {
            Memory.collections = {};
        }
        if (Memory.ids == undefined) {
            Memory.ids = [];
        }
    },
    clear: function() {
        Memory.collections = {};
        Memory.ids = [];
    },
    load: function () {
        this.setup();
        const memory = Memory.collections;
        this.ids = Memory.ids;
        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            collection.entries = [];
            if (memory[key] == undefined) {
                memory[key] = [];
            }
            const collectionMemory = memory[key];
            if (collectionMemory.length >= 3) {
                collection.properties = collectionMemory[0];
                collection.idIndexes = collectionMemory[1];
                collection.names = collectionMemory[2];
                collection.entries = collectionMemory.slice(3);
                if (collection.alwaysLoad) {
                    collection.load();
                }
            }
        });
    },
    getReference(index) {
        try {
            const value = this.ids[index];
            let reference;
            if (NAME_PATTERN.test(value)) {
                reference = Game.rooms[value];
            } else if (ID_PATTERN.test(value)) {
                reference = Game.getObjectById(value);
            } else {
                reference = JSON.parse(value);
            }
            return reference || {};
        } catch {
            return {};
        }
    },
    save: function () {
        this.setup();
        const ids = [];
        const memory = Memory.collections;
        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            const entries = collection.entries;

            if (entries != undefined && entries.length > 0) {
                const properties = collection.properties.length > 0 ? collection.properties : entries.map(entry => entry.properties())
                    .reduce((a, b) => a.concat(b), [])
                    .filter((x, i, a) => a.indexOf(x) == i);

                const names = collection.names.length > 0 ? collection.names : Object.keys(collection.templates).sort();

                if (properties.length > 0) {
                    const storedValues = entries.filter(entry => Array.isArray(entry));
                    const values = entries.filter(entry => !Array.isArray(entry)).map(entry => entry.toMemory(names, properties));
                    let idIndexes = [];

                    if (values.length > 0) {
                        idIndexes = collection.idIndexes.length > 0 ? collection.idIndexes : values.map(value => value.map((x, i) => [x, i])
                            .filter(x => typeof (x[0]) === "object")
                            .map(x => x[1])).reduce((a, b) => a.concat(b), [])
                            .filter((x, i, a) => a.indexOf(x) === i);
                    }

                    values.forEach(value => {
                        value.map((x, i) => [x, i]).filter((_x, i) => idIndexes.includes(i)).forEach(x => {
                            if (x[0] != undefined) {
                                let mapIndex;
                                if ((x[0].id != undefined || x[0].name != undefined)) {
                                    mapIndex = ids.indexOf(x[0].id || x[0].name);
                                    if (mapIndex === -1) {
                                        ids.push(x[0].id || x[0].name);
                                        mapIndex = ids.length - 1;
                                    }
                                } else if (typeof(x[0]) === "object") {
                                    mapIndex = ids.indexOf(JSON.stringify(x[0]));
                                    if (mapIndex === -1) {
                                        ids.push(JSON.stringify(x[0]));
                                        mapIndex = ids.length - 1;
                                    }
                                }
                                value[x[1]] = mapIndex;
                            }
                        });
                    })

                    memory[key] = [properties, idIndexes, names, ...values, ...storedValues];
                }
            }
        });
        Memory.ids = ids;
    },
    // Registering collections should only happen in the init function.
    register: function (name, alwaysLoad, { template, defaults }) {
        this.collections[name] = new Collection(this, alwaysLoad, template, defaults);
        return this.collections[name];
    }
}

function Collection(memoryManager, alwaysLoad, baseTemplate, baseDefaults) {
    this.alwaysLoad = alwaysLoad;
    this.templates = {};
    this.entries = [];
    this.properties = [];
    this.memoryManager = memoryManager;
    this.names = [];
    this.idIndexes = [];
    this.baseTemplate = baseTemplate;
    this.baseDefaults = baseDefaults;
}

Collection.prototype = {
    create: function (...args) {
        if (args.length == 2) {
            const template = this.templates[args[0]];
            return template.create(args[1]);
        } else if (args.length == 1 && this.templates.single != undefined) {
            return this.templates.single.create(args[0]);
        }
    },
    single: function() {
        this.templates.single = new Entry("single", this.baseTemplate, this.baseDefaults);
        return this;
    },
    load: function(entry) {
        if (entry != undefined) {
            const index = this.entries.findIndex(x => x == entry);
            if (Array.isArray(entry)) {
                const name = this.names[entry[0]];
    
                // Resolve game object ids.
                this.idIndexes.forEach(index => entry[index] = this.memoryManager.getReference(entry[index]));
    
                // Find and load entry.
                const template = this.templates[name];
                if (template != undefined) {
                    const loadedEntry = template.fromMemory(this.properties, entry.slice(1));
                    this.entries[index] = loadedEntry;
                }
            } else {
                return entry;
            }
        } else {
            this.entries.forEach(entry => this.load(entry));
        }
    },
    register: function (data) {
        Object.keys(data).forEach(key => {
            const entry = data[key];
            if (entry != undefined && entry.template != undefined) {
                const template = { ...this.baseTemplate, ...(entry.template || {}) };
                const defaults = { ...this.baseDefaults, ...(entry.defaults || {}) };
                this.templates[key] = new Entry(key, template, defaults);
            }
        });
    }
}

module.exports = {
    MemoryManager: new MemoryManager()
}