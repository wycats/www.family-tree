import Service from '@ember/service';

export default class GeneaService extends Service {
    _roots = null;
    _people = {};
    _partnerships = {};

    isPopulated() {
        return this._roots !== null;
    }

    async populate() {
        if (this._roots === null) {
            let rootsFetch = await fetch('/api/v1/roots.json');
            let { data, included } = await rootsFetch.json();

            this._roots = new Roots(this, data.attributes, data.relationships);
            for (let object of included) {
                switch (object.type) {
                    case "person":
                        this._people[object.id] = new Person(this, object.id, object.attributes, object.relationships);
                        break;

                    case "partnership":
                        this._partnerships[object.id] = new Partnership(this, object.id, object.attributes, object.relationships);
                        break;

                    default:
                        throw new Error(`unexpected type of object ${object.type}`);
                }
            }
        }
    }

    _getPerson(id) {
        const p = this._people[id];
        if (p === undefined) {
            throw new Error(`no person defined with id ${id}`);
        }
        return p;
    }

    _person(r) {
        if (r === null) {
            return null;
        }
        if (r.type !== "person") {
            throw new Error(`unexpected reference to have type "person": ${JSON.stringify(r)} `);
        }
        return this._getPerson(r.id);
    }

    _partnership(r) {
        if (r === null) {
            return null;
        }
        if (r.type !== "partnership") {
            throw new Error(`unexpected reference to have type "partnership": ${JSON.stringify(r)} `);
        }
        return this._partnerships[r.id];
    }

    roots() {
        if (!this.isPopulated()) {
            throw new Error("genea not populated");
        }
        return this._roots;
    }

    person(id) {
        if (!this.isPopulated()) {
            throw new Error("genea not populated");
        }
        return this._getPerson(id);
    }
}

export class Roots {
    constructor(genea, attributes, relationships) {
        this._genea = genea;
        this._attributes = attributes;
        this._relationships = relationships;
    }

    get rootPeople() {
        return this._relationships.rootPeople.data.map(r => this._genea._person(r))
    }
}


export class Person {
    constructor(genea, id, attributes, relationships) {
        this._genea = genea;
        this.id = id;
        this._attributes = attributes;
        this._relationships = relationships;
    }

    get name() {
        return this._attributes.name;
    }

    get comments() {
        return this._attributes.comments;
    }

    get isSpouse() {
        return this._attributes.isSpouse;
    }

    /// Spouses or other partners
    get partners() {
        return this.parentIn.flatMap(partnership => partnership.partnersTo(this));
    }

    /// Relationship in which this person is a child, or null.
    get childIn() {
        return this._genea._partnership(this._relationships.childIn.data);
    }

    /// Array of relationships in which this person is a parent (or partner).
    get parentIn() {
        return this._relationships.parentIn.data.map(r => this._genea._partnership(r));
    }

    childInArray() {
        return (this.childIn ? [this.childIn] : []);
    }

    /// Returns a list of the closest ancestors between `this` and `person`.
    commonAncestralPartnershipsWith(person) {
        let myAncestors = this.ancestralPartnerships();

        let queue = person.childInArray();
        let visited = new Set(queue);
        let result = [];

        // Walk the ancestors of `person` in breadth-first
        // order, looking for those that appear in `
        while (queue.length) {
            let partnership = queue.shift();

            if (myAncestors.has(partnership)) {
                result.push(partnership);
                continue;
            }

            if (partnership.parentSet.has(this)) {
                result.push(partnership);
                continue;
            }

            for (let parentPartnership of partnership.parents.flatMap(p => p.childInArray())) {
                if (!visited.has(parentPartnership)) {
                    visited.add(parentPartnership);
                    queue.push(parentPartnership);
                }
            }
        }

        for (let ancestor of myAncestors) {
            if (ancestor.parentSet.has(person)) {
                result.push(ancestor);
            }
        }

        return result;
    }

    /// Returns a set of all partnerships involving this person or an ancestor of this person.
    ancestralPartnerships() {
        let stack = this.childInArray();
        let visited = new Set(stack);

        while (stack.length) {
            let partnership = stack.pop();
            for (let parentPartnership of partnership.parents.flatMap(p => p.childInArray())) {
                if (!visited.has(parentPartnership)) {
                    visited.add(parentPartnership);
                    stack.push(parentPartnership);
                }
            }
        }

        return visited;
    }

    /// Return a set of all ancestors
    allAncestors() {
        return new Set(Array.from(this.ancestralPartnerships()).flatMap(p => p.parents));
    }
}

export class Partnership {
    constructor(genea, id, attributes, relationships) {
        this._genea = genea;
        this.id = id;
        this._attributes = attributes;
        this._relationships = relationships;
    }

    get children() {
        return this._relationships.children.data.map(r => this._genea._person(r));
    }

    get parents() {
        return this._relationships.parents.data.map(r => this._genea._person(r));
    }

    get parentSet() {
        return new Set(this.parents);
    }

    get firstParent() {
        return this.parents[0];
    }

    get nextParents() {
        return this.parents.slice(1);
    }

    partnerTo(person) {
        return this.parents.find(p => p.id !== person.id);
    }

    partnersTo(person) {
        return this.parents.filter(p => p.id !== person.id);
    }
}