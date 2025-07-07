import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    Slice,
    TupleReader,
    toNano // It's good practice to have this for getters that might return amounts
} from '@ton/core';

// --- Dictionary resolvers for performerCompleted and proofSubmissionMap ---
// (Your resolvers are fine, no changes needed here)
const performerCompletedKeyResolver = {
    serialize: (src: bigint, builder: Builder) => { builder.storeUint(src, 256); },
    parse: (src: Slice) => src.loadUint(256)
};
const performerCompletedValueResolver = {
    serialize: (src: Cell, builder: Builder) => { builder.storeRef(src); },
    parse: (src: Slice) => src.loadRef()
};
const proofSubmissionMapKeyResolver = {
    serialize: (src: bigint, builder: Builder) => { builder.storeUint(src, 256); },
    parse: (src: Slice) => src.loadUint(256)
};
const proofSubmissionMapValueResolver = {
    serialize: (src: Cell, builder: Builder) => { builder.storeRef(src); },
    parse: (src: Slice) => src.loadRef()
};


// --- Escrow State Enum ---
export enum EscrowState {
    Idle = 0,
    TaskSetAndFundsPending = 1,
    Active = 2,
    PendingVerification = 3,
    Settled = 4,
    Disputed = 5,
    Expired = 6,
    Refunded = 7,
}

// --- Task Details Type ---
export type TaskDetails = {
    taskId: bigint;
    taskPosterAddress: Address;
    paymentPerPerformerAmount: bigint;
    numberOfPerformersNeeded: bigint;
    performersCompleted: Dictionary<bigint, Cell>;
    completedPerformersCount: bigint;
    taskDescriptionHash: bigint;
    taskGoalHash: bigint;
    expiryTimestamp: bigint;
    totalEscrowedFunds: bigint;
    ziverFeePercentage: bigint;
    moderatorAddress: Address;
    currentState: EscrowState;
    proofSubmissionMap: Dictionary<bigint, Cell>;
    lastQueryId: bigint;
};

// --- Overall Contract State Type ---
export type EscrowSMData = {
    tasks: Dictionary<bigint, Cell>; // Use the Dictionary type for clarity
    ziverTreasuryAddress: Address;
};

// --- Opcodes ---
export const Opcodes = {
    //deploy: 0x61737467, // Deploy doesn't need a specific opcode in the body
    setTaskDetails: 0x1a2b3c4d,
    depositFunds: 0x5e6f7a8b,
    verifyTaskCompletion: 0x9c0d1e2f,
    submitProof: 0x3a4b5c6d,
    raiseDispute: 0x7e8f9a0b,
    resolveDispute: 0x11223344,
    withdrawFunds: 0x55667788,
    cancelTaskAndRefund: 0x99aabbcc,
    withdrawFee: 0xddccbbaa,
    expireTask: 0xaabbccdd
};

// --- Main Contract Wrapper ---
export class EscrowSM implements Contract {
    // ==================================================================
    // START OF CORRECTED SECTION
    // ==================================================================
    
    // Use the compiled code from your build folder
    static readonly code = Cell.fromBase64('te6ccgECIAEAA7QAAgE0BAEBAgGUAA4AART/APSkE/S88sgLAQIBIAIDAgEgBgcCASAKCwAYABhISEBAXv+ABwADgAsACgANAA4ACABG32omhAEGuQ641I41JvQC+78M8wAbBwwA49ma0DDsA49ma0DDsAgEgDA0AEb4AIBIBEQAgEgERIATvhAAm+EABc+EACf+EADBvhABE/4AIGH+EAFf+EACd8QAGf+EAAnfhAgAwNvbW1sZW50czogcmVwbGF5IGF0dGFjayBwcm90ZWN0aW9uDwAVCgFPINdJ0CDXMdAnIP8v/y8AINch0IGHINdJ0CHXMdAn1DDTAAkkAB8ADgAQABIAEAANADAAZgAnADEAOwA+ADUANgAzADkAECASAQDgAJvhi+EABfhi+EACf8QAMfhi+EACKn/FAAk4+EACaF+ECAAg8AcgAh8AcgAcf9QB+gD6APpA+gD6QB8A0/UAfTP/1AE1+gD6QPpA+gD6QPoA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6APpA3gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6APpA3gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6APpA3gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6APoA+gD6QPpA+gD6QPpA+gD6APpA+kDd');

