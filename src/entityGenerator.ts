import assert from 'assert'
import * as model from './model'

const entityClasses: Record<string, any> = model

interface Entity {
    id: string
    constructor: {
        name: string
    }
}

export interface EntityGenerationParams {
	name: string
	generator: (ctx?: any) => Promise<any[]>
	persistWith: 'save' | 'insert'
	extender?: (partialEntities: any[], ctx?: any) => Promise<Entity[]>
}

export class EntityGenerator {
    /*
     * Maps freeform string keys to raw blockchain data
     */
    static rawData: Record<string, any> = {}
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
        assert(Array.isArray(rawDataArray), 'attempt to add data to a scalar field failed')
        rawDataArray.push(data)
    }

    static setRawData(key: string, data: any): void {
        assert(!Array.isArray(this.rawData[key]), 'attempt to set to a vector field to a scalar value failed')
        this.rawData[key] = data
    }

    static addEntityInstance<E extends Entity>(e: E) {
        let entityMap = this.entities[e.constructor.name]
        if (entityMap == null) {
            entityMap = this.entities[e.constructor.name] = new Map()
        }
        entityMap.set(e.id, e)
    }

    static async generateAllEntities(ctx: any): Promise<void> {
        for (let genParams of this.entityGenerationOrder) {
            // Objects that contain the fields of the entity class that
            // are retrieved directly from the processor
            let partials = await genParams.generator(ctx)

            // Objects that contain all the fields of the entity class,
            // including possibly those received from IPFS, state calls,
            // external APIs etc
            let completes: {id: string}[]
            if (genParams.extender) {
                // Can be optimized by only extending the partials that
                // have missing fields. Keeping it simple for the moment.
                completes = await genParams.extender(partials, ctx)
            }
            else {
                completes = partials
            }

            // Generating and saving the entities proper
            completes.forEach(args => {
                let newEntity: any = new entityClasses[genParams.name](args)
                this.addEntityInstance(newEntity)
            })
            await ctx.store[genParams.persistWith]([...this.entities[genParams.name].values()])
        }
    }

    static clearBatchState(): void {
        this.rawData = {}
        this.entities = {}
    }
}
