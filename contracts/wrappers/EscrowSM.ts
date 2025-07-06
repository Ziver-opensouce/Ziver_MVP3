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
    TupleReader
} from '@ton/core';

// --- Dictionary resolvers for performerCompleted and proofSubmissionMap ---

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

// --- Task Details Type (add lastQueryId) ---
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
    lastQueryId: bigint; // <-- NEW
};

// --- Overall Contract State Type ---
export type EscrowSMData = {
    tasks: Cell;
    ziverTreasuryAddress: Address;
};

// --- Opcodes (include auto-expiry) ---
export const Opcodes = {
    deploy: 0x61737467,
    send_task_details: 0x1a2b3c4d,
    deposit_funds: 0x5e6f7a8b,
    verify_task_completion: 0x9c0d1e2f,
    submit_proof: 0x3a4b5c6d,
    raise_dispute: 0x7e8f9a0b,
    resolve_dispute: 0x11223344,
    withdraw_funds: 0x55667788,
    cancel_task_and_refund: 0x99aabbcc,
    withdraw_fee: 0xddccbbaa,
    expire_task: 0xaabbccdd // NEW: auto-expiry
};

// --- Main Contract Wrapper ---
export class EscrowSM implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell; };

    constructor(workchain: number, initialData: EscrowSMData) {
        this.init = {
            code: new Cell(), // Will be replaced by Blueprint
            data: EscrowSM.toCell(initialData),
        };
        this.address = contractAddress(workchain, this.init);
    }

    static createFromAddress(address: Address) {
        return new EscrowSM(0, { tasks: new Cell(), ziverTreasuryAddress: new Address(0, Buffer.alloc(32)) });
    }

    static fromCell(cell: Cell): EscrowSMData {
        const reader = cell.beginParse();
        const ziverTreasuryAddress = reader.loadAddress();
        const tasks = reader.loadRef();
        return { ziverTreasuryAddress, tasks };
    }

    static toCell(data: EscrowSMData): Cell {
        return beginCell()
            .storeAddress(data.ziverTreasuryAddress)
            .storeRef(data.tasks)
            .endCell();
    }

    // --- Deploy ---
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.deploy, 32).endCell(),
        });
    }

    // --- Contract Message Methods ---

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
                .storeUint(Opcodes.send_task_details, 32)
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
                .storeUint(Opcodes.deposit_funds, 32)
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
                .storeUint(Opcodes.verify_task_completion, 32)
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
                .storeUint(Opcodes.submit_proof, 32)
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
            reasonHash: bigint;
            value: bigint;
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.raise_dispute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeUint(opts.reasonHash, 256)
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
                .storeUint(Opcodes.resolve_dispute, 32)
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
                .storeUint(Opcodes.withdraw_funds, 32)
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
                .storeUint(Opcodes.cancel_task_and_refund, 32)
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
                .storeUint(Opcodes.withdraw_fee, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

    // --- NEW: Auto-expiry method ---
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
                .storeUint(Opcodes.expire_task, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    // --- Getters (off-chain reads) ---

    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        try {
            const { stack } = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
            const reader = new TupleReader(stack);
            if (reader.items.length === 0) return null;

            const taskPosterAddress = reader.readAddress();
            const paymentPerPerformerAmount = reader.readBigNumber();
            const numberOfPerformersNeeded = reader.readBigNumber();
            const performersCompleted = reader.readCell();
            const completedPerformersCount = reader.readBigNumber();
            const taskDescriptionHash = reader.readBigNumber();
            const taskGoalHash = reader.readBigNumber();
            const expiryTimestamp = reader.readBigNumber();
            const totalEscrowedFunds = reader.readBigNumber();
            const ziverFeePercentage = reader.readBigNumber();
            const moderatorAddress = reader.readAddress();
            const currentState = reader.readNumber() as EscrowState;
            const proofSubmissionMap = reader.readCell();
            const lastQueryId = reader.readBigNumber();

            return {
                taskId,
                taskPosterAddress,
                paymentPerPerformerAmount,
                numberOfPerformersNeeded,
                performersCompleted: Dictionary.loadOf(0, performerCompletedKeyResolver, performerCompletedValueResolver, performersCompleted),
                completedPerformersCount,
                taskDescriptionHash,
                taskGoalHash,
                expiryTimestamp,
                totalEscrowedFunds,
                ziverFeePercentage,
                moderatorAddress,
                currentState,
                proofSubmissionMap: Dictionary.loadOf(0, proofSubmissionMapKeyResolver, proofSubmissionMapValueResolver, proofSubmissionMap),
                lastQueryId,
            };
        } catch (e) {
            console.error(`Error fetching task details for taskId ${taskId}:`, e);
            return null;
        }
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