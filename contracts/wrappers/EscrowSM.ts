import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';
import { EscrowSMData, Opcodes, TaskDetails } from '../EscrowSM.types';
import EscrowSMCompiled from '../build/EscrowSM.compiled.json';

export class EscrowSM implements Contract {
    static readonly code: Cell = Cell.fromBoc(Buffer.from(EscrowSMCompiled.hex, 'hex'))[0];

    static createFromAddress(address: Address) {
        return new EscrowSM(address);
    }

    static createDataCell(initialData: EscrowSMData): Cell {
        return beginCell()
            .storeAddress(initialData.ziverTreasuryAddress)
            .storeDict(initialData.tasks)
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

    // NOTE: Make sure Opcodes.setTaskDetails matches the value of op_send_task_details in your .fc file
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
        const detailsCell = beginCell()
            .storeUint(opts.taskId, 64)
            .storeCoins(opts.paymentPerPerformerAmount)
            .storeUint(opts.numberOfPerformersNeeded, 32)
            .storeUint(opts.taskDescriptionHash, 256)
            .storeUint(opts.taskGoalHash, 256)
            .storeUint(opts.expiryTimestamp, 64)
            .storeUint(opts.ziverFeePercentage, 8)
            .storeAddress(opts.moderatorAddress)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.setTaskDetails, 32) // This should be op_send_task_details
                .storeUint(opts.queryID ?? 0, 64)
                .storeRef(detailsCell)
                .endCell(),
        });
    }

    async sendDepositFunds(provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint }) {
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

    async sendVerifyTaskCompletion( provider: ContractProvider, via: Sender, opts: { taskId: bigint; performerAddress: Address; value: bigint; queryID?: bigint }) {
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

    async sendSubmitProof(provider: ContractProvider, via: Sender, opts: { taskId: bigint; proofHash: bigint; value: bigint; queryID?: bigint }) {
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

    async sendRaiseDispute(provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint }) {
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

    async sendResolveDispute(provider: ContractProvider, via: Sender, opts: { taskId: bigint; winnerAddress: Address; value: bigint; queryID?: bigint }) {
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

    async sendCancelTaskAndRefund(provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint }) {
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

    async sendWithdrawFee(provider: ContractProvider, via: Sender, opts: { value: bigint; queryID?: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawFee, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

    async sendExpireTask(provider: ContractProvider, via: Sender, opts: { taskId: bigint; value: bigint; queryID?: bigint }) {
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

        // FIX: Use readAddressOpt() to handle the case where the task is not found and the address is null.
        const taskPosterAddress = result.stack.readAddressOpt();
        if (!taskPosterAddress) {
            return null; // Task not found
        }
        
        const performersCompletedDict = result.stack.readCellOpt();
        const proofSubmissionMapDict = result.stack.readCellOpt();

        return {
            taskPosterAddress: taskPosterAddress,
            paymentPerPerformerAmount: result.stack.readBigNumber(),
            numberOfPerformersNeeded: result.stack.readBigNumber(),
            performersCompleted: performersCompletedDict 
                ? Dictionary.loadDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), performersCompletedDict)
                : Dictionary.empty(),
            completedPerformersCount: result.stack.readBigNumber(),
            taskDescriptionHash: result.stack.readBigNumber(),
            taskGoalHash: result.stack.readBigNumber(),
            expiryTimestamp: result.stack.readBigNumber(),
            totalEscrowedFunds: result.stack.readBigNumber(),
            ziverFeePercentage: BigInt(result.stack.readNumber()),
            moderatorAddress: result.stack.readAddress(),
            currentState: result.stack.readNumber(),
            proofSubmissionMap: proofSubmissionMapDict
                ? Dictionary.loadDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), proofSubmissionMapDict)
                : Dictionary.empty(),
            lastQueryId: result.stack.readBigNumber(),
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
