const { Manager } = require("./manager");
const { log } = require("./utils");

const MAX_SAVE_ENTRIES = 20;
const REFERENCE_PATTERN = /^#([a-zA-Z]+)/;
const REFERENCE_PROPERTY_FORMAT = property => `#${property}`;

function Entry(e, name, template, defaults) {
    this.e = e;
    this.name = name;
    this.template = template;
    this.defaults = defaults;
    this.updateEntry({
        ...template,
        ...defaults
    });
    this.data = {};
}

Entry.prototype = {
    create: function (data, index) {
        const entry = new Entry(this.e, this.name, this.template, this.defaults);
        entry.index = index || -1;
        entry.data = {
            ...this.defaults,
            ...data
        };
        const completeData = {
            ...this.template,
            ...entry.data
        };
        entry.changed = false;
        entry.updateEntry(completeData);
        return entry;
    },
    updateEntry: function (data) {
        const self = this;
        if (this.__props == undefined) {
            this.__props = {};
        }
        Object.keys(data).forEach(key => {
            let value = data[key];
            this.__props[key] = typeof (value) === "function" ? (...args) => value(self, ...args) : value;
            if (!this.hasOwnProperty(key)) {
                Object.defineProperty(this, key, {
                    get: () => {
                        if (this.stale) {
                            this.stale = false;
                            if (this.e.isEntity(this.__props[key])) {
                                this.__props[key] = this.e.refreshEntity(this.__props[key]);
                            }
                        }
                        return this.__props[key];
                    },
                    set: newValue => {
                        this.changed = true;
                        this.__props[key] = newValue;
                    }
                });
            }
        });
    },
    fromMemory: function (index, properties, data) {
        return this.create(properties.map((key, i) => {
            const isEntity = REFERENCE_PATTERN.test(key);
            const property = isEntity ? REFERENCE_PATTERN.exec(key)[1] : key;
            const value = isEntity ? this.e.getEntityOrId(data[i]) : data[i];
            return {
                [property] : value
            };
        }).reduce((a, b) => ({
            ...a,
            ...b
        }), {}), index);
    },
    toMemory: function (names, properties) {
        return [this.index, names.indexOf(this.name), ...properties.map(key => {
            const isReferenceKey = REFERENCE_PATTERN.test(key);
            const property = isReferenceKey ? REFERENCE_PATTERN.exec(key)[1] : key;
            const isEntity = this.e.isEntity(this[property]);
            if (isReferenceKey != isEntity) {
                this.e.clearCache();
            }
            return isEntity ? this.e.getEntityOrId(this[property]) : this[property];
        })];
    },
    properties: function () {
        const properties = Object.keys(this.data).map(key => this.e.isEntity(this.data[key]) ? REFERENCE_PROPERTY_FORMAT(key) : key);
        return properties;
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
        this.e.clear();
        if (Memory.collections == undefined) {
            Memory.collections = {};
        }
        if (Memory.ids == undefined) {
            Memory.ids = [];
        }
    },
    clear: function () {
        Memory.collections = {};
        this.e.clearCache();
    },
    load: function () {
        this.setup();
        const memory = Memory.collections;
        this.ids = Memory.ids;
        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            if (memory[key] == undefined) {
                memory[key] = [];
            }
            const collectionMemory = memory[key];
            if (collectionMemory.length >= 2) {
                const properties = collectionMemory[0];
                const names = collectionMemory[1];
                collection.entries.push(...collectionMemory.slice(2).filter(entry => !collection.entries.some(x => x.index == entry[0])).map(entry => {
                    const index = entry[0];
                    const name = names[entry[1]];

                    // Find and load entry.
                    const template = collection.templates[name];
                    if (template != undefined) {
                        return template.fromMemory(index, properties, entry.slice(2));
                    }
                }).filter(x => x));
            }
        });
    },
    save: function () {
        this.setup();
        const memory = Memory.collections;
        Object.keys(this.collections).forEach(key => {
            const collection = this.collections[key];
            const resolvedEntries = collection.entries;
            let memoryEntries = memory[key].slice(3);

            if (resolvedEntries != undefined && resolvedEntries.length > 0) {

                // Mark all existing entries as stale if they haven't changed.
                resolvedEntries.forEach(entry => entry.stale = true);

                const properties = this.e.cache(key, "properties", () => {
                    const results = resolvedEntries.map(entry => entry.properties()).reduce((a, b) => a.concat(b), []).filter((x, i, a) => a.indexOf(x) == i);
                    const referenceProperties = results.filter(x => REFERENCE_PATTERN.test(x)).map(x => REFERENCE_PATTERN.exec(x)[1]);
                    return results.filter(x => !referenceProperties.includes(x));
                });
                
                const names = this.e.cache(key, "names", () => Object.keys(collection.templates).sort());

                if (properties.length > 0) {
                    let currentIndex = Math.max(...memoryEntries.map(entry => entry[0]).concat(0));
                    resolvedEntries.filter(entry => entry.index == -1).forEach(entry => {
                        entry.index = ++currentIndex;
                        entry.changed = true;
                    });

                    const newMemoryEntries = resolvedEntries.filter(entry => entry.changed)
                        .slice(0, MAX_SAVE_ENTRIES).map(entry => entry.toMemory(names, properties));

                    if (newMemoryEntries.some(newEntry => newEntry[0] === -1)) {
                        let currentIndex = Math.max(...memoryEntries.map(entry => entry[0]).concat(0));
                        newMemoryEntries.filter(value => value[0] == -1).forEach(value => value[0] = ++currentIndex);
                    }
                    
                    memoryEntries = memoryEntries.filter(entry => !newMemoryEntries.some(value => value[0] == entry[0]));
                    memory[key] = [properties, names, ...memoryEntries, ...newMemoryEntries];
                }
            }
        });
    },
    // Registering collections should only happen in the init function.
    register: function (name, {
        template,
        defaults
    }) {
        this.collections[name] = new Collection(this.e, template, defaults);
        return this.collections[name];
    }
}

function Collection(e, baseTemplate, baseDefaults) {
    this.e = e;
    this.templates = {};
    this.entries = [];
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
    single: function () {
        this.templates.single = new Entry(this.e, "single", this.baseTemplate, this.baseDefaults);
        return this;
    },
    register: function (data) {
        Object.keys(data).forEach(key => {
            const entry = data[key];
            if (entry != undefined && entry.template != undefined) {
                const template = {
                    ...this.baseTemplate,
                    ...(entry.template || {})
                };
                const defaults = {
                    ...this.baseDefaults,
                    ...(entry.defaults || {})
                };
                this.templates[key] = new Entry(this.e, key, template, defaults);
            }
        });
    }
}

module.exports = {
    MemoryManager: new MemoryManager()
}