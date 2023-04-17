import assert from 'assert'
import * as model from './model'

interface Entity {
    id: string
    constructor: {
        name: string
    }
}

export interface EntityGenerationParams {
	name: keyof typeof model
	generator: (store?: any) => Promise<any[]>
	persistWith: 'save' | 'insert'
	extender?: (partialEntities: any[], store?: any) => Promise<Entity[]>
}

export class EntityGenerator {
    /*
     * Maps freeform string keys to arrays of raw blockchain data
     */
    static rawData: Record<string, any[]> = {}
    /*
     * Maps entity names to maps from entity instance IDs to entity instances
     */
    static entities: Record<string, Map<string, any>> = {}
    /*
     * Array of entity generation params in the order in which the entities have to be processed
     */
    private static entityGenerationOrder: EntityGenerationParams[] = []

    private constructor() {}

    static setGenerationOrder(order: EntityGenerationParams[]): void {
        this.entityGenerationOrder = order
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
        for (let genParams of this.entityGenerationOrder) {
            // Objects that contain the fields of the entity class that
            // are retrieved directly from the processor
            let partials = await genParams.generator(store)

            // Objects that contain all the fields of the entity class,
            // including possibly those received from IPFS, state calls,
            // external APIs etc
            let completes: {id: string}[]
            if (genParams.extender) {
                // Can be optimized by only extending the partials that
                // have missing fields. Keeping it simple for the moment.
                completes = await genParams.extender(partials, store)
            }
            else {
                completes = partials
            }

            // Generating and saving the entities proper
            completes.forEach(args => {
                this.addEntityInstance(new model[genParams.name](args))
            })
            await store[genParams.persistWith]([...this.entities[genParams.name].values()])
        }
    }

    static clearBatchState(): void {
        this.rawData = {}
        this.entities = {}
    }
}
