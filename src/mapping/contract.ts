import {CommonHandlerContext, EvmBlock} from '@subsquid/evm-processor'
import {LogItem, TransactionItem} from '@subsquid/evm-processor/lib/interfaces/dataSelection'
import {Store} from '../db'
import {EntityBuffer} from '../entityBuffer'
import {Transfer} from '../model'
import * as spec from '../abi/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'
import {normalize} from '../util'

export {spec}

export const address = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'

type EventItem = LogItem<{evmLog: {topics: true, data: true}, transaction: {hash: true}}>

export function parse(ctx: CommonHandlerContext<Store>, block: EvmBlock, item: EventItem) {
    switch (item.kind) {
        case 'evmLog':
            return parseEvent(ctx, block, item)
    }
}

function parseEvent(ctx: CommonHandlerContext<Store>, block: EvmBlock, item: EventItem) {
    try {
        switch (item.evmLog.topics[0]) {
            case spec.events['Transfer'].topic: {
                let e = normalize(spec.events['Transfer'].decode(item.evmLog))
                EntityBuffer.add(
                    new Transfer({
                        id: item.evmLog.id,
                        blockNumber: block.height,
                        blockTimestamp: new Date(block.timestamp),
                        transactionHash: item.transaction.hash,
                        from: e[0],
                        to: e[1],
                        tokenId: e[2],
                    })
                )
                break
            }
        }
    }
    catch (error) {
        ctx.log.error({error, blockNumber: block.height, blockHash: block.hash, address}, `Unable to decode event "${item.evmLog.topics[0]}"`)
    }
}
