import assert from 'assert'

interface Entity {
    id: string
    constructor: {
        name: string
    }
}

export class EntityGenerator {
    /*
     * Maps freeform string keys to arrays of raw blockchain data
     */
    static rawData: Record<string, any[]> = {}
    /*
     * Maps entity names to maps from entity instance ids to entity instances
     */
    static entities: Record<string, Map<string, any>> = {}
    /*
     * Array of entity names in the order in which they have to be processed
     */
    static entityGenerationOrder: string[] = []
    /*
     * Maps entity names to entity generating functions
     * TODO: type the functions
     */
    static entityGenerators: Record<string, any> = {}

    private constructor() {}

    static addGenerationOrder(order: string[]): void {
        /*
         * Any form of toposort merger goes here
         */
        this.entityGenerationOrder.push(...order)
    }

    static addGenerator(entityName: string, generator: any): void {
        assert(this.entityGenerators[entityName] == null)
        this.entityGenerators[entityName] = generator
    }

    static addRawData(key: string, data: any): void {
        let rawDataArray = this.rawData[key]
        if (rawDataArray == null) {
            rawDataArray = this.rawData[key] = []
        }
        rawDataArray.push(data)
    }

    static addEntityInstance<E extends Entity>(e: E) {
        let entityMap = this.entities[e.constructor.name]
        if (entityMap == null) {
            entityMap = this.entities[e.constructor.name] = new Map()
        }
        entityMap.set(e.id, e)
    }

    static async generateAllEntities(store: any): Promise<void> {
        for (let entityName of this.entityGenerationOrder) {
            await this.entityGenerators[entityName](store)
        }
    }

    static clearBatchState(): void {
        this.rawData = {}
        this.entities = {}
    }
}
