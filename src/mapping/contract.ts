import {CommonHandlerContext, EvmBlock} from '@subsquid/evm-processor'
import {LogItem, TransactionItem} from '@subsquid/evm-processor/lib/interfaces/dataSelection'
import {BigNumber} from 'ethers'
import axios from 'axios'
import https from 'https'
import path from 'path'

import {Store} from '../db'
import {Owner, Token, Attribute} from '../model' // for typing only
import {EntityGenerator} from '../entityGenerator'
import * as spec from '../abi/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'
import {Multicall} from '../abi/multicall'
import {normalize} from '../util'

export {spec}

export const address = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'
export const multicallAddress = '0x5ba1e12693dc8f9c48aad8770482f4739beed696'
export const multicallBatchSize = 100

// maximal number of requests to the IPFS gateway per second
// Use a private gateway to increase the number and speed up
// the indexing
export const MAX_IPFS_REQ_SEC = 1
// replace with a private gateway to avoid rate limits and allow bigger MAX_IPFS_REQ_SEC
export const IPFS_GATEWAY = 'https://ipfs.filebase.io/ipfs/'

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
        EntityGenerator.setRawData('latestBlockHeader', block)
    }
    catch (error) {
        ctx.log.error({error, blockNumber: block.height, blockHash: block.hash, address}, `Unable to decode event "${item.evmLog.topics[0]}"`)
    }
}

export function addAllEntityGenerators() {
    EntityGenerator.setGenerationOrder([
        {
            name: 'Owner',
            generator: generatorOfOwners,
            persistWith: 'save'
        },
        {
            name: 'Token',
            generator: generatorOfTokens,
            extender: extenderOfTokens,
            persistWith: 'save'
        },
        {
            name: 'Transfer',
            generator: generatorOfTransfers,
            persistWith: 'insert'
        }
    ])
}

async function generatorOfOwners() {
    let rawTransfers: {from: string, to: string}[] = EntityGenerator.rawData['transferEvents']
    let ownerIds = rawTransfers.map(re => re.from).concat(
        rawTransfers.map(re => re.to)
    )
    let ownerIdsSet = new Set(ownerIds)
    return [...ownerIdsSet].map(id => ({ id }))
}

async function generatorOfTokens() {
    let partialTokens = new Map<string, {id: string, tokenId: number, owner: Owner}>()
    let rawTransfers: {tokenId: number, to: string}[] = EntityGenerator.rawData['transferEvents']
    rawTransfers.forEach(t => {
        let tokenIdStr = `${t.tokenId}`
        partialTokens.set(tokenIdStr, {
            id: tokenIdStr,
            tokenId: t.tokenId,
            owner: EntityGenerator.entities['Owner'].get(t.to)
        })
    })
    return [...partialTokens.values()]
}

async function extenderOfTokens(partials: any[], ctx: any) {
    let block = EntityGenerator.rawData.latestBlockHeader
    let multicallContract = new Multicall(ctx, block, multicallAddress)

    let tokenURIs = await multicallContract.aggregate(
        spec.functions.tokenURI,
        address,
        partials.map(t => [BigNumber.from(t.tokenId)]),
        multicallBatchSize // to prevent timeout we will use paggination
    )

    let metadatas: (TokenMetadata | undefined)[] = []
    for (let batch of splitIntoBatches(tokenURIs, MAX_IPFS_REQ_SEC)) {
        let m = await Promise.all(batch.map((uri, index) => {
            // spread out the requests evenly within a second interval
            return sleep(Math.ceil(1000*(index+1)/MAX_IPFS_REQ_SEC)).then(() => fetchTokenMetadata(ctx, uri))
        }))
        metadatas.push(...m)
    }

    return partials.map((p, i) => ({
        ...p,
        uri: tokenURIs[i],
        ...metadatas[i]
    }))
}

interface TokenMetadata {
    image: string
    attributes: Attribute[]
}

async function generatorOfTransfers() {
    let rawTransfers = EntityGenerator.rawData['transferEvents']
    return rawTransfers.map((t: any) => ({
        id: t.id,
        blockNumber: t.blockNumber,
        blockTimestamp: t.blockTimestamp,
        transactionHash: t.transactionHash,
        from: EntityGenerator.entities['Owner'].get(t.from),
        to: EntityGenerator.entities['Owner'].get(t.to),
        token: EntityGenerator.entities['Token'].get(`${t.tokenId}`)
    }))
}

//////////////////////////////
// IPFS fetching
/////////////////////////////

const client = axios.create({
    headers: {'Content-Type': 'application/json'},
    httpsAgent: new https.Agent({keepAlive: true}),
    transformResponse(res: string): TokenMetadata {
        let data: {image: string; attributes: {trait_type: string; value: string}[]} = JSON.parse(res)
        return {
            image: data.image,
            attributes: data.attributes.map((a) => new Attribute({traitType: a.trait_type, value: a.value})),
        }
    },
})

const ipfsRegExp = /^ipfs:\/\/(.+)$/

async function fetchTokenMetadata(ctx: any, uri: string): Promise<TokenMetadata | undefined> {
    try {
        if (uri.startsWith('ipfs://')) {
            const gatewayURL = path.posix.join(IPFS_GATEWAY, ipfsRegExp.exec(uri)![1])
            let res = await client.get(gatewayURL)
            ctx.log.info(`Successfully fetched metadata from ${gatewayURL}`)
            return res.data
        } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
            let res = await client.get(uri)
            ctx.log.info(`Successfully fetched metadata from ${uri}`)
            return res.data
        } else {
            ctx.log.warn(`Unexpected metadata URL protocol: ${uri}`)
            return undefined
        }
    } catch (e) {
        throw new Error(`failed to fetch metadata at ${uri}. Error: ${e}`)
    }
}

//////////////////////////////
// Utility functions
/////////////////////////////
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function* splitIntoBatches<T>(list: T[], maxBatchSize: number): Generator<T[]> {
    if (list.length <= maxBatchSize) {
        yield list
    } else {
        let offset = 0
        while (list.length - offset > maxBatchSize) {
            yield list.slice(offset, offset + maxBatchSize)
            offset += maxBatchSize
        }
        yield list.slice(offset)
    }
}