    static createFromAddress(address: Address) {
        return new EscrowSM(address);
    }

    static async fromInit(initialData: EscrowSMData) {
        const data = beginCell()
            .storeDict(initialData.tasks)
            .storeAddress(initialData.ziverTreasuryAddress)
            .endCell();
        const init = { code: this.code, data };
        return new EscrowSM(contractAddress(0, init), init);
    }
    
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    // ==================================================================
    // END OF CORRECTED SECTION
    // ==================================================================


    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(), // Deploy body is typically empty
        });
    }

    // --- Contract Message Methods ---
    // (The rest of your send... and get... methods are correct and do not need changes)
    
    async sendSetTaskDetails(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            paymentPerPerformerAmount: bigint;
            numberOfPerformersNeeded: bigint;
            taskDescriptionHash: bigint;
            taskGoalHash: bigint;
            expiryTimestamp: bigint;
            ziverFeePercentage: bigint;
            moderatorAddress: Address;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.setTaskDetails, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeCoins(opts.paymentPerPerformerAmount)
                .storeUint(opts.numberOfPerformersNeeded, 32)
                .storeUint(opts.taskDescriptionHash, 256)
                .storeUint(opts.taskGoalHash, 256)
                .storeUint(opts.expiryTimestamp, 64)
                .storeUint(opts.ziverFeePercentage, 8)
                .storeAddress(opts.moderatorAddress)
                .endCell(),
        });
    }

    // ... [ The rest of your send... and get... methods go here unchanged ]
    async sendDepositFunds(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.depositFunds, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    async sendVerifyTaskCompletion(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            performerAddress: Address;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.verifyTaskCompletion, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeAddress(opts.performerAddress)
                .endCell(),
        });
    }

    async sendSubmitProof(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            proofHash: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.submitProof, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeUint(opts.proofHash, 256)
                .endCell(),
        });
    }

    async sendRaiseDispute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.raiseDispute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    async sendResolveDispute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            winnerAddress: Address;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.resolveDispute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeAddress(opts.winnerAddress)
                .endCell(),
        });
    }

    async sendWithdrawFunds(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawFunds, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    async sendCancelTaskAndRefund(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.cancelTaskAndRefund, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    async sendWithdrawFee(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawFee, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

    async sendExpireTask(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.expireTask, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        const result = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
        // Add robust parsing to avoid crashes on empty results
        if (result.stack.remaining === 0) {
            return null;
        }
        const reader = result.stack;
        
        return {
            taskId: taskId,
            taskPosterAddress: reader.readAddress(),
            paymentPerPerformerAmount: reader.readBigNumber(),
            numberOfPerformersNeeded: reader.readBigNumber(),
            performersCompleted: reader.readCell().asDict(performerCompletedKeyResolver, performerCompletedValueResolver),
            completedPerformersCount: reader.readBigNumber(),
            taskDescriptionHash: reader.readBigNumber(),
            taskGoalHash: reader.readBigNumber(),
            expiryTimestamp: reader.readBigNumber(),
            totalEscrowedFunds: reader.readBigNumber(),
            ziverFeePercentage: reader.readBigNumber(),
            moderatorAddress: reader.readAddress(),
            currentState: reader.readNumber(),
            proofSubmissionMap: reader.readCell().asDict(proofSubmissionMapKeyResolver, proofSubmissionMapValueResolver),
            lastQueryId: reader.readBigNumber(),
        };
    }
    
    async getZiverTreasuryAddress(provider: ContractProvider): Promise<Address> {
        const { stack } = await provider.get('get_ziver_treasury_address', []);
        return stack.readAddress();
    }
    
    async getAccumulatedFees(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_accumulated_fees', []);
        return stack.readBigNumber();
    }
}

