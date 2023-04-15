import {CommonHandlerContext, EvmBlock} from '@subsquid/evm-processor'
import {LogItem, TransactionItem} from '@subsquid/evm-processor/lib/interfaces/dataSelection'
import {Store} from '../db'
import {EntityGenerator} from '../entityGenerator'
import {Owner, Token, Transfer} from '../model'
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
                EntityGenerator.addRawData('transferEvents', {
                    id: item.evmLog.id,
                    blockNumber: block.height,
                    blockTimestamp: new Date(block.timestamp),
                    transactionHash: item.transaction.hash,
                    from: e[0],
                    to: e[1],
                    tokenId: e[2],
                })
                break
            }
        }
    }
    catch (error) {
        ctx.log.error({error, blockNumber: block.height, blockHash: block.hash, address}, `Unable to decode event "${item.evmLog.topics[0]}"`)
    }
}

export function addAllEntityGenerators() {
    EntityGenerator.addGenerator('Owner', generatorOfOwners)
    EntityGenerator.addGenerator('Token', generatorOfTokens)
    EntityGenerator.addGenerator('Transfers', generatorOfTransfers)
    EntityGenerator.addGenerationOrder(['Owner', 'Token', 'Transfers'])
}


async function generatorOfOwners(store: any) {
    let rawTransfers = EntityGenerator.rawData['transferEvents']
    let ownerIds = rawTransfers.map(re => re.from).concat(
        rawTransfers.map(re => re.to)
    )
    let ownerIdsSet = new Set(ownerIds)

    ownerIdsSet.forEach(id => {
        EntityGenerator.addEntityInstance(new Owner({id}))
    })

    await store.save([...EntityGenerator.entities['Owner'].values()])
}

async function generatorOfTokens(store: any) {
    let rawTransfers = EntityGenerator.rawData['transferEvents']
    rawTransfers.forEach(t => {
        EntityGenerator.addEntityInstance(new Token({
            id: `${t.tokenId}`,
            tokenId: t.tokenId,
            owner: EntityGenerator.entities['Owner'].get(t.to)
        }))
    })

    await store.save([...EntityGenerator.entities['Token'].values()])
}

async function generatorOfTransfers(store: any) {
    let rawTransfers = EntityGenerator.rawData['transferEvents']
    rawTransfers.forEach(t => {
        EntityGenerator.addEntityInstance(new Transfer({
            id: t.id,
            blockNumber: t.blockNumber,
            blockTimestamp: t.blockTimestamp,
            transactionHash: t.transactionHash,
            from: EntityGenerator.entities['Owner'].get(t.from),
            to: EntityGenerator.entities['Owner'].get(t.to),
            token: EntityGenerator.entities['Token'].get(t.tokenId)
        }))
    })

    await store.insert([...EntityGenerator.entities['Transfer'].values()])
}


