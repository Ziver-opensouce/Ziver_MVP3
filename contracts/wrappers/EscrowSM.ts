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
    toNano
} from '@ton/core';

// --- Dictionary value resolvers ---
const dictionaryValueResolver = {
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

// --- Overall Contract Storage Data Type ---
export type EscrowSMData = {
    tasks: Dictionary<bigint, Cell>;
    ziverTreasuryAddress: Address;
    accumulatedFees: bigint;
};

// --- Opcodes ---
export const Opcodes = {
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
    static readonly code = Cell.fromBase64('te6ccgECIAEAA7QAAgE0BAEBAgGUAA4AART/APSkE/S88sgLAQIBIAIDAgEgBgcCASAKCwAYABhISEBAXv+ABwADgAsACgANAA4ACABG32omhAEGuQ641I41JvQC+78M8wAbBwwA49ma0DDsA49ma0DDsAgEgDA0AEb4AIBIBEQAgEgERIATvhAAm+EABc+EACf+EADBvhABE/4AIGH+EAFf+EACd8QAGf+EAAnfhAgAwNvbW1sZW50czogcmVwbGF5IGF0dGFjayBwcm90ZWN0aW9uDwAVCgFPINdJ0CDXMdAnIP8v/y8AINch0IGHINdJ0CHXMdAn1DDTAAkkAB8ADgAQABIAEAANADAAZgAnADEAOwA+ADUANgAzADkAECASAQDgAJvhi+EABfhi+EACf8QAMfhi+EACKn/FAAk4+EACaF+ECAAg8AcgAh8AcgAcf9QB+gD6APpA+gD6QB8A0/UAfTP/1AE1+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6APpA3gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6APpA3gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6QPsA+gD6QPpA+gD6QPpA+gD6APpA3gD6QPpA+gD6QPpA+gD6QPsA+gD6QPoA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AN4A+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6AfoA+gD6QPpA+gD6QPpA+gD6APoA+gD6QPpA+gD6QPpA+gD6APpA+kDd');

    static createFromAddress(address: Address) {
        return new EscrowSM(address);
    }

    static createDataCell(initialData: EscrowSMData): Cell {
        return beginCell()
            .storeDict(initialData.tasks)
            .storeAddress(initialData.ziverTreasuryAddress)
            .storeCoins(initialData.accumulatedFees)
            .endCell();
    }
    
    static async createFromConfig(initialData: EscrowSMData, workchain: number = 0) {
        const data = this.createDataCell(initialData);
        const init = { code: this.code, data };
        const address = contractAddress(workchain, init);
        return new EscrowSM(address, init);
    }

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendSetTaskDetails( provider: ContractProvider, via: Sender, opts: { taskId: bigint; paymentPerPerformerAmount: bigint; numberOfPerformersNeeded: bigint; taskDescriptionHash: bigint; taskGoalHash: bigint; expiryTimestamp: bigint; ziverFeePercentage: bigint; moderatorAddress: Address; value: bigint; queryID?: bigint; }) {
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

    async sendDepositFunds( provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint; }) {
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

    async sendVerifyTaskCompletion( provider: ContractProvider, via: Sender, opts: { taskId: bigint; performerAddress: Address; value: bigint; queryID?: bigint; }) {
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

    async sendSubmitProof( provider: ContractProvider, via: Sender, opts: { taskId: bigint; proofHash: bigint; value: bigint; queryID?: bigint; }) {
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

    async sendRaiseDispute( provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint; }) {
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

    async sendResolveDispute( provider: ContractProvider, via: Sender, opts: { taskId: bigint; winnerAddress: Address; value: bigint; queryID?: bigint; }) {
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

    async sendCancelTaskAndRefund( provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint; }) {
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

    async sendWithdrawFee( provider: ContractProvider, via: Sender, opts: { value: bigint; queryID?: bigint; }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEparately,
            body: beginCell()
                .storeUint(Opcodes.withdrawFee, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

    async sendExpireTask( provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint; }) {
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

    // --- Getter (get) Methods ---
    
    // THIS IS THE CORRECTED FUNCTION
    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        const result = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
        
        if (result.stack.remaining < 10) {
            return null;
        }
        
        const reader = result.stack;
        
        const taskPosterAddress = reader.readAddress();
        const paymentPerPerformerAmount = reader.readBigNumber();
        const numberOfPerformersNeeded = reader.readBigNumber();
        
        // FIX: Changed from .asDict() to .beginParse().loadDict()
        const performersCompletedCell = reader.readCellOpt();
        const performersCompleted = performersCompletedCell
            ? performersCompletedCell.beginParse().loadDict(Dictionary.Keys.BigUint(256), dictionaryValueResolver)
            : Dictionary.empty(Dictionary.Keys.BigUint(256), dictionaryValueResolver);
            
        const completedPerformersCount = reader.readBigNumber();
        const taskDescriptionHash = reader.readBigNumber();
        const taskGoalHash = reader.readBigNumber();
        const expiryTimestamp = reader.readBigNumber();
        const totalEscrowedFunds = reader.readBigNumber();
        const ziverFeePercentage = reader.readBigNumber();
        const moderatorAddress = reader.readAddress();
        const currentState = reader.readNumber();
        
        // FIX: Changed from .asDict() to .beginParse().loadDict()
        const proofSubmissionMapCell = reader.readCellOpt();
        const proofSubmissionMap = proofSubmissionMapCell
            ? proofSubmissionMapCell.beginParse().loadDict(Dictionary.Keys.BigUint(256), dictionaryValueResolver)
            : Dictionary.empty(Dictionary.Keys.BigUint(256), dictionaryValueResolver);
            
        const lastQueryId = reader.readBigNumber();
        
        return {
            taskId,
            taskPosterAddress,
            paymentPerPerformerAmount,
            numberOfPerformersNeeded,
            performersCompleted,
            completedPerformersCount,
            taskDescriptionHash,
            taskGoalHash,
            expiryTimestamp,
            totalEscrowedFunds,
            ziverFeePercentage,
            moderatorAddress,
            currentState,
            proofSubmissionMap,
            lastQueryId,
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
