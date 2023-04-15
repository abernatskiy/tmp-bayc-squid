import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, ManyToOne as ManyToOne_} from "typeorm"
import {Owner} from "./owner.model"
import {Token} from "./token.model"

@Entity_()
export class Transfer {
    constructor(props?: Partial<Transfer>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @Column_("int4", {nullable: false})
    blockNumber!: number

    @Index_()
    @Column_("timestamp with time zone", {nullable: false})
    blockTimestamp!: Date

    @Index_()
    @Column_("text", {nullable: false})
    transactionHash!: string

    @Index_()
    @ManyToOne_(() => Owner, {nullable: true})
    from!: Owner

    @Index_()
    @ManyToOne_(() => Owner, {nullable: true})
    to!: Owner

    @Index_()
    @ManyToOne_(() => Token, {nullable: true})
    token!: Token
}
