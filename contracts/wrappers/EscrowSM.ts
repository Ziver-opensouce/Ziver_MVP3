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
    toNano,
} from '@ton/core';
import { EscrowSMData, Opcodes, TaskDetails } from './EscrowSM.types';
import {-g-wrapped-esm-8340156-EscrowSM as EscrowSMCompiled} from '../build/EscrowSM.compiled';

// --- Main Contract Wrapper ---
export class EscrowSM implements Contract {
    static readonly code: Cell = Cell.fromBoc(Buffer.from(EscrowSMCompiled.hex, 'hex'))[0];

    static createFromAddress(address: Address) {
        return new EscrowSM(address);
    }

    // CRITICAL FIX: The order of storing data MUST match the order of loading in FunC.
    // load_data() expects: ziver_treasury_address, tasks_dict, accumulated_ziver_fees
    static createDataCell(initialData: EscrowSMData): Cell {
        return beginCell()
            .storeAddress(initialData.ziverTreasuryAddress) // 1. Address
            .storeDict(initialData.tasks)                 // 2. Dictionary
            .storeCoins(initialData.accumulatedFees)      // 3. Fees
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256 to match FunC
                .storeCoins(opts.paymentPerPerformerAmount)
                .storeUint(opts.numberOfPerformersNeeded, 8) // FIX: Changed from 32 to 8
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
                .endCell(),
        });
    }

    async sendWithdrawFee( provider: ContractProvider, via: Sender, opts: { value: bigint; queryID?: bigint; }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY, // FIX: Corrected typo
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
                .storeUint(opts.taskId, 256) // FIX: Changed from 64 to 256
                .endCell(),
        });
    }

    // --- Getter (get) Methods ---
    
    // THIS IS THE CORRECTED GETTER FUNCTION
    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        const result = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
        
        // Check if the task was found by looking at the stack depth
        if (result.stack.remaining < 1) {
            return null;
        }

        const taskSlice = result.stack.readCell().beginParse();

        // [Poster, Payment, N, PerfCompleted, PerfCount, DescHash, GoalHash, Expiry, Funds, Fee%, Mod, State, ProofMap, LastQueryId]
        return {
            taskPosterAddress: taskSlice.loadAddress(),
            paymentPerPerformerAmount: taskSlice.loadCoins(),
            numberOfPerformersNeeded: BigInt(taskSlice.loadUint(32)),
            performersCompleted: taskSlice.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
            completedPerformersCount: BigInt(taskSlice.loadUint(32)),
            taskDescriptionHash: taskSlice.loadBigUint(256),
            taskGoalHash: taskSlice.loadBigUint(256),
            expiryTimestamp: taskSlice.loadBigUint(64),
            totalEscrowedFunds: taskSlice.loadCoins(),
            ziverFeePercentage: BigInt(taskSlice.loadUint(8)),
            moderatorAddress: taskSlice.loadAddress(),
            currentState: taskSlice.loadUint(8),
            proofSubmissionMap: taskSlice.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
            lastQueryId: taskSlice.loadBigUint(64),
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
