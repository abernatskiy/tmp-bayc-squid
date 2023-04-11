import {EvmBatchProcessor, BatchHandlerContext} from '@subsquid/evm-processor'
import {lookupArchive} from '@subsquid/archive-registry'
import {contract} from './mapping'
import {db, Store} from './db'
import {EntityBuffer} from './entityBuffer'

const processor = new EvmBatchProcessor()
processor.setDataSource({
    archive: lookupArchive('eth-mainnet', {type: 'EVM'}),
})
processor.addLog(contract.address, {
    filter: [
        [
            contract.spec.events['Transfer'].topic,
        ],
    ],
    data: {
        evmLog: {
            topics: true,
            data: true,
        },
        transaction: {
            hash: true,
            from: true,
        },
    } as const,
    range: {
        from: 12287507
    },
})

processor.run(db, async (ctx: BatchHandlerContext<Store, any>) => {
    for (let {header: block, items} of ctx.blocks) {
        for (let item of items) {
            if (item.address === contract.address) {
                contract.parse(ctx, block, item)
            }
        }
    }
    for (let entities of EntityBuffer.flush()) {
        await ctx.store.insert(entities)
    }
})
