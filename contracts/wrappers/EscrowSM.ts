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

// FIX 1: Corrected the file path to the types file.
export * from '../EscrowSM.types'; 
import { EscrowSMData, Opcodes, TaskDetails } from '../EscrowSM.types';

// FIX 2: Corrected the file path to the compiled contract.
import { EscrowSM as EscrowSMCompiled } from '../build/EscrowSM.compiled';

// --- Main Contract Wrapper ---
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

    // ... All send methods remain the same ...
    
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // --- Getter (get) Methods ---
    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        const result = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
        
        if (result.stack.remaining < 1) {
            return null;
        }

        const taskSlice = result.stack.readCell().beginParse();

        // FIX 3: Replaced all instances of .loadBigUint() with the correct method, .loadUintBig()
        return {
            taskPosterAddress: taskSlice.loadAddress(),
            paymentPerPerformerAmount: taskSlice.loadCoins(),
            numberOfPerformersNeeded: BigInt(taskSlice.loadUint(32)),
            performersCompleted: taskSlice.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
            completedPerformersCount: BigInt(taskSlice.loadUint(32)),
            taskDescriptionHash: taskSlice.loadUintBig(256), // Corrected
            taskGoalHash: taskSlice.loadUintBig(256),        // Corrected
            expiryTimestamp: taskSlice.loadUintBig(64),       // Corrected
            totalEscrowedFunds: taskSlice.loadCoins(),
            ziverFeePercentage: BigInt(taskSlice.loadUint(8)),
            moderatorAddress: taskSlice.loadAddress(),
            currentState: taskSlice.loadUint(8),
            proofSubmissionMap: taskSlice.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
            lastQueryId: taskSlice.loadUintBig(64),            // Corrected
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
