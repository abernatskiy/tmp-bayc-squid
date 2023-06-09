import {EvmBatchProcessor, BatchHandlerContext} from '@subsquid/evm-processor'
import {lookupArchive} from '@subsquid/archive-registry'
import {contract} from './mapping'
import {db, Store} from './db'
import {EntityGenerator} from './entityGenerator'

const processor = new EvmBatchProcessor()
processor.setDataSource({
    archive: lookupArchive('eth-mainnet', {type: 'EVM'}),
    // replace with a private endpoint for better performance
    chain: 'https://rpc.ankr.com/eth'
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

contract.addAllEntityGenerators()

processor.run(db, async (ctx: BatchHandlerContext<Store, any>) => {
    for (let {header: block, items} of ctx.blocks) {
        for (let item of items) {
            if (item.address === contract.address) {
                contract.parse(ctx, block, item)
            }
        }
    }

    await EntityGenerator.generateAllEntities(ctx)
    EntityGenerator.clearBatchState()
})
