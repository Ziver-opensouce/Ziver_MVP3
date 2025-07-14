// wrappers/EscrowSM.ts

import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary,
    TupleReader,
} from '@ton/core';
import { EscrowSMData, Opcodes, TaskDetails } from '../EscrowSM.types';
import EscrowSMCompiled from '../build/EscrowSM.compiled.json';

export function EscrowSMConfigToCell(config: EscrowSMData): Cell {
    return beginCell()
        .storeAddress(config.ziverTreasuryAddress)
        .storeDict(config.tasks)
        .storeCoins(config.accumulatedFees)
        .endCell();
}

export const EscrowSMCode = Cell.fromBoc(Buffer.from(EscrowSMCompiled.hex, 'hex'))[0];

export class EscrowSM implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new EscrowSM(address);
    }

    static createFromConfig(config: EscrowSMData, workchain = 0) {
        const data = EscrowSMConfigToCell(config);
        const init = { code: EscrowSMCode, data };
        return new EscrowSM(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

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
                .storeUint(Opcodes.sendTaskDetails, 32)
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
    
    // All other 'send' methods follow the same pattern
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

    // Getter methods
    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        const result = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
        
        function parseTuple(stack: TupleReader): TaskDetails | null {
            const taskPosterAddress = stack.readAddressOpt();
            if (!taskPosterAddress) return null;

            return {
                taskPosterAddress,
                paymentPerPerformerAmount: stack.readBigNumber(),
                numberOfPerformersNeeded: stack.readBigNumber(),
                performersCompleted: stack.readCell().beginParse().loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
                completedPerformersCount: stack.readBigNumber(),
                taskDescriptionHash: stack.readBigNumber(),
                taskGoalHash: stack.readBigNumber(),
                expiryTimestamp: stack.readBigNumber(),
                totalEscrowedFunds: stack.readBigNumber(),
                ziverFeePercentage: BigInt(stack.readNumber()),
                moderatorAddress: stack.readAddress(),
                currentState: stack.readNumber(),
                proofSubmissionMap: stack.readCell().beginParse().loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
                lastQueryId: stack.readBigNumber(),
            };
        }
        return parseTuple(result.stack);
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
